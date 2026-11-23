import {Hono} from 'hono';
import {z} from 'zod';
import type {Pool} from 'pg';
import {canAny,type Role} from './authorization.js';
import {BusinessFailure,inTransaction,recordEvent,systemEvent,respondError} from './ops-db.js';
type Env={Variables:{userId:string;organizationId:string;roles:Role[]}};
const offerInput=z.object({
 code:z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_-]+$/).transform(v=>v.toUpperCase()),
 name:z.string().trim().min(3).max(120),description:z.string().trim().max(500).optional(),
 discountType:z.enum(['FIXED_PAISE','PERCENT_BPS']),discountValue:z.number().int().positive().max(100_000_000),
 maxDiscountPaise:z.number().int().positive().optional(),minimumSubtotalPaise:z.number().int().nonnegative().default(0),
 startsAt:z.string().datetime(),endsAt:z.string().datetime(),maxRedemptions:z.number().int().positive().optional(),
 perBuyerLimit:z.number().int().positive().max(100).default(1)
}).refine(v=>new Date(v.endsAt)>new Date(v.startsAt),{path:['endsAt'],message:'Offer end must be after start'})
 .refine(v=>v.discountType!=='PERCENT_BPS'||v.discountValue<=10000,{path:['discountValue'],message:'Percentage cannot exceed 100%'});
function failPermission(roles:Role[],permission:string){if(!canAny(roles,permission))throw new BusinessFailure(403,'Permission denied');}
function parse<T extends z.ZodTypeAny>(value:unknown,schema:T):z.infer<T>{const r=schema.safeParse(value);if(!r.success)throw new BusinessFailure(400,'Invalid request: '+r.error.issues.map(i=>i.path.join('.')).join(', '));return r.data;}
export function createOfferRoutes(pool:Pool){
 const app=new Hono<Env>();
 app.onError((err,c)=>{const e=respondError(err);if(e.status===500)console.error('Offer API failed',err);return c.json({error:e.message},e.status);});
 app.get('/admin/offers',async c=>{
  failPermission(c.get('roles'),'marketing:write');
  const q=await pool.query('SELECT id,code,name,description,discount_type,discount_value,max_discount_paise,minimum_subtotal_paise,starts_at,ends_at,max_redemptions,per_buyer_limit,status,stacking_allowed,created_at FROM customer_offers WHERE producer_organization_id=$1 ORDER BY created_at DESC LIMIT 500',[c.get('organizationId')]);
  return c.json(q.rows);
 });
 app.post('/admin/offers',async c=>{
  failPermission(c.get('roles'),'marketing:write');const d=parse(await c.req.json().catch(()=>null),offerInput);
  if(d.discountType==='FIXED_PAISE'&&d.maxDiscountPaise)throw new BusinessFailure(400,'Maximum discount is only applicable to percentage offers');
  const row=await inTransaction(pool,async tx=>{
   const duplicate=await tx.query('SELECT id FROM customer_offers WHERE producer_organization_id=$1 AND code=$2',[c.get('organizationId'),d.code]);
   if(duplicate.rowCount)throw new BusinessFailure(409,'Offer code already exists');
   const q=await tx.query('INSERT INTO customer_offers(producer_organization_id,code,name,description,discount_type,discount_value,max_discount_paise,minimum_subtotal_paise,starts_at,ends_at,max_redemptions,per_buyer_limit,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz,$11,$12,$13) RETURNING id,code,status',[c.get('organizationId'),d.code,d.name,d.description??null,d.discountType,d.discountValue,d.maxDiscountPaise??null,d.minimumSubtotalPaise,d.startsAt,d.endsAt,d.maxRedemptions??null,d.perBuyerLimit,c.get('userId')]);
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),systemEvent('CUSTOMER_OFFER_CREATED','OFFER',q.rows[0].id),'CUSTOMER_OFFER_CREATED','OFFER',q.rows[0].id);return q.rows[0];
  });
  return c.json(row,201);
 });
 app.patch('/admin/offers/:id/status',async c=>{
  failPermission(c.get('roles'),'offers:approve');
  const id=z.string().uuid().safeParse(c.req.param('id'));if(!id.success)throw new BusinessFailure(400,'Invalid offer ID');
  const d=parse(await c.req.json().catch(()=>null),z.object({status:z.enum(['ACTIVE','PAUSED','EXPIRED'])}));
  const row=await inTransaction(pool,async tx=>{
   const offer=await tx.query('SELECT id,status,starts_at,ends_at FROM customer_offers WHERE id=$1 AND producer_organization_id=$2 FOR UPDATE',[id.data,c.get('organizationId')]);
   if(!offer.rowCount)throw new BusinessFailure(404,'Offer not found');
   if(d.status==='ACTIVE'&&(new Date(offer.rows[0].ends_at)<=new Date()||new Date(offer.rows[0].starts_at)>new Date()))throw new BusinessFailure(409,'Offer can only be activated during its configured validity window');
   await tx.query('UPDATE customer_offers SET status=$2,updated_at=now() WHERE id=$1',[id.data,d.status]);
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),systemEvent('CUSTOMER_OFFER_STATUS_CHANGED','OFFER',id.data),'CUSTOMER_OFFER_STATUS_CHANGED','OFFER',id.data);
   return {id:id.data,status:d.status};
  });
  return c.json(row);
 });
 app.get('/promotions/validate',async c=>{
  failPermission(c.get('roles'),'orders:write');
  const code=(c.req.query('code')||'').trim().toUpperCase(),kitchenId=c.req.query('kitchenId')||'';
  if(!/^[A-Z0-9_-]{3,32}$/.test(code)||!z.string().uuid().safeParse(kitchenId).success)throw new BusinessFailure(400,'Enter a valid offer code and kitchen');
  const kitchen=await pool.query('SELECT producer_organization_id FROM kitchens WHERE id=$1 AND organization_id=$2 AND active=true',[kitchenId,c.get('organizationId')]);
  if(!kitchen.rowCount||!kitchen.rows[0].producer_organization_id)throw new BusinessFailure(422,'Kitchen is not assigned to an active supplier');
  const q=await pool.query('SELECT id,code,name,discount_type,discount_value,max_discount_paise,minimum_subtotal_paise,starts_at,ends_at,max_redemptions,per_buyer_limit,status FROM customer_offers WHERE producer_organization_id=$1 AND code=$2',[kitchen.rows[0].producer_organization_id,code]);
  if(!q.rowCount)throw new BusinessFailure(404,'Offer code not found');
  const o=q.rows[0];
  if(o.status!=='ACTIVE'||new Date(o.starts_at)>new Date()||new Date(o.ends_at)<=new Date())throw new BusinessFailure(409,'This offer is not currently available');
  const [global,buyer]=await Promise.all([
   pool.query('SELECT count(*)::int AS n FROM offer_redemptions WHERE offer_id=$1 AND reversed_at IS NULL',[o.id]),
   pool.query('SELECT count(*)::int AS n FROM offer_redemptions WHERE offer_id=$1 AND reversed_at IS NULL AND buyer_organization_id=$2',[o.id,c.get('organizationId')])
  ]);
  if(o.max_redemptions!==null&&global.rows[0].n>=o.max_redemptions)throw new BusinessFailure(409,'This offer has reached its redemption limit');
  if(buyer.rows[0].n>=o.per_buyer_limit)throw new BusinessFailure(409,'Your organisation has already used this offer the maximum number of times');
  return c.json({code:o.code,name:o.name,discountType:o.discount_type,discountValue:o.discount_value,maxDiscountPaise:o.max_discount_paise,minimumSubtotalPaise:o.minimum_subtotal_paise});
 });
 return app;
}
