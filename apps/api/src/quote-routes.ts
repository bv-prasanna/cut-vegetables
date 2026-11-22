import {Hono} from 'hono';
import {z} from 'zod';
import type {Pool} from 'pg';
import {canAny,type Role} from './authorization.js';
import {BusinessFailure,inTransaction,recordEvent,systemEvent,respondError} from './ops-db.js';
import {geoEventSchema} from './geo-events.js';
import {localDate,cutoffInstant} from './scheduling.js';
import {loadContractPricing} from './commercial-pricing.js';
type Env={Variables:{userId:string;organizationId:string;roles:Role[]}};
const uuid=z.string().uuid();
const date=z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).refine(v=>{try{localDate(v);return true;}catch{return false;}});
const quoteInput=z.object({
 kitchenId:uuid,slotId:uuid,deliveryDate:date,idempotencyKey:z.string().min(8).max(120),
 items:z.array(z.object({variantId:uuid,grams:z.number().int().positive().max(1_000_000)})).min(1).max(50),
 event:geoEventSchema.optional()
}).refine(v=>new Set(v.items.map(i=>i.variantId)).size===v.items.length,{path:['items'],message:'Duplicate product variant'});
const proposalInput=z.object({discountPaise:z.number().int().nonnegative().max(1_000_000_000).default(0),validHours:z.number().int().min(1).max(168).default(48),note:z.string().trim().max(500).optional()});
function parse<T extends z.ZodTypeAny>(value:unknown,schema:T):z.infer<T>{const result=schema.safeParse(value);if(!result.success)throw new BusinessFailure(400,'Invalid request: '+result.error.issues.map(i=>i.path.join('.')).join(', '));return result.data;}
function idParam(c:{req:{param:(key:string)=>string}},key:string){const parsed=uuid.safeParse(c.req.param(key));if(!parsed.success)throw new BusinessFailure(400,'Invalid quote ID');return parsed.data;}
const slotShape=(s:any)=>({id:s.id,label:s.label,startMinute:s.start_minute,endMinute:s.end_minute,cutoffDayOffset:s.cutoff_day_offset,cutoffMinute:s.cutoff_minute,capacityOrders:s.capacity_orders,active:s.active});
export function createQuoteRoutes(pool:Pool,clock:()=>Date=()=>new Date()){
 const app=new Hono<Env>();
 app.onError((err,c)=>{const e=respondError(err);if(e.status===500)console.error('Quote API failed',err);return c.json({error:e.message},e.status);});
 app.post('/quotes',async c=>{
  if(!canAny(c.get('roles'),'quotes:request'))throw new BusinessFailure(403,'Permission denied');
  const data=parse(await c.req.json().catch(()=>null),quoteInput),org=c.get('organizationId');
  const fingerprint=JSON.stringify({kitchenId:data.kitchenId,slotId:data.slotId,deliveryDate:data.deliveryDate,items:[...data.items].sort((a,b)=>a.variantId.localeCompare(b.variantId))});
  const result=await inTransaction(pool,async tx=>{
   const existing=await tx.query("SELECT id,quote_number,state FROM quotes WHERE buyer_organization_id=$1 AND idempotency_key=$2 FOR UPDATE",[org,data.idempotencyKey]);
   if(existing.rowCount){
    if(existing.rows[0].request_fingerprint!==fingerprint)throw new BusinessFailure(409,'This idempotency key was already used for a different quote request');
    return {id:existing.rows[0].id,quoteNumber:existing.rows[0].quote_number,state:existing.rows[0].state,replayed:true};
   }
   const kitchen=await tx.query("SELECT id,zone_code,producer_organization_id FROM kitchens WHERE id=$1 AND organization_id=$2 AND active=true",[data.kitchenId,org]);
   if(!kitchen.rowCount||!kitchen.rows[0].producer_organization_id)throw new BusinessFailure(422,'Kitchen or assigned supplier unavailable');
   const slotQ=await tx.query("SELECT * FROM delivery_slots WHERE id=$1",[data.slotId]),slot=slotQ.rows[0];
   if(!slot||!slot.active||slot.zone_code!==kitchen.rows[0].zone_code)throw new BusinessFailure(422,'Delivery slot does not serve this kitchen');
   if(clock().getTime()>=cutoffInstant(data.deliveryDate,slotShape(slot)).getTime())throw new BusinessFailure(422,'Quote delivery cutoff has passed');
   if((await tx.query('SELECT 1 FROM slot_blackouts WHERE slot_id=$1 AND delivery_date=$2::date',[data.slotId,data.deliveryDate])).rowCount)throw new BusinessFailure(422,'Delivery slot is unavailable on this date');
   const ids=data.items.map(i=>i.variantId);
   const pricing=await loadContractPricing(tx,org,kitchen.rows[0].producer_organization_id,data.kitchenId,data.deliveryDate,ids);
   if(!pricing)throw new BusinessFailure(409,'No active commercial contract for this kitchen and delivery date');
   if(pricing.rules.size!==ids.length||data.items.some(i=>{const r=pricing.rules.get(i.variantId);return !r||i.grams<r.minimum_grams||(i.grams-r.minimum_grams)%r.increment_grams!==0;}))
    throw new BusinessFailure(422,'One or more products are not covered by an approved contract price or quantity rule');
   const subtotal=data.items.reduce((sum,i)=>sum+Math.round(pricing.rules.get(i.variantId)!.price_paise_per_kg*i.grams/1000),0);
   if(subtotal<Number(pricing.contract.minimum_order_value_paise))throw new BusinessFailure(422,'Quote is below the contracted minimum order value');
   const deliveryFee=Number(pricing.contract.delivery_fee_paise),validUntil=new Date(clock().getTime()+72*60*60*1000);
   const inserted=await tx.query("INSERT INTO quotes(buyer_organization_id,producer_organization_id,kitchen_id,slot_id,delivery_date,contract_id,contract_version,state,valid_until,subtotal_paise,delivery_fee_paise,total_paise,request_fingerprint,idempotency_key,created_by) VALUES($1,$2,$3,$4,$5::date,$6,$7,'REQUESTED',$8,$9,$10,$11,$12,$13,$14) RETURNING id,quote_number,state",[org,kitchen.rows[0].producer_organization_id,data.kitchenId,data.slotId,data.deliveryDate,pricing.contract.id,pricing.contract.version,validUntil,subtotal,deliveryFee,subtotal+deliveryFee,fingerprint,data.idempotencyKey,c.get('userId')]);
   const q=inserted.rows[0];
   for(const item of data.items){
    const rule=pricing.rules.get(item.variantId)!;
    const line=Math.round(rule.price_paise_per_kg*item.grams/1000);
    const snapshot={priceRuleId:rule.id,pricePaisePerKg:rule.price_paise_per_kg,minimumGrams:rule.minimum_grams,incrementGrams:rule.increment_grams,serviceDate:data.deliveryDate};
    await tx.query("INSERT INTO quote_lines(quote_id,variant_id,grams,contract_price_rule_id,price_paise_per_kg,line_total_paise,pricing_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)",[q.id,item.variantId,item.grams,rule.id,rule.price_paise_per_kg,line,JSON.stringify(snapshot)]);
   }
   await recordEvent(tx,org,c.get('userId'),data.event??systemEvent('QUOTE_REQUESTED','QUOTE',q.id),'QUOTE_REQUESTED','QUOTE',q.id);
   return {id:q.id,quoteNumber:q.quote_number,state:q.state,replayed:false};
  });
  return c.json(result,result.replayed?200:201);
 });
 app.get('/quotes',async c=>{
  if(!canAny(c.get('roles'),'quotes:read'))throw new BusinessFailure(403,'Permission denied');
  const q=await pool.query("SELECT id,quote_number,state,delivery_date::text,valid_until,subtotal_paise,delivery_fee_paise,discount_paise,total_paise,note,accepted_order_id,created_at FROM quotes WHERE buyer_organization_id=$1 ORDER BY created_at DESC LIMIT 100",[c.get('organizationId')]);
  return c.json(q.rows);
 });
 app.get('/quotes/:id',async c=>{
  if(!canAny(c.get('roles'),'quotes:read'))throw new BusinessFailure(403,'Permission denied');
  const id=idParam(c,'id');
  const q=await pool.query("SELECT id,quote_number,state,delivery_date::text,slot_id,kitchen_id,valid_until,subtotal_paise,delivery_fee_paise,discount_paise,total_paise,note,accepted_order_id,created_at FROM quotes WHERE id=$1 AND buyer_organization_id=$2",[id,c.get('organizationId')]);
  if(!q.rowCount)throw new BusinessFailure(404,'Quote not found');
  const lines=await pool.query("SELECT ql.variant_id,ql.grams,ql.price_paise_per_kg,ql.line_total_paise,pv.sku,v.name AS vegetable,pv.method_code,pv.size_kind,pv.size_number,pv.size_unit,pv.size_label FROM quote_lines ql JOIN product_variants pv ON pv.id=ql.variant_id JOIN vegetables v ON v.id=pv.vegetable_id WHERE ql.quote_id=$1 ORDER BY v.name,pv.sku",[id]);
  return c.json({...q.rows[0],lines:lines.rows});
 });
 app.get('/admin/quotes',async c=>{
  if(!canAny(c.get('roles'),'quotes:read'))throw new BusinessFailure(403,'Permission denied');
  const q=await pool.query("SELECT q.id,q.quote_number,q.buyer_organization_id,org.name AS buyer_name,q.kitchen_id,k.name AS kitchen,q.delivery_date::text,q.state,q.valid_until,q.subtotal_paise,q.delivery_fee_paise,q.discount_paise,q.total_paise,q.note,q.created_at FROM quotes q JOIN organizations org ON org.id=q.buyer_organization_id JOIN kitchens k ON k.id=q.kitchen_id WHERE q.producer_organization_id=$1 ORDER BY q.created_at DESC LIMIT 250",[c.get('organizationId')]);
  return c.json(q.rows);
 });
 app.post('/admin/quotes/:id/propose',async c=>{
  if(!canAny(c.get('roles'),'quotes:propose')&&!canAny(c.get('roles'),'quotes:manage'))throw new BusinessFailure(403,'Permission denied');
  const id=idParam(c,'id'),data=parse(await c.req.json().catch(()=>null),proposalInput);
  const result=await inTransaction(pool,async tx=>{
   const q=await tx.query("SELECT id,state,subtotal_paise,delivery_fee_paise FROM quotes WHERE id=$1 AND producer_organization_id=$2 FOR UPDATE",[id,c.get('organizationId')]);
   if(!q.rowCount)throw new BusinessFailure(404,'Quote not found');
   if(q.rows[0].state!=='REQUESTED')throw new BusinessFailure(409,'Only requested quotes can be proposed');
   if(data.discountPaise>Number(q.rows[0].subtotal_paise))throw new BusinessFailure(422,'Discount cannot exceed the quote subtotal');
   if(data.discountPaise>0&&!canAny(c.get('roles'),'quotes:manage'))throw new BusinessFailure(403,'Only an authorised manager may approve a quote discount');
   const total=Number(q.rows[0].subtotal_paise)-data.discountPaise+Number(q.rows[0].delivery_fee_paise);
   const validUntil=new Date(clock().getTime()+data.validHours*60*60*1000);
   await tx.query("UPDATE quotes SET state='PROPOSED',discount_paise=$2,total_paise=$3,valid_until=$4,note=$5,responded_by=$6,updated_at=now() WHERE id=$1",[id,data.discountPaise,total,validUntil,data.note??null,c.get('userId')]);
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),systemEvent('QUOTE_PROPOSED','QUOTE',id),'QUOTE_PROPOSED','QUOTE',id);
   return {id,state:'PROPOSED',discountPaise:data.discountPaise,totalPaise:total,validUntil};
  });
  return c.json(result);
 });
 app.post('/quotes/:id/accept',async c=>{
  if(!canAny(c.get('roles'),'quotes:accept'))throw new BusinessFailure(403,'Permission denied');
  const id=idParam(c,'id');
  const input=parse(await c.req.json().catch(()=>({})),z.object({event:geoEventSchema.optional()}));
  const result=await inTransaction(pool,async tx=>{
   const quote=await tx.query("SELECT * FROM quotes WHERE id=$1 AND buyer_organization_id=$2 FOR UPDATE",[id,c.get('organizationId')]);
   if(!quote.rowCount)throw new BusinessFailure(404,'Quote not found');
   const q=quote.rows[0];
   if(q.state==='ACCEPTED'&&q.accepted_order_id)return {id:q.accepted_order_id,replayed:true};
   if(q.state!=='PROPOSED')throw new BusinessFailure(409,'Only a proposed quote can be accepted');
   if(new Date(q.valid_until).getTime()<=clock().getTime()){
    await tx.query("UPDATE quotes SET state='EXPIRED',updated_at=now() WHERE id=$1",[id]);
    return {expired:true as const};
   }
   const slotQ=await tx.query("SELECT * FROM delivery_slots WHERE id=$1 FOR UPDATE",[q.slot_id]),slot=slotQ.rows[0];
   if(!slot||!slot.active)throw new BusinessFailure(422,'Delivery slot is no longer available');
   if(clock().getTime()>=cutoffInstant(q.delivery_date,slotShape(slot)).getTime())throw new BusinessFailure(422,'Delivery cutoff has passed');
   if((await tx.query('SELECT 1 FROM slot_blackouts WHERE slot_id=$1 AND delivery_date=$2::date',[q.slot_id,q.delivery_date])).rowCount)throw new BusinessFailure(422,'Delivery slot is blacked out');
   const count=await tx.query("SELECT count(*)::int AS n FROM slot_reservations WHERE slot_id=$1 AND delivery_date=$2::date",[q.slot_id,q.delivery_date]);
   if(count.rows[0].n>=slot.capacity_orders)throw new BusinessFailure(409,'Delivery slot is full');
   const snapshot={quoteId:id,quoteNumber:q.quote_number,contractId:q.contract_id,contractVersion:q.contract_version,subtotalPaise:Number(q.subtotal_paise),deliveryFeePaise:Number(q.delivery_fee_paise),discountPaise:Number(q.discount_paise),totalPaise:Number(q.total_paise),currency:'INR'};
   const order=await tx.query("INSERT INTO orders(organization_id,kitchen_id,slot_id,delivery_date,producer_organization_id,contract_id,contract_version,subtotal_paise,delivery_fee_paise,discount_paise,total_paise,pricing_snapshot,quote_id,idempotency_key) VALUES($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14) RETURNING id",[q.buyer_organization_id,q.kitchen_id,q.slot_id,q.delivery_date,q.producer_organization_id,q.contract_id,q.contract_version,q.subtotal_paise,q.delivery_fee_paise,q.discount_paise,q.total_paise,JSON.stringify(snapshot),id,'quote:'+id]);
   const orderId=order.rows[0].id;
   await tx.query("INSERT INTO order_items(order_id,variant_id,grams,price_paise_per_kg,line_total_paise,contract_price_rule_id,pricing_snapshot) SELECT $1,variant_id,grams,price_paise_per_kg,line_total_paise,contract_price_rule_id,pricing_snapshot FROM quote_lines WHERE quote_id=$2",[orderId,id]);
   await tx.query('INSERT INTO slot_reservations(slot_id,delivery_date,order_id) VALUES($1,$2::date,$3)',[q.slot_id,q.delivery_date,orderId]);
   await tx.query("UPDATE quotes SET state='ACCEPTED',accepted_order_id=$2,updated_at=now() WHERE id=$1",[id,orderId]);
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),input.event??systemEvent('QUOTE_ACCEPTED','QUOTE',id),'QUOTE_ACCEPTED','QUOTE',id);
   return {id:orderId,replayed:false};
  });
  if('expired' in result)return c.json({error:'Quote expired before acceptance'},409);
  return c.json(result,result.replayed?200:201);
 });
 app.post('/quotes/:id/reject',async c=>{
  if(!canAny(c.get('roles'),'quotes:accept'))throw new BusinessFailure(403,'Permission denied');
  const id=idParam(c,'id');
  const result=await inTransaction(pool,async tx=>{
   const q=await tx.query("UPDATE quotes SET state='REJECTED',updated_at=now() WHERE id=$1 AND buyer_organization_id=$2 AND state='PROPOSED' RETURNING id",[id,c.get('organizationId')]);
   if(!q.rowCount)throw new BusinessFailure(404,'Proposed quote not found');
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),systemEvent('QUOTE_REJECTED','QUOTE',id),'QUOTE_REJECTED','QUOTE',id);
   return {id,state:'REJECTED'};
  });
  return c.json(result);
 });
 return app;
}
