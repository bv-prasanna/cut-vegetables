import {Hono} from 'hono';
import type {Pool} from 'pg';
import {canAny,type Role} from './authorization.js';
import {BusinessFailure,inTransaction,recordEvent,systemEvent,respondError} from './ops-db.js';
import {geoEventSchema} from './geo-events.js';
import {cutoffInstant} from './scheduling.js';
import {z} from 'zod';

type Env={Variables:{userId:string;organizationId:string;roles:Role[]}};
const uuid=z.string().uuid();
const input=z.object({event:geoEventSchema.optional()});
const slotShape=(s:any)=>({id:s.id,label:s.label,startMinute:s.start_minute,endMinute:s.end_minute,cutoffDayOffset:s.cutoff_day_offset,cutoffMinute:s.cutoff_minute,capacityOrders:s.capacity_orders,active:s.active});

export function createOrderLifecycleRoutes(pool:Pool,clock:()=>Date=()=>new Date()){
 const app=new Hono<Env>();
 app.onError((err,c)=>{const e=respondError(err);if(e.status===500)console.error('Order lifecycle API failed',err);return c.json({error:e.message},e.status);});
 app.post('/orders/:id/cancel',async c=>{
  if(!canAny(c.get('roles'),'orders:write'))throw new BusinessFailure(403,'Permission denied');
  const parsed=uuid.safeParse(c.req.param('id'));
  if(!parsed.success)throw new BusinessFailure(400,'Invalid order ID');
  const body=input.safeParse(await c.req.json().catch(()=>({})));
  if(!body.success)throw new BusinessFailure(400,'Invalid cancellation request');
  const id=parsed.data,org=c.get('organizationId');
  const result=await inTransaction(pool,async tx=>{
   const order=await tx.query("SELECT id,state,delivery_date::text AS delivery_date,slot_id FROM orders WHERE id=$1 AND organization_id=$2 FOR UPDATE",[id,org]);
   if(!order.rowCount)throw new BusinessFailure(404,'Order not found');
   const row=order.rows[0];
   if(row.state==='CANCELLED')return {id,state:'CANCELLED',replayed:true};
   if(row.state!=='CONFIRMED')throw new BusinessFailure(409,'This order can no longer be cancelled online. Contact FreshPrep support for assistance.');
   const slotQ=await tx.query('SELECT * FROM delivery_slots WHERE id=$1 FOR UPDATE',[row.slot_id]);
   const slot=slotQ.rows[0];
   if(!slot)throw new BusinessFailure(409,'The delivery slot is no longer available; contact support to cancel this order');
   if(clock().getTime()>=cutoffInstant(row.delivery_date,slotShape(slot)).getTime())
    throw new BusinessFailure(409,'The cancellation cutoff has passed. Contact FreshPrep support for assistance.');
   await tx.query("UPDATE orders SET state='CANCELLED' WHERE id=$1 AND organization_id=$2",[id,org]);
   await tx.query('DELETE FROM slot_reservations WHERE order_id=$1',[id]);
   await tx.query('UPDATE offer_redemptions SET reversed_at=now() WHERE order_id=$1 AND reversed_at IS NULL',[id]);
   await recordEvent(tx,org,c.get('userId'),body.data.event??systemEvent('ORDER_CANCELLED','ORDER',id),'ORDER_CANCELLED','ORDER',id);
   return {id,state:'CANCELLED',replayed:false};
  });
  return c.json(result);
 });
 return app;
}
