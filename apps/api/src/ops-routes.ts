import {Hono,type Context} from 'hono';
import {z} from 'zod';
import type {Pool} from 'pg';
import {canAny,type Role} from './authorization.js';
import {geoEventSchema} from './geo-events.js';
import {BusinessFailure,inTransaction,recordEvent,requireRow,respondError} from './ops-db.js';
import {validateBatchYield} from './workflow.js';
type Env={Variables:{userId:string;organizationId:string;roles:Role[]}};
const uuid=z.string().uuid();
const weight=z.number().int().positive().max(1_000_000_000);
const event=geoEventSchema;
const withEvent=<T extends z.ZodRawShape>(shape:T)=>z.object({...shape,event});
const supplierSchema=withEvent({name:z.string().trim().min(2).max(150)});
const purchaseSchema=withEvent({supplierId:uuid});
const receiveSchema=withEvent({vegetableId:uuid,receivedGrams:weight,usableGrams:z.number().int().nonnegative(),rejectedGrams:z.number().int().nonnegative(),supplierLot:z.string().max(100).optional()});
const batchSchema=withEvent({orderId:uuid,variantId:uuid,rawLotId:uuid,inputGrams:weight});
const yieldSchema=withEvent({outputGrams:z.number().int().nonnegative(),wasteGrams:z.number().int().nonnegative()});
const qcSchema=withEvent({passed:z.boolean(),findings:z.string().trim().min(3).max(800),temperatureC:z.number().finite().min(-40).max(100).optional()});
const packSchema=withEvent({netGrams:weight,labelCode:z.string().trim().min(3).max(100),useBy:z.string().datetime({offset:true})});
const runSchema=withEvent({slotId:uuid,deliveryDate:z.string().date(),driverId:uuid});
const stopSchema=withEvent({orderId:uuid,stopNumber:z.number().int().positive().max(1000)});
const podSchema=withEvent({receivedBy:z.string().trim().min(2).max(120),notes:z.string().trim().max(400).optional()});
function requirePermission(c:Context<Env>,permission:string){
 if(!canAny(c.get('roles'),permission))throw new BusinessFailure(403,'Permission denied');
}
async function body<T extends z.ZodTypeAny>(c:Context<Env>,schema:T):Promise<z.infer<T>>{
 const input=await c.req.json().catch(()=>null);
 const result=schema.safeParse(input);
 if(!result.success)throw new BusinessFailure(400,'Invalid request: '+result.error.issues.map(i=>i.path.join('.')).join(', '));
 return result.data;
}
function idParam(c:Context<Env>):string{
 return uuid.parse(c.req.param('id'));
}
export function createOperationsRoutes(pool:Pool){
 const app=new Hono<Env>();
 app.onError((err,c)=>{
  const e=respondError(err);
  if(e.status===500)console.error('Operational API error',err);
  return c.json({error:e.message},e.status);
 });
 app.get('/ops/summary',async c=>{
  requirePermission(c,'orders:read');
  const org=c.get('organizationId');
  const [orders,batches,deliveries]=await Promise.all([
   pool.query(`SELECT state,count(*)::int AS count FROM orders WHERE producer_organization_id=$1 GROUP BY state`,[org]),
   pool.query(`SELECT pb.state,count(*)::int AS count FROM production_batches pb JOIN orders o ON o.id=pb.order_id WHERE o.producer_organization_id=$1 GROUP BY pb.state`,[org]),
   pool.query(`SELECT dr.status,count(*)::int AS count FROM delivery_runs dr WHERE producer_organization_id=$1 GROUP BY dr.status`,[org])
  ]);
  return c.json({orders:orders.rows,batches:batches.rows,deliveries:deliveries.rows});
 });
 app.get('/ops/orders',async c=>{
  requirePermission(c,'orders:read');
  const q=await pool.query(`SELECT id,organization_id,kitchen_id,delivery_date,slot_id,state,created_at
   FROM orders WHERE producer_organization_id=$1 ORDER BY delivery_date DESC,created_at DESC LIMIT 200`,[c.get('organizationId')]);
  return c.json(q.rows);
 });
 app.get('/ops/batches',async c=>{
  if(!canAny(c.get('roles'),'production:read')&&!canAny(c.get('roles'),'qc:read')&&!canAny(c.get('roles'),'packing:read'))throw new BusinessFailure(403,'Permission denied');
  const q=await pool.query(`SELECT pb.id,pb.order_id,pb.variant_id,pb.raw_lot_id,pb.state,pb.input_grams,pb.output_grams,pb.waste_grams
    FROM production_batches pb JOIN orders o ON o.id=pb.order_id
    WHERE o.producer_organization_id=$1 ORDER BY pb.id DESC LIMIT 200`,[c.get('organizationId')]);
  return c.json(q.rows);
 });
 app.get('/ops/runs',async c=>{
  if(!canAny(c.get('roles'),'delivery:read')&&!canAny(c.get('roles'),'delivery:assigned'))throw new BusinessFailure(403,'Permission denied');
  const driverOnly=!canAny(c.get('roles'),'delivery:read');
  const q=await pool.query(`SELECT id,driver_id,slot_id,delivery_date,status FROM delivery_runs
   WHERE producer_organization_id=$1 AND ($2::boolean=false OR driver_id=$3) ORDER BY delivery_date DESC LIMIT 100`,
   [c.get('organizationId'),driverOnly,c.get('userId')]);
  return c.json(q.rows);
 });
 app.get('/ops/audit',async c=>{
  requirePermission(c,'audit:read');
  const q=await pool.query(`SELECT id,event_type,subject_type,subject_id,source,occurred_at,
   CASE WHEN source='DEVICE_GPS' THEN accuracy_meters ELSE NULL END AS accuracy_meters
   FROM event_log WHERE organization_id=$1 ORDER BY occurred_at DESC LIMIT 100`,[c.get('organizationId')]);
  return c.json(q.rows);
 });
 app.post('/ops/suppliers',async c=>{
  requirePermission(c,'procurement:write');
  const input=await body(c,supplierSchema);
  const value=await inTransaction(pool,async tx=>{
   const r=await tx.query<{id:string}>('INSERT INTO suppliers(organization_id,name) VALUES($1,$2) RETURNING id',[c.get('organizationId'),input.name]);
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),input.event,'SUPPLIER_CREATED','SUPPLIER',r.rows[0].id);
   return r.rows[0];
  });
  return c.json(value,201);
 });
 app.post('/ops/purchases',async c=>{
  requirePermission(c,'procurement:write');
  const input=await body(c,purchaseSchema);
  const data=await inTransaction(pool,async tx=>{
   requireRow((await tx.query('SELECT id FROM suppliers WHERE id=$1 AND organization_id=$2 AND active=true',
    [input.supplierId,c.get('organizationId')])).rows);
   const r=await tx.query<{id:string}>('INSERT INTO purchase_orders(supplier_id,organization_id,status) VALUES($1,$2,\'APPROVED\') RETURNING id',
     [input.supplierId,c.get('organizationId')]);
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),input.event,'PURCHASE_ORDER_CREATED','PURCHASE',r.rows[0].id);
   return r.rows[0];
  });
  return c.json(data,201);
 });
 app.post('/ops/purchases/:id/receive',async c=>{
  if(!canAny(c.get('roles'),'procurement:write')&&!canAny(c.get('roles'),'inventory:write'))throw new BusinessFailure(403,'Permission denied');
  const input=await body(c,receiveSchema);
  if(input.usableGrams+input.rejectedGrams>input.receivedGrams)throw new BusinessFailure(422,'Received weight does not reconcile');
  const data=await inTransaction(pool,async tx=>{
   const purchase=requireRow((await tx.query<{status:string}>('SELECT status FROM purchase_orders WHERE id=$1 AND organization_id=$2 FOR UPDATE',
    [idParam(c),c.get('organizationId')])).rows);
   if(purchase.status!=='APPROVED'&&purchase.status!=='RECEIVED')throw new BusinessFailure(409,'Purchase is not approved');
   requireRow((await tx.query('SELECT id FROM vegetables WHERE id=$1 AND active=true',[input.vegetableId])).rows);
   const r=await tx.query<{id:string}>(`INSERT INTO raw_lots(purchase_id,vegetable_id,supplier_lot,received_grams,usable_grams,rejected_grams)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[idParam(c),input.vegetableId,input.supplierLot??null,input.receivedGrams,input.usableGrams,input.rejectedGrams]);
   const eventId=await recordEvent(tx,c.get('organizationId'),c.get('userId'),input.event,'RAW_LOT_RECEIVED','RAW_LOT',r.rows[0].id);
   await tx.query(`INSERT INTO inventory_movements(raw_lot_id,movement_kind,delta_grams,actor_id,event_id)
     VALUES($1,'RECEIVE',$2,$3,$4)`,[r.rows[0].id,input.usableGrams,c.get('userId'),eventId]);
   await tx.query('UPDATE purchase_orders SET status=\'RECEIVED\' WHERE id=$1',[idParam(c)]);
   return r.rows[0];
  });
  return c.json(data,201);
 });
 app.post('/ops/batches',async c=>{
  requirePermission(c,'production:write');
  const input=await body(c,batchSchema);
  const data=await inTransaction(pool,async tx=>{
   const order=requireRow((await tx.query<{state:string}>(`SELECT state FROM orders WHERE id=$1 AND producer_organization_id=$2 FOR UPDATE`,[input.orderId,c.get('organizationId')])).rows);
   if(!['CONFIRMED','IN_PRODUCTION'].includes(order.state))throw new BusinessFailure(409,'Order cannot enter production');
   requireRow((await tx.query('SELECT 1 FROM order_items WHERE order_id=$1 AND variant_id=$2',[input.orderId,input.variantId])).rows,'Variant not on order');
   const raw=requireRow((await tx.query<{usable_grams:string;vegetable_id:string}>(`SELECT rl.usable_grams::text,rl.vegetable_id FROM raw_lots rl
    JOIN purchase_orders po ON po.id=rl.purchase_id WHERE rl.id=$1 AND po.organization_id=$2 FOR UPDATE OF rl`,
    [input.rawLotId,c.get('organizationId')])).rows,'Raw lot unavailable');
   const veg=requireRow((await tx.query<{vegetable_id:string}>('SELECT vegetable_id FROM product_variants WHERE id=$1',[input.variantId])).rows);
   if(raw.vegetable_id!==veg.vegetable_id)throw new BusinessFailure(422,'Raw vegetable does not match requested preparation');
   if(BigInt(raw.usable_grams)<BigInt(input.inputGrams))throw new BusinessFailure(409,'Insufficient lot balance');
   const r=await tx.query<{id:string}>(`INSERT INTO production_batches(order_id,variant_id,raw_lot_id,input_grams,state,started_at)
     VALUES($1,$2,$3,$4,'PROCESSING',now()) RETURNING id`,[input.orderId,input.variantId,input.rawLotId,input.inputGrams]);
   await tx.query('UPDATE raw_lots SET usable_grams=usable_grams-$2 WHERE id=$1',[input.rawLotId,input.inputGrams]);
   const eventId=await recordEvent(tx,c.get('organizationId'),c.get('userId'),input.event,'PRODUCTION_BATCH_STARTED','BATCH',r.rows[0].id);
   await tx.query(`INSERT INTO inventory_movements(raw_lot_id,batch_id,movement_kind,delta_grams,actor_id,event_id)
      VALUES($1,$2,'CONSUME',$3,$4,$5)`,[input.rawLotId,r.rows[0].id,-input.inputGrams,c.get('userId'),eventId]);
   if(order.state==='CONFIRMED')await tx.query('UPDATE orders SET state=\'IN_PRODUCTION\' WHERE id=$1',[input.orderId]);
   return r.rows[0];
  });
  return c.json(data,201);
 });
 app.post('/ops/batches/:id/complete',async c=>{
  requirePermission(c,'production:write');
  const input=await body(c,yieldSchema);
  const value=await inTransaction(pool,async tx=>{
   const batch=requireRow((await tx.query<{state:string;input_grams:string;order_id:string}>(`SELECT pb.state,pb.input_grams::text,pb.order_id
     FROM production_batches pb JOIN orders o ON o.id=pb.order_id
     WHERE pb.id=$1 AND o.producer_organization_id=$2 FOR UPDATE OF pb`,[idParam(c),c.get('organizationId')])).rows);
   if(batch.state!=='PROCESSING')throw new BusinessFailure(409,'Batch not in processing');
   if(!validateBatchYield(Number(batch.input_grams),input.outputGrams,input.wasteGrams))throw new BusinessFailure(422,'Batch yield does not reconcile');
   await tx.query(`UPDATE production_batches SET output_grams=$2,waste_grams=$3,state='AWAITING_QC',completed_at=now() WHERE id=$1`,
      [idParam(c),input.outputGrams,input.wasteGrams]);
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),input.event,'PRODUCTION_BATCH_COMPLETED','BATCH',idParam(c));
   return {id:idParam(c),state:'AWAITING_QC'};
  });
  return c.json(value);
 });
 app.post('/ops/batches/:id/qc',async c=>{
  requirePermission(c,'qc:approve');
  const input=await body(c,qcSchema);
  const data=await inTransaction(pool,async tx=>{
   const batch=requireRow((await tx.query<{state:string;order_id:string}>(`SELECT pb.state,pb.order_id FROM production_batches pb JOIN orders o ON o.id=pb.order_id
     WHERE pb.id=$1 AND o.producer_organization_id=$2 FOR UPDATE OF pb`,[idParam(c),c.get('organizationId')])).rows);
   if(batch.state!=='AWAITING_QC')throw new BusinessFailure(409,'Batch not awaiting QC');
   const qr=await tx.query<{id:string}>(`INSERT INTO qc_checks(batch_id,inspector_id,passed,findings,measured_temperature_c)
    VALUES($1,$2,$3,$4,$5) RETURNING id`,[idParam(c),c.get('userId'),input.passed,input.findings,input.temperatureC??null]);
   await tx.query('UPDATE production_batches SET state=$2 WHERE id=$1',[idParam(c),input.passed?'QC_PASSED':'QC_FAILED']);
   if(!input.passed)await tx.query("UPDATE orders SET state='EXCEPTION' WHERE id=$1",[batch.order_id]);
   else{
    const ready=await tx.query<{ready:boolean}>(`SELECT NOT EXISTS(
     SELECT 1 FROM order_items oi WHERE oi.order_id=$1 AND
     COALESCE((SELECT SUM(pb.output_grams) FROM production_batches pb
      WHERE pb.order_id=oi.order_id AND pb.variant_id=oi.variant_id AND pb.state='QC_PASSED'),0)<oi.grams
    ) AS ready`,[batch.order_id]);
    if(ready.rows[0].ready)await tx.query("UPDATE orders SET state='QC_PASSED' WHERE id=$1 AND state='IN_PRODUCTION'",[batch.order_id]);
   }
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),input.event,'QC_CHECK_RECORDED','QC_CHECK',qr.rows[0].id);
   return {id:qr.rows[0].id,passed:input.passed};
  });
  return c.json(data,201);
 });
 app.post('/ops/batches/:id/pack',async c=>{
  requirePermission(c,'packing:write');
  const input=await body(c,packSchema);
  if(new Date(input.useBy).getTime()<=Date.now())throw new BusinessFailure(422,'Use-by must be in the future');
  const data=await inTransaction(pool,async tx=>{
   const batch=requireRow((await tx.query<{state:string;order_id:string;output_grams:string}>(`SELECT pb.state,pb.order_id,pb.output_grams::text FROM production_batches pb
    JOIN orders o ON o.id=pb.order_id WHERE pb.id=$1 AND o.producer_organization_id=$2 FOR UPDATE OF pb`,
    [idParam(c),c.get('organizationId')])).rows);
   if(!['QC_PASSED','PACKED'].includes(batch.state))throw new BusinessFailure(409,'Cannot pack before approved QC');
   const prev=await tx.query<{total:string}>('SELECT COALESCE(SUM(net_grams),0)::text AS total FROM pack_units WHERE batch_id=$1',[idParam(c)]);
   const total=BigInt(prev.rows[0].total)+BigInt(input.netGrams);
   if(total>BigInt(batch.output_grams))throw new BusinessFailure(422,'Packed quantity exceeds approved output');
   const r=await tx.query<{id:string}>(`INSERT INTO pack_units(batch_id,order_id,net_grams,use_by,label_code)
    VALUES($1,$2,$3,$4,$5) RETURNING id`,[idParam(c),batch.order_id,input.netGrams,input.useBy,input.labelCode]);
   await tx.query("UPDATE production_batches SET state='PACKED' WHERE id=$1",[idParam(c)]);
   const status=await tx.query<{ready:boolean}>(`SELECT NOT EXISTS(
     SELECT 1 FROM order_items oi WHERE oi.order_id=$1 AND
     COALESCE((SELECT SUM(pu.net_grams) FROM pack_units pu JOIN production_batches pb ON pb.id=pu.batch_id
       WHERE pb.order_id=oi.order_id AND pb.variant_id=oi.variant_id),0)<oi.grams
     ) AS ready`,[batch.order_id]);
   if(status.rows[0].ready)await tx.query("UPDATE orders SET state='PACKED' WHERE id=$1 AND state='QC_PASSED'",[batch.order_id]);
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),input.event,'PACK_UNIT_CREATED','PACK_UNIT',r.rows[0].id);
   return r.rows[0];
  });
  return c.json(data,201);
 });
 app.post('/ops/runs',async c=>{
  requirePermission(c,'delivery:assign');
  const input=await body(c,runSchema);
  const data=await inTransaction(pool,async tx=>{
   requireRow((await tx.query(`SELECT 1 FROM memberships WHERE user_id=$1 AND organization_id=$2 AND role='DRIVER'`,
      [input.driverId,c.get('organizationId')])).rows,'Driver is not assigned to this organization');
   requireRow((await tx.query('SELECT id FROM delivery_slots WHERE id=$1 AND active=true',[input.slotId])).rows);
   const r=await tx.query<{id:string}>(`INSERT INTO delivery_runs(producer_organization_id,slot_id,delivery_date,driver_id)
     VALUES($1,$2,$3::date,$4) RETURNING id`,[c.get('organizationId'),input.slotId,input.deliveryDate,input.driverId]);
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),input.event,'DELIVERY_RUN_CREATED','DELIVERY_RUN',r.rows[0].id);
   return r.rows[0];
  });
  return c.json(data,201);
 });
 app.post('/ops/runs/:id/stops',async c=>{
  requirePermission(c,'delivery:assign');
  const input=await body(c,stopSchema);
  const data=await inTransaction(pool,async tx=>{
   const run=requireRow((await tx.query<{slot_id:string;delivery_date:string;status:string}>(`SELECT slot_id,delivery_date::text,status FROM delivery_runs
      WHERE id=$1 AND producer_organization_id=$2 FOR UPDATE`,[idParam(c),c.get('organizationId')])).rows);
   if(!['PLANNED','LOADING'].includes(run.status))throw new BusinessFailure(409,'Delivery run cannot accept stops');
   const order=requireRow((await tx.query<{state:string;slot_id:string;delivery_date:string}>(`SELECT state,slot_id,delivery_date::text
      FROM orders WHERE id=$1 AND producer_organization_id=$2 FOR UPDATE`,[input.orderId,c.get('organizationId')])).rows);
   if(order.state!=='PACKED'||order.slot_id!==run.slot_id||order.delivery_date!==run.delivery_date)
    throw new BusinessFailure(409,'Order not packed or slot/date mismatch');
   const s=await tx.query<{id:string}>(`INSERT INTO delivery_stops(run_id,order_id,stop_number)
     VALUES($1,$2,$3) RETURNING id`,[idParam(c),input.orderId,input.stopNumber]);
   await tx.query("UPDATE orders SET state='DISPATCHED' WHERE id=$1",[input.orderId]);
   await tx.query("UPDATE delivery_runs SET status='LOADING' WHERE id=$1",[idParam(c)]);
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),input.event,'DELIVERY_STOP_ASSIGNED','DELIVERY_STOP',s.rows[0].id);
   return s.rows[0];
  });
  return c.json(data,201);
 });
 app.post('/ops/stops/:id/complete',async c=>{
  requirePermission(c,'delivery:pod');
  const input=await body(c,podSchema);
  const data=await inTransaction(pool,async tx=>{
   const stop=requireRow((await tx.query<{status:string;order_id:string;driver_id:string}>(`SELECT ds.status,ds.order_id,dr.driver_id
      FROM delivery_stops ds JOIN delivery_runs dr ON dr.id=ds.run_id
      WHERE ds.id=$1 AND dr.producer_organization_id=$2 FOR UPDATE OF ds`,[idParam(c),c.get('organizationId')])).rows);
   if(stop.driver_id!==c.get('userId'))throw new BusinessFailure(403,'Only the assigned driver can confirm delivery');
   if(!['PENDING','ARRIVED'].includes(stop.status))throw new BusinessFailure(409,'Delivery stop already finalised');
   const eventId=await recordEvent(tx,c.get('organizationId'),c.get('userId'),input.event,'DELIVERY_POD_CAPTURED','DELIVERY_STOP',idParam(c));
   const proof=await tx.query<{id:string}>(`INSERT INTO delivery_proofs(stop_id,received_by,received_at,event_id,note)
     VALUES($1,$2,now(),$3,$4) RETURNING id`,[idParam(c),input.receivedBy,eventId,input.notes??null]);
   await tx.query("UPDATE delivery_stops SET status='DELIVERED',completed_at=now() WHERE id=$1",[idParam(c)]);
   await tx.query("UPDATE orders SET state='DELIVERED' WHERE id=$1 AND state='DISPATCHED'",[stop.order_id]);
   return {proofId:proof.rows[0].id,orderId:stop.order_id};
  });
  return c.json(data,201);
 });
 return app;
}
