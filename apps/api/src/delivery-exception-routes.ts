import {Hono,type Context} from 'hono';
import {z} from 'zod';
import type {Pool} from 'pg';
import {canAny,type Role} from './authorization.js';
import {geoEventSchema} from './geo-events.js';
import {BusinessFailure,inTransaction,recordEvent,requireRow,respondError} from './ops-db.js';
import {notifyOrganization} from './notification-service.js';

type Env={Variables:{userId:string;organizationId:string;roles:Role[]}};
const uuid=z.string().uuid();
const attemptSchema=z.object({
 outcome:z.enum(['FAILED','PARTIAL']),
 reasonCode:z.enum(['CUSTOMER_UNAVAILABLE','ADDRESS_NOT_FOUND','ACCESS_BLOCKED','VEHICLE_ISSUE','ITEM_SHORTAGE','CUSTOMER_REFUSED','OTHER']),
 notes:z.string().trim().min(5).max(600),
 deliveredGrams:z.number().int().nonnegative().max(1_000_000_000).default(0),
 event:geoEventSchema
}).superRefine((v,ctx)=>{
 if(v.outcome==='FAILED'&&v.deliveredGrams!==0)ctx.addIssue({code:'custom',path:['deliveredGrams'],message:'Failed delivery cannot record delivered quantity'});
 if(v.outcome==='PARTIAL'&&v.deliveredGrams<=0)ctx.addIssue({code:'custom',path:['deliveredGrams'],message:'Partial delivery requires a positive delivered quantity'});
});
const retrySchema=z.object({notes:z.string().trim().min(5).max(400),event:geoEventSchema});
function permission(c:Context<Env>,name:string){
 if(!canAny(c.get('roles'),name))throw new BusinessFailure(403,'Permission denied');
}
function id(c:Context<Env>){
 const value=uuid.safeParse(c.req.param('id'));
 if(!value.success)throw new BusinessFailure(400,'Invalid delivery stop identifier');
 return value.data;
}
export function createDeliveryExceptionRoutes(pool:Pool){
 const app=new Hono<Env>();
 app.onError((err,c)=>{const e=respondError(err);if(e.status===500)console.error('Delivery exception API error',err);return c.json({error:e.message},e.status);});
 app.get('/delivery/stops/:id/attempts',async c=>{
  permission(c,'delivery:read');
  const rows=await pool.query(`SELECT da.id,da.attempt_number,da.outcome,da.reason_code,da.notes,da.delivered_grams,da.occurred_at,u.email AS recorded_by
   FROM delivery_attempts da JOIN delivery_stops ds ON ds.id=da.stop_id
   JOIN delivery_runs dr ON dr.id=ds.run_id JOIN users u ON u.id=da.recorded_by
   WHERE ds.id=$1 AND dr.producer_organization_id=$2 ORDER BY da.attempt_number DESC`,[id(c),c.get('organizationId')]);
  if(!rows.rowCount)throw new BusinessFailure(404,'No delivery attempts found for this stop');
  return c.json(rows.rows);
 });
 app.get('/delivery/orders/:id/attempts',async c=>{
  const buyerAccess=canAny(c.get('roles'),'orders:read');
  const supplierAccess=canAny(c.get('roles'),'delivery:read');
  if(!buyerAccess&&!supplierAccess)throw new BusinessFailure(403,'Permission denied');
  const orderId=id(c),org=c.get('organizationId');
  const accessible=await pool.query(`SELECT EXISTS(
   SELECT 1 FROM orders o
   WHERE o.id=$1 AND (($2::boolean AND o.organization_id=$4) OR ($3::boolean AND o.producer_organization_id=$4))
  ) AS allowed`,[orderId,buyerAccess,supplierAccess,org]);
  if(!accessible.rows[0].allowed)throw new BusinessFailure(404,'Order not found');
  const rows=await pool.query(`SELECT da.id,da.attempt_number,da.outcome,da.reason_code,da.notes,
    da.delivered_grams,da.occurred_at
   FROM delivery_attempts da
   JOIN delivery_stops ds ON ds.id=da.stop_id
   JOIN delivery_runs dr ON dr.id=ds.run_id
   JOIN orders o ON o.id=ds.order_id
   WHERE o.id=$1 AND (($2::boolean AND o.organization_id=$4) OR ($3::boolean AND dr.producer_organization_id=$4))
   ORDER BY da.attempt_number`,[orderId,buyerAccess,supplierAccess,org]);
  return c.json(rows.rows);
 });
 app.post('/ops/stops/:id/exception',async c=>{
  permission(c,'delivery:pod');
  const parsed=attemptSchema.safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)throw new BusinessFailure(400,'Invalid delivery exception details');
  const input=parsed.data,stopId=id(c);
  const result=await inTransaction(pool,async tx=>{
   const stop=requireRow((await tx.query<{status:string;driver_id:string;order_id:string;buyer_organization_id:string}>(`SELECT ds.status,dr.driver_id,ds.order_id,o.organization_id AS buyer_organization_id
    FROM delivery_stops ds JOIN delivery_runs dr ON dr.id=ds.run_id JOIN orders o ON o.id=ds.order_id
    WHERE ds.id=$1 AND dr.producer_organization_id=$2 FOR UPDATE OF ds,o`,[stopId,c.get('organizationId')])).rows);
   if(stop.driver_id!==c.get('userId'))throw new BusinessFailure(403,'Only the assigned driver can report a delivery exception');
   if(!['PENDING','ARRIVED'].includes(stop.status))throw new BusinessFailure(409,'Delivery stop is already finalised');
   const totals=await tx.query<{grams:string}>(`SELECT COALESCE(SUM(grams),0)::text AS grams FROM order_items WHERE order_id=$1`,[stop.order_id]);
   const ordered=BigInt(totals.rows[0].grams);
   if(input.outcome==='PARTIAL'&&BigInt(input.deliveredGrams)>=ordered)throw new BusinessFailure(422,'Partial delivered quantity must be less than the ordered quantity');
   const attempt=await tx.query<{next:number}>(`SELECT COALESCE(MAX(attempt_number),0)::int+1 AS next FROM delivery_attempts WHERE stop_id=$1`,[stopId]);
   const eventType='DELIVERY_ATTEMPT_'+input.outcome;
   if(input.event.eventType!==eventType||input.event.subjectType!=='DELIVERY_STOP')throw new BusinessFailure(422,'Incorrect delivery exception audit event type');
   const eventId=await recordEvent(tx,c.get('organizationId'),c.get('userId'),{...input.event,details:{...input.event.details,reasonCode:input.reasonCode,notes:input.notes,deliveredGrams:input.deliveredGrams}},eventType,'DELIVERY_STOP',stopId);
   const inserted=await tx.query<{id:string}>(`INSERT INTO delivery_attempts(stop_id,attempt_number,outcome,reason_code,notes,delivered_grams,recorded_by,event_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[stopId,attempt.rows[0].next,input.outcome,input.reasonCode,input.notes,input.deliveredGrams,c.get('userId'),eventId]);
   await tx.query('UPDATE delivery_stops SET status=$2 WHERE id=$1',[stopId,input.outcome]);
   await tx.query("UPDATE orders SET state='EXCEPTION' WHERE id=$1 AND state='DISPATCHED'",[stop.order_id]);
   await notifyOrganization(tx,stop.buyer_organization_id,['CUSTOMER_ADMIN','CUSTOMER_BUYER'],'DELIVERY','Delivery needs attention',input.outcome==='PARTIAL'?'Your order was only partially delivered. Please review the delivery details and contact support.':'We could not complete delivery. The supplier team has been notified to arrange the next step.','ORDER',stop.order_id,eventType+':'+inserted.rows[0].id,{orderId:stop.order_id,attemptId:inserted.rows[0].id,outcome:input.outcome});
   return {id:inserted.rows[0].id,stopId,attemptNumber:attempt.rows[0].next,outcome:input.outcome,orderState:'EXCEPTION'};
  });
  return c.json(result,201);
 });
 app.post('/ops/stops/:id/retry',async c=>{
  permission(c,'delivery:assign');
  const parsed=retrySchema.safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)throw new BusinessFailure(400,'Invalid redelivery request');
  const input=parsed.data,stopId=id(c);
  const result=await inTransaction(pool,async tx=>{
   const stop=requireRow((await tx.query<{status:string;order_id:string;run_status:string;buyer_organization_id:string}>(`SELECT ds.status,ds.order_id,dr.status AS run_status,o.organization_id AS buyer_organization_id
    FROM delivery_stops ds JOIN delivery_runs dr ON dr.id=ds.run_id JOIN orders o ON o.id=ds.order_id
    WHERE ds.id=$1 AND dr.producer_organization_id=$2 FOR UPDATE OF ds,o,dr`,[stopId,c.get('organizationId')])).rows);
   if(stop.status!=='FAILED')throw new BusinessFailure(409,'Only a fully failed, not partially delivered, stop can be retried');
   if(!['PLANNED','LOADING','DISPATCHED'].includes(stop.run_status))throw new BusinessFailure(409,'Delivery run is no longer active for retry');
   if(input.event.eventType!=='DELIVERY_RETRY_SCHEDULED'||input.event.subjectType!=='DELIVERY_STOP')throw new BusinessFailure(422,'Incorrect delivery retry audit event type');
   const eventId=await recordEvent(tx,c.get('organizationId'),c.get('userId'),{...input.event,details:{...input.event.details,notes:input.notes}},'DELIVERY_RETRY_SCHEDULED','DELIVERY_STOP',stopId);
   await tx.query("UPDATE delivery_stops SET status='PENDING',arrived_at=NULL,completed_at=NULL WHERE id=$1",[stopId]);
   await tx.query("UPDATE orders SET state='DISPATCHED' WHERE id=$1 AND state='EXCEPTION'",[stop.order_id]);
   await notifyOrganization(tx,stop.buyer_organization_id,['CUSTOMER_ADMIN','CUSTOMER_BUYER'],'DELIVERY','Redelivery scheduled','The supplier has scheduled another delivery attempt for your order.','ORDER',stop.order_id,'DELIVERY_RETRY:'+stopId+':'+eventId,{orderId:stop.order_id});
   return {stopId,status:'PENDING',orderState:'DISPATCHED',eventId};
  });
  return c.json(result,200);
 });
 return app;
}
