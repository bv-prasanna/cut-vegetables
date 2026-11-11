import {Hono} from 'hono';
import {z} from 'zod';
import type {Pool,PoolClient} from 'pg';
import {canAny,type Role} from './authorization.js';
import {localDate,cutoffInstant} from './scheduling.js';
import {BusinessFailure,inTransaction,recordEvent,systemEvent,respondError} from './ops-db.js';
import {geoEventSchema} from './geo-events.js';
import {recurrenceRunsOn} from './scheduling.js';
type Env={Variables:{userId:string;organizationId:string;roles:Role[]}};
const uuid=z.string().uuid();
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{try{localDate(v);return true;}catch{return false;}});
const item=z.object({variantId:uuid,grams:z.number().int().positive().max(1_000_000)});
const newSchedule=z.object({
 kitchenId:uuid,slotId:uuid,frequency:z.enum(['DAILY','WEEKLY']),
 weekdays:z.array(z.number().int().min(0).max(6)).max(7).default([]),
 startDate:date,endDate:date.optional(),items:z.array(item).min(1).max(50),
 event:geoEventSchema.optional()
}).refine(v=>v.frequency==='DAILY'||v.weekdays.length>0,{path:['weekdays'],message:'Select weekdays'})
 .refine(v=>!v.endDate||v.endDate>=v.startDate,{path:['endDate'],message:'End date before start date'})
 .refine(v=>new Set(v.items.map(i=>i.variantId)).size===v.items.length,{path:['items'],message:'Duplicate variant'});
const updateState=z.object({state:z.enum(['ACTIVE','PAUSED','CANCELLED']),event:geoEventSchema.optional()});
const skip=z.object({deliveryDate:date,reason:z.string().trim().min(3).max(300),event:geoEventSchema.optional()});
const generation=z.object({deliveryDate:date});
type ScheduleRow={id:string;organization_id:string;kitchen_id:string;slot_id:string;
 frequency:'DAILY'|'WEEKLY';weekdays:number[];start_date:string;end_date:string|null;
 state:'ACTIVE'|'PAUSED'|'CANCELLED';zone_code:string;producer_organization_id:string|null};
type Materialized={scheduleId:string;state:'CREATED'|'BLOCKED'|'SKIPPED'|'EXISTS'|'NOT_DUE';orderId?:string;reason?:string};
type SlotRow={id:string;zone_code:string;label:string;start_minute:number;end_minute:number;
 cutoff_day_offset:number;cutoff_minute:number;capacity_orders:number;active:boolean};
type VariantRow={variant_id:string;grams:number;price_paise_per_kg:number;minimum_grams:number;increment_grams:number;active:boolean};

export function recurrenceIsDue(s:ScheduleRow,day:string):boolean{
 return recurrenceRunsOn({
  frequency:s.frequency,weekdays:s.weekdays,startDate:s.start_date,
  endDate:s.end_date||undefined,slotId:s.slot_id,items:[{variantId:'due-check',grams:1}]
 },day);
}
export async function generateRecurrences(pool:Pool,deliveryDate:string,producerOrganizationId:string,now=new Date()):Promise<Materialized[]>{
 localDate(deliveryDate);
 const query=await pool.query<{id:string}>(`SELECT rs.id FROM recurring_schedules rs JOIN kitchens k ON k.id=rs.kitchen_id
  WHERE k.producer_organization_id=$1 AND rs.state='ACTIVE'
  AND rs.start_date<=$2::date AND (rs.end_date IS NULL OR rs.end_date>=$2::date)
  ORDER BY rs.id LIMIT 1000`,[producerOrganizationId,deliveryDate]);
 const result:Materialized[]=[];
 for(const {id} of query.rows){
  const one=await inTransaction(pool,async tx=>{
   const found=await tx.query<ScheduleRow>(`SELECT rs.id,rs.organization_id,rs.kitchen_id,rs.slot_id,
    rs.frequency,rs.weekdays,rs.start_date::text,rs.end_date::text,rs.state,
    k.zone_code,k.producer_organization_id FROM recurring_schedules rs
    JOIN kitchens k ON k.id=rs.kitchen_id WHERE rs.id=$1 FOR UPDATE OF rs`,[id]);
   const s=found.rows[0];
   if(!s||s.state!=='ACTIVE'||s.producer_organization_id!==producerOrganizationId||!recurrenceIsDue(s,deliveryDate))
    return {scheduleId:id,state:'NOT_DUE'} as Materialized;
   const prev=await tx.query<{order_id:string|null;state:string}>(
    'SELECT order_id,state FROM recurring_occurrences WHERE schedule_id=$1 AND delivery_date=$2::date AND slot_id=$3',
    [id,deliveryDate,s.slot_id]);
   if(prev.rowCount)return {scheduleId:id,state:'EXISTS',orderId:prev.rows[0].order_id??undefined} as Materialized;
   const alreadySkipped=await tx.query('SELECT 1 FROM schedule_skips WHERE schedule_id=$1 AND delivery_date=$2::date',[id,deliveryDate]);
   const block=async(state:'BLOCKED'|'SKIPPED',reason:string):Promise<Materialized>=>{
    await tx.query('INSERT INTO recurring_occurrences(schedule_id,delivery_date,slot_id,state,reason) VALUES($1,$2::date,$3,$4,$5)',[
     id,deliveryDate,s.slot_id,state,reason
    ]);
    await recordEvent(tx,producerOrganizationId,null,systemEvent('RECURRING_OCCURRENCE_'+state,'SCHEDULE',id),
      'RECURRING_OCCURRENCE_'+state,'SCHEDULE',id);
    return {scheduleId:id,state,reason};
   };
   if(alreadySkipped.rowCount)return block('SKIPPED','Customer skipped this delivery');
   // Serialize every slot/date reservation using the same lock as normal checkout.
   const slotQuery=await tx.query<SlotRow>('SELECT * FROM delivery_slots WHERE id=$1 FOR UPDATE',[s.slot_id]);
   const slot=slotQuery.rows[0];
   if(!slot||!slot.active||slot.zone_code!==s.zone_code)return block('BLOCKED','Delivery window unavailable');
   const cutoff=cutoffInstant(deliveryDate,{
    id:slot.id,label:slot.label,startMinute:slot.start_minute,endMinute:slot.end_minute,
    cutoffDayOffset:slot.cutoff_day_offset,cutoffMinute:slot.cutoff_minute,
    capacityOrders:slot.capacity_orders,active:slot.active
   });
   if(now.getTime()>=cutoff.getTime())return block('BLOCKED','Order cutoff passed');
   if((await tx.query('SELECT 1 FROM slot_blackouts WHERE slot_id=$1 AND delivery_date=$2::date',
     [s.slot_id,deliveryDate])).rowCount)return block('BLOCKED','Service blackout');
   const cap=await tx.query<{n:number}>('SELECT count(*)::int AS n FROM slot_reservations WHERE slot_id=$1 AND delivery_date=$2::date',
    [s.slot_id,deliveryDate]);
   if(cap.rows[0].n>=slot.capacity_orders)return block('BLOCKED','Slot full');
   const items=await tx.query<VariantRow>(`SELECT ri.variant_id,ri.grams,pv.price_paise_per_kg,pv.minimum_grams,
     pv.increment_grams,pv.active FROM recurring_items ri JOIN product_variants pv ON pv.id=ri.variant_id
     WHERE ri.schedule_id=$1 ORDER BY ri.variant_id`,[id]);
   if(!items.rowCount||items.rows.some(i=>!i.active||i.grams<i.minimum_grams||
     (i.grams-i.minimum_grams)%i.increment_grams!==0))return block('BLOCKED','Variant discontinued or invalid quantity');
   const order=await tx.query<{id:string}>(`INSERT INTO orders
    (organization_id,kitchen_id,slot_id,delivery_date,source_schedule_id,producer_organization_id,idempotency_key)
    VALUES($1,$2,$3,$4::date,$5,$6,$7) RETURNING id`,[
     s.organization_id,s.kitchen_id,s.slot_id,deliveryDate,id,producerOrganizationId,
     'schedule:'+id+':'+deliveryDate
    ]);
   const orderId=order.rows[0].id;
   for(const v of items.rows){
    const amount=Math.round(v.price_paise_per_kg*v.grams/1000);
    await tx.query(`INSERT INTO order_items(order_id,variant_id,grams,price_paise_per_kg,line_total_paise)
     VALUES($1,$2,$3,$4,$5)`,[orderId,v.variant_id,v.grams,v.price_paise_per_kg,amount]);
   }
   await tx.query('INSERT INTO slot_reservations(slot_id,delivery_date,order_id) VALUES($1,$2::date,$3)',
    [s.slot_id,deliveryDate,orderId]);
   await tx.query(`INSERT INTO recurring_occurrences(schedule_id,delivery_date,slot_id,order_id,state)
     VALUES($1,$2::date,$3,$4,'CREATED')`,[id,deliveryDate,s.slot_id,orderId]);
   await recordEvent(tx,producerOrganizationId,null,systemEvent('RECURRING_ORDER_CREATED','ORDER',orderId),
    'RECURRING_ORDER_CREATED','ORDER',orderId);
   return {scheduleId:id,state:'CREATED',orderId} as Materialized;
  });
  result.push(one);
 }
 return result;
}

export function createRecurrenceRoutes(pool:Pool,clock:()=>Date=()=>new Date()){
 const app=new Hono<Env>();
 app.onError((err,c)=>{
  const e=respondError(err);
  if(e.status===500)console.error('Recurrence error',err);
  return c.json({error:e.message},e.status);
 });
 app.get('/admin/recurrences',async c=>{
  if(!canAny(c.get('roles'),'users:manage'))return c.json({error:'Forbidden'},403);
  const rows=await pool.query(`SELECT rs.id,rs.organization_id,org.name AS customer,rs.kitchen_id,
   k.name AS kitchen,rs.slot_id,ds.label AS slot,rs.frequency,rs.weekdays,
   rs.start_date::text,rs.end_date::text,rs.state,rs.created_at
   FROM recurring_schedules rs JOIN kitchens k ON k.id=rs.kitchen_id
   JOIN organizations org ON org.id=rs.organization_id
   JOIN delivery_slots ds ON ds.id=rs.slot_id
   WHERE k.producer_organization_id=$1 ORDER BY rs.created_at DESC LIMIT 250`,[c.get('organizationId')]);
  return c.json(rows.rows);
 });
 app.get('/recurrences',async c=>{
  if(!canAny(c.get('roles'),'schedules:read'))return c.json({error:'Forbidden'},403);
  const schedules=await pool.query(`SELECT id,kitchen_id,slot_id,frequency,weekdays,
    start_date::text,end_date::text,state,created_at
    FROM recurring_schedules WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 150`,[c.get('organizationId')]);
  return c.json(schedules.rows);
 });
 app.post('/recurrences',async c=>{
  if(!canAny(c.get('roles'),'schedules:write'))return c.json({error:'Forbidden'},403);
  const data=newSchedule.safeParse(await c.req.json().catch(()=>null));
  if(!data.success)return c.json({error:'Invalid schedule',issues:data.error.flatten()},400);
  const v=data.data;
  const created=await inTransaction(pool,async tx=>{
   const kitchen=await tx.query<{zone_code:string}>(`SELECT zone_code FROM kitchens WHERE id=$1 AND organization_id=$2 AND active=true`,
    [v.kitchenId,c.get('organizationId')]);
   if(!kitchen.rowCount)throw new BusinessFailure(422,'Kitchen unavailable');
   const slot=await tx.query<{zone_code:string;active:boolean}>('SELECT zone_code,active FROM delivery_slots WHERE id=$1',[v.slotId]);
   if(!slot.rowCount||!slot.rows[0].active||slot.rows[0].zone_code!==kitchen.rows[0].zone_code)
    throw new BusinessFailure(422,'Delivery slot unavailable for kitchen');
   const ids=v.items.map(i=>i.variantId);
   const variants=await tx.query<{id:string;minimum_grams:number;increment_grams:number}>(`SELECT id,minimum_grams,increment_grams
     FROM product_variants WHERE active=true AND id=ANY($1::uuid[])`,[ids]);
   const product=new Map(variants.rows.map(x=>[x.id,x]));
   if(product.size!==ids.length||v.items.some(i=>{
    const p=product.get(i.variantId);return !p||i.grams<p.minimum_grams||(i.grams-p.minimum_grams)%p.increment_grams!==0;
   }))throw new BusinessFailure(422,'Invalid variant or quantity');
   const schedule=await tx.query<{id:string}>(`INSERT INTO recurring_schedules(
    organization_id,kitchen_id,slot_id,frequency,weekdays,start_date,end_date)
    VALUES($1,$2,$3,$4,$5,$6::date,$7::date) RETURNING id`,[
     c.get('organizationId'),v.kitchenId,v.slotId,v.frequency,v.frequency==='DAILY'?[]:v.weekdays,v.startDate,v.endDate||null
    ]);
   for(const row of v.items)await tx.query(
    'INSERT INTO recurring_items(schedule_id,variant_id,grams) VALUES($1,$2,$3)',[schedule.rows[0].id,row.variantId,row.grams]);
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),
    v.event??systemEvent('RECURRING_SCHEDULE_CREATED','SCHEDULE',schedule.rows[0].id),
    'RECURRING_SCHEDULE_CREATED','SCHEDULE',schedule.rows[0].id);
   return schedule.rows[0];
  });
  return c.json(created,201);
 });
 app.patch('/recurrences/:id',async c=>{
  if(!canAny(c.get('roles'),'schedules:write'))return c.json({error:'Forbidden'},403);
  const parsed=updateState.safeParse(await c.req.json().catch(()=>null));
  const id=uuid.safeParse(c.req.param('id'));
  if(!parsed.success||!id.success)return c.json({error:'Invalid schedule update'},400);
  const updated=await inTransaction(pool,async tx=>{
   const state=await tx.query<{state:string}>(`SELECT state FROM recurring_schedules WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
    [id.data,c.get('organizationId')]);
   if(!state.rowCount)throw new BusinessFailure(404,'Schedule not found');
   if(state.rows[0].state==='CANCELLED'&&parsed.data.state!=='CANCELLED')
    throw new BusinessFailure(409,'Cancelled schedules cannot be reactivated');
   await tx.query('UPDATE recurring_schedules SET state=$3 WHERE id=$1 AND organization_id=$2',
    [id.data,c.get('organizationId'),parsed.data.state]);
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),
    parsed.data.event??systemEvent('RECURRING_SCHEDULE_STATE_CHANGED','SCHEDULE',id.data),
    'RECURRING_SCHEDULE_STATE_CHANGED','SCHEDULE',id.data);
   return {id:id.data,state:parsed.data.state};
  });
  return c.json(updated);
 });
 app.post('/recurrences/:id/skips',async c=>{
  if(!canAny(c.get('roles'),'schedules:write'))return c.json({error:'Forbidden'},403);
  const parsed=skip.safeParse(await c.req.json().catch(()=>null));
  const id=uuid.safeParse(c.req.param('id'));
  if(!parsed.success||!id.success)return c.json({error:'Invalid skip request'},400);
  const record=await inTransaction(pool,async tx=>{
   const schedule=await tx.query('SELECT id FROM recurring_schedules WHERE id=$1 AND organization_id=$2 FOR UPDATE',
     [id.data,c.get('organizationId')]);
   if(!schedule.rowCount)throw new BusinessFailure(404,'Schedule not found');
   const exists=await tx.query(`SELECT 1 FROM recurring_occurrences WHERE schedule_id=$1 AND delivery_date=$2::date
    AND state='CREATED'`,[id.data,parsed.data.deliveryDate]);
   if(exists.rowCount)throw new BusinessFailure(409,'Delivery already created; manage the order directly');
   await tx.query(`INSERT INTO schedule_skips(schedule_id,delivery_date,reason) VALUES($1,$2::date,$3)
    ON CONFLICT(schedule_id,delivery_date) DO UPDATE SET reason=EXCLUDED.reason`,
    [id.data,parsed.data.deliveryDate,parsed.data.reason]);
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),
    parsed.data.event??systemEvent('RECURRING_DELIVERY_SKIPPED','SCHEDULE',id.data),
    'RECURRING_DELIVERY_SKIPPED','SCHEDULE',id.data);
   return {scheduleId:id.data,deliveryDate:parsed.data.deliveryDate};
  });
  return c.json(record,201);
 });
 app.post('/admin/recurrences/generate',async c=>{
  if(!canAny(c.get('roles'),'users:manage'))return c.json({error:'Forbidden'},403);
  const parsed=generation.safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return c.json({error:'Invalid delivery date'},400);
  const now=clock();
  const day=localDate(parsed.data.deliveryDate);
  if(day.getTime()>now.getTime()+15*86400000||day.getTime()<now.getTime()-2*86400000)
   return c.json({error:'Delivery date is outside the safe generation window'},422);
  const result=await generateRecurrences(pool,parsed.data.deliveryDate,c.get('organizationId'),now);
  const summary=Object.fromEntries(['CREATED','BLOCKED','SKIPPED','EXISTS','NOT_DUE'].map(status=>[
   status,result.filter(item=>item.state===status).length
  ]));
  return c.json({deliveryDate:parsed.data.deliveryDate,summary,result});
 });
 return app;
}
