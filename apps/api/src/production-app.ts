import {Hono} from 'hono';
import {cors} from 'hono/cors';
import {secureHeaders} from 'hono/secure-headers';
import {loginScope,loginLocked,loginFailed,loginSucceeded} from './login-guard.js';
import {createAdminRoutes} from './admin-routes.js';
import {z} from 'zod';
import {Pool, type PoolClient} from 'pg';
import {passwordMatches} from './security.js';
import {issueJwt,verifyJwt,readBearer,jwtKey} from './jwt-auth.js';
import {isRole,canAny,type Role} from './authorization.js';
import {geoEventSchema} from './geo-events.js';
import {cutoffInstant,localDate} from './scheduling.js';
import {createOperationsRoutes} from './ops-routes.js';
import {createStaffBoardRoutes} from './staff-query-routes.js';
import {createRecurrenceRoutes} from './recurrence-routes.js';
import {createCatalogAdminRoutes} from './catalog-admin.js';
import {createMarketingRoutes} from './marketing-routes.js';
import {createCommercialRoutes} from './commercial-routes.js';
import {loadContractPricing} from './commercial-pricing.js';
import {createQuoteRoutes} from './quote-routes.js';
import {createOrderLifecycleRoutes} from './order-lifecycle-routes.js';
import {createSupportRoutes} from './support-routes.js';
import {createFinanceRoutes} from './finance-routes.js';
type Context={Variables:{userId:string;organizationId:string;roles:Role[]}};
const loginSchema=z.object({email:z.string().email().max(254),password:z.string().min(1).max(1024),organizationId:z.string().uuid()});
const orderSchema=z.object({
 kitchenId:z.string().uuid(),slotId:z.string().uuid(),
 deliveryDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
 idempotencyKey:z.string().min(8).max(120),
 items:z.array(z.object({variantId:z.string().uuid(),grams:z.number().int().positive()})).min(1).max(50),
 event:geoEventSchema
});
const reject=(message:string)=>({error:message});
export function createProductionApp(pool:Pool,clock:()=>Date=()=>new Date(),jwtSecret=process.env.JWT_SECRET){
 const secret=jwtSecret??'';
 jwtKey(secret); // Fail closed at startup. Never deploy with an implicit secret.
 const app=new Hono<Context>();
 const allowedOrigins=new Set((process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean));
 if(process.env.NODE_ENV==='production'&&!allowedOrigins.size)
  throw new Error('ALLOWED_ORIGINS must list exact HTTPS frontend origins in production');
 if(process.env.NODE_ENV!=='production'){
  allowedOrigins.add('http://127.0.0.1:5173');
  allowedOrigins.add('http://localhost:5173');
 }
 app.use('*',cors({
  origin:[...allowedOrigins],
  allowMethods:['GET','POST','PATCH','DELETE','OPTIONS'],
  allowHeaders:['Content-Type','Authorization'],
  maxAge:600
 }));
 app.use('*',secureHeaders());
 app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');await next();});
 app.get('/health',c=>c.json({status:'ok',mode:'POSTGRES_API'}));
 app.post('/auth/login',async c=>{
  const parsed=loginSchema.safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return c.json(reject('Invalid login request'),400);
  const {email,password,organizationId}=parsed.data;
  const scope=loginScope(email,organizationId);
  if(await loginLocked(pool,scope,clock()))return c.json(reject('Too many login attempts. Try again later.'),429);
  const q=await pool.query<{id:string;password_hash:string;active:boolean}>('SELECT id,password_hash,active FROM users WHERE lower(email)=lower($1)',[email]);
  const user=q.rows[0];
  if(!user||!user.active||!passwordMatches(password,user.password_hash)){
   await loginFailed(pool,scope,clock());
   return c.json(reject('Invalid credentials'),401);
  }
  const membership=await pool.query('SELECT 1 FROM memberships WHERE user_id=$1 AND organization_id=$2 LIMIT 1',[user.id,organizationId]);
  if(!membership.rowCount){
   await loginFailed(pool,scope,clock());
   return c.json(reject('Invalid credentials'),401);
  }
  await loginSucceeded(pool,scope);
  const issued=await issueJwt(secret,user.id,organizationId,clock());
  await pool.query('INSERT INTO auth_sessions(user_id,organization_id,token_hash,expires_at) VALUES($1,$2,$3,$4)',[
   user.id,organizationId,issued.sessionHash,new Date(clock().getTime()+issued.expiresInSeconds*1000)
  ]);
  return c.json({tokenType:'Bearer',accessToken:issued.accessToken,token:issued.accessToken,expiresInSeconds:issued.expiresInSeconds});
 });
 app.use('/v1/*',async(c,next)=>{
  const token=readBearer(c.req.header('authorization'));
  if(!token)return c.json(reject('Unauthorized'),401);
  const verified=await verifyJwt(token,secret,clock());
  if(!verified)return c.json(reject('Unauthorized'),401);
  const q=await pool.query<{user_id:string;organization_id:string;role:string}>(`SELECT s.user_id,s.organization_id,m.role FROM auth_sessions s
 JOIN users u ON u.id=s.user_id AND u.active=true
 JOIN memberships m ON m.user_id=s.user_id AND m.organization_id=s.organization_id
 WHERE s.token_hash=$1 AND s.user_id=$2 AND s.organization_id=$3
  AND s.revoked_at IS NULL AND s.expires_at>$4`,[
    verified.sessionHash,verified.userId,verified.organizationId,clock()
  ]);
  if(!q.rowCount)return c.json(reject('Unauthorized'),401);
  const roles=q.rows.map(r=>r.role).filter(isRole);
  if(!roles.length)return c.json(reject('Forbidden'),403);
  c.set('userId',q.rows[0].user_id);c.set('organizationId',q.rows[0].organization_id);c.set('roles',roles);
  await next();
 });
 app.post('/v1/logout',async c=>{
  const verified=await verifyJwt(readBearer(c.req.header('authorization'))??'',secret,clock());
  if(!verified)return c.json(reject('Unauthorized'),401);
  await pool.query('UPDATE auth_sessions SET revoked_at=$2 WHERE token_hash=$1',[verified.sessionHash,clock()]);
  return c.json({ok:true});
 });
 app.get('/v1/me',c=>c.json({
  userId:c.get('userId'),organizationId:c.get('organizationId'),roles:c.get('roles')
 }));
 app.get('/v1/catalog',async c=>{
  const roles=c.get('roles');
  if(!canAny(roles,'catalog:read')&&!canAny(roles,'catalog:write'))return c.json(reject('Forbidden'),403);
  const customer=roles.some(r=>['CUSTOMER_ADMIN','CUSTOMER_BUYER','CUSTOMER_VIEWER'].includes(r));
  if(customer){
   const kitchenId=c.req.query('kitchenId'),deliveryDate=c.req.query('deliveryDate')||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(clock());
   if(!kitchenId||!z.string().uuid().safeParse(kitchenId).success)return c.json(reject('Select a valid kitchen to load its contracted catalogue'),400);
   try{localDate(deliveryDate);}catch{return c.json(reject('Invalid delivery date'),400);}
   const kitchen=await pool.query<{producer_organization_id:string|null}>('SELECT producer_organization_id FROM kitchens WHERE id=$1 AND organization_id=$2 AND active=true',[kitchenId,c.get('organizationId')]);
   if(!kitchen.rowCount||!kitchen.rows[0].producer_organization_id)return c.json(reject('Kitchen is not assigned to an active supplier'),422);
   const contract=await pool.query<{id:string}>("SELECT id FROM customer_contracts WHERE buyer_organization_id=$1 AND producer_organization_id=$2 AND status='ACTIVE' AND valid_from<=$3::date AND (valid_to IS NULL OR valid_to>=$3::date) AND (kitchen_id IS NULL OR kitchen_id=$4) ORDER BY (kitchen_id IS NOT NULL) DESC,version DESC LIMIT 1",[c.get('organizationId'),kitchen.rows[0].producer_organization_id,deliveryDate,kitchenId]);
   if(!contract.rowCount)return c.json(reject('No active commercial contract for this kitchen and delivery date. Contact your account manager.'),409);
   const q=await pool.query(`SELECT DISTINCT ON (pv.id) pv.id,pv.sku,v.name AS vegetable,pv.method_code AS preparation,
    pv.size_kind,pv.size_number,pv.size_unit,pv.size_label,pv.image_url,
    r.price_paise_per_kg,r.minimum_grams,r.increment_grams,c.delivery_fee_paise
    FROM contract_price_rules r JOIN customer_contracts c ON c.id=r.contract_id
    JOIN product_variants pv ON pv.id=r.variant_id JOIN vegetables v ON v.id=pv.vegetable_id
    WHERE c.id=$1 AND r.status='APPROVED' AND r.effective_from<=$2::date
     AND (r.effective_to IS NULL OR r.effective_to>=$2::date)
     AND (r.kitchen_id IS NULL OR r.kitchen_id=$3) AND pv.active=true AND v.active=true
    ORDER BY pv.id,(r.kitchen_id IS NOT NULL) DESC,r.version DESC`,[contract.rows[0].id,deliveryDate,kitchenId]);
   return c.json(q.rows);
  }
  const q=await pool.query(`SELECT pv.id,pv.sku,v.name AS vegetable,pv.method_code AS preparation,
   pv.size_kind,pv.size_number,pv.size_unit,pv.size_label,pv.image_url,pv.price_paise_per_kg,
   pv.minimum_grams,pv.increment_grams FROM product_variants pv
   JOIN vegetables v ON v.id=pv.vegetable_id WHERE pv.active=true AND v.active=true ORDER BY v.name,pv.sku`);
  return c.json(q.rows);
 });
 app.get('/v1/orders',async c=>{
  if(!canAny(c.get('roles'),'orders:read'))return c.json(reject('Forbidden'),403);
  const q=await pool.query('SELECT id,kitchen_id,delivery_date,slot_id,state,created_at FROM orders WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100',[c.get('organizationId')]);
  return c.json(q.rows);
 });
 app.get('/v1/orders/:id',async c=>{
  if(!canAny(c.get('roles'),'orders:read'))return c.json(reject('Forbidden'),403);
  const id=c.req.param('id');
  if(!z.string().uuid().safeParse(id).success)return c.json(reject('Invalid order ID'),400);
  const order=await pool.query(`SELECT o.id,o.kitchen_id,k.name AS kitchen_name,o.slot_id,s.label AS slot_label,
   o.delivery_date::text AS delivery_date,o.state,o.created_at,o.subtotal_paise,o.delivery_fee_paise,
   o.discount_paise,o.total_paise,o.pricing_snapshot
   FROM orders o JOIN kitchens k ON k.id=o.kitchen_id JOIN delivery_slots s ON s.id=o.slot_id
   WHERE o.id=$1 AND o.organization_id=$2`,[id,c.get('organizationId')]);
  if(!order.rowCount)return c.json(reject('Order not found'),404);
  const [items,packs,delivery]=await Promise.all([
   pool.query(`SELECT oi.variant_id,oi.grams,oi.price_paise_per_kg,oi.line_total_paise,
    pv.sku,v.name AS vegetable,pv.method_code AS preparation,pv.size_kind,pv.size_number,pv.size_unit,pv.size_label
    FROM order_items oi JOIN product_variants pv ON pv.id=oi.variant_id
    JOIN vegetables v ON v.id=pv.vegetable_id WHERE oi.order_id=$1 ORDER BY v.name,pv.sku`,[id]),
   pool.query(`SELECT pu.id,pu.label_code,pu.net_grams,pu.packed_at,pu.use_by,pb.id AS batch_id,
    pb.state AS batch_state FROM pack_units pu JOIN production_batches pb ON pb.id=pu.batch_id
    WHERE pu.order_id=$1 ORDER BY pu.packed_at,pu.id`,[id]),
   pool.query(`SELECT ds.id AS stop_id,ds.status AS delivery_status,ds.stop_number,ds.arrived_at,ds.completed_at,
    dr.id AS run_id,dr.status AS run_status,dp.received_by,dp.received_at AS proof_received_at,dp.note AS proof_note
    FROM delivery_stops ds JOIN delivery_runs dr ON dr.id=ds.run_id
    LEFT JOIN delivery_proofs dp ON dp.stop_id=ds.id WHERE ds.order_id=$1`,[id])
  ]);
  return c.json({...order.rows[0],items:items.rows,packUnits:packs.rows,delivery:delivery.rows[0]??null});
 });
 app.post('/v1/orders',async c=>{
  if(!canAny(c.get('roles'),'orders:write'))return c.json(reject('Forbidden'),403);
  const parsed=orderSchema.safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return c.json({error:'Invalid order',issues:parsed.error.flatten()},400);
  const data=parsed.data;try{localDate(data.deliveryDate)}catch{return c.json(reject('Invalid delivery date'),400);}
  if(data.event.eventType!=='ORDER_CREATED')return c.json(reject('Expected ORDER_CREATED audit event'),400);
  const requestFingerprint=JSON.stringify({
   kitchenId:data.kitchenId,slotId:data.slotId,deliveryDate:data.deliveryDate,
   items:[...data.items].sort((a,b)=>a.variantId.localeCompare(b.variantId))
  });
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   // Lock the slot row to serialize reservations and capacity checks across processes.
   const slotQ=await client.query('SELECT * FROM delivery_slots WHERE id=$1 FOR UPDATE',[data.slotId]);
   const slot=slotQ.rows[0];if(!slot||!slot.active){await client.query('ROLLBACK');return c.json(reject('Slot unavailable'),422);}
   const existing=await client.query('SELECT id,request_fingerprint FROM orders WHERE organization_id=$1 AND idempotency_key=$2 FOR UPDATE',[c.get('organizationId'),data.idempotencyKey]);
   if(existing.rowCount){
    if(!existing.rows[0].request_fingerprint||existing.rows[0].request_fingerprint!==requestFingerprint){
     await client.query('ROLLBACK');
     return c.json(reject('This idempotency key was already used for a different or unverifiable order request. Start a new order.'),409);
    }
    await client.query('COMMIT');return c.json({id:existing.rows[0].id,replayed:true});
   }
   const kitchen=await client.query('SELECT id,zone_code,producer_organization_id FROM kitchens WHERE id=$1 AND organization_id=$2 AND active=true',[data.kitchenId,c.get('organizationId')]);
   if(!kitchen.rowCount||kitchen.rows[0].zone_code!==slot.zone_code||!kitchen.rows[0].producer_organization_id){await client.query('ROLLBACK');return c.json(reject('Kitchen, zone or producer assignment unavailable'),422);}
   if(clock().getTime()>=cutoffInstant(data.deliveryDate,{id:slot.id,label:slot.label,startMinute:slot.start_minute,endMinute:slot.end_minute,cutoffDayOffset:slot.cutoff_day_offset,cutoffMinute:slot.cutoff_minute,capacityOrders:slot.capacity_orders,active:slot.active}).getTime()){await client.query('ROLLBACK');return c.json(reject('Slot cutoff reached'),422);}
   const blackout=await client.query('SELECT 1 FROM slot_blackouts WHERE slot_id=$1 AND delivery_date=$2::date',[data.slotId,data.deliveryDate]);
   if(blackout.rowCount){await client.query('ROLLBACK');return c.json(reject('Slot blackout'),422);}
   const count=await client.query('SELECT count(*)::int AS n FROM slot_reservations WHERE slot_id=$1 AND delivery_date=$2::date',[data.slotId,data.deliveryDate]);
   if(count.rows[0].n>=slot.capacity_orders){await client.query('ROLLBACK');return c.json(reject('Slot full'),409);}
   const ids=data.items.map(i=>i.variantId);
   if(new Set(ids).size!==ids.length){await client.query('ROLLBACK');return c.json(reject('Duplicate variant'),422);}
   const pricing=await loadContractPricing(client,c.get('organizationId'),kitchen.rows[0].producer_organization_id,data.kitchenId,data.deliveryDate,ids);
   if(!pricing){await client.query('ROLLBACK');return c.json(reject('No active commercial contract for this kitchen and delivery date'),409);}
   const prices=pricing.rules;
   if(prices.size!==ids.length||data.items.some(i=>{const v=prices.get(i.variantId);return !v||i.grams<v.minimum_grams||(i.grams-v.minimum_grams)%v.increment_grams!==0;})){await client.query('ROLLBACK');return c.json(reject('One or more products are not covered by an approved contract price or quantity rule'),422);}
   const subtotal=data.items.reduce((sum,item)=>sum+Math.round(prices.get(item.variantId)!.price_paise_per_kg*item.grams/1000),0);
   if(subtotal<Number(pricing.contract.minimum_order_value_paise)){await client.query('ROLLBACK');return c.json(reject('Order is below the contracted minimum order value'),422);}
   const deliveryFee=Number(pricing.contract.delivery_fee_paise),total=subtotal+deliveryFee;
   const pricingSnapshot={contractId:pricing.contract.id,contractVersion:pricing.contract.version,subtotalPaise:subtotal,deliveryFeePaise:deliveryFee,totalPaise:total,currency:'INR'};
   const inserted=await client.query('INSERT INTO orders(organization_id,kitchen_id,slot_id,delivery_date,idempotency_key,request_fingerprint,producer_organization_id,contract_id,contract_version,subtotal_paise,delivery_fee_paise,total_paise,pricing_snapshot) VALUES($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb) RETURNING id',[c.get('organizationId'),data.kitchenId,data.slotId,data.deliveryDate,data.idempotencyKey,requestFingerprint,kitchen.rows[0].producer_organization_id,pricing.contract.id,pricing.contract.version,subtotal,deliveryFee,total,JSON.stringify(pricingSnapshot)]);
   const orderId:string=inserted.rows[0].id;
   for(const item of data.items){const v=prices.get(item.variantId)!;const amount=Math.round(v.price_paise_per_kg*item.grams/1000);
    const itemSnapshot={priceRuleId:v.id,pricePaisePerKg:v.price_paise_per_kg,minimumGrams:v.minimum_grams,incrementGrams:v.increment_grams,serviceDate:data.deliveryDate};
    await client.query('INSERT INTO order_items(order_id,variant_id,grams,price_paise_per_kg,line_total_paise,contract_price_rule_id,pricing_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)',[orderId,item.variantId,item.grams,v.price_paise_per_kg,amount,v.id,JSON.stringify(itemSnapshot)]);
   }
   await client.query('INSERT INTO slot_reservations(slot_id,delivery_date,order_id) VALUES($1,$2::date,$3)',[data.slotId,data.deliveryDate,orderId]);
   await insertGeoEvent(client,{...data.event,subjectId:orderId},c.get('organizationId'),c.get('userId'));
   await client.query('COMMIT');return c.json({id:orderId,replayed:false},201);
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
 });
 app.route('/v1',createRecurrenceRoutes(pool,clock));
 app.route('/v1',createCommercialRoutes(pool));
 app.route('/v1',createQuoteRoutes(pool,clock));
 app.route('/v1',createOrderLifecycleRoutes(pool,clock));
 app.route('/v1',createSupportRoutes(pool));
 app.route('/v1',createFinanceRoutes(pool));
 app.route('/v1',createCatalogAdminRoutes(pool));
 app.route('/v1',createAdminRoutes(pool));
 app.route('/v1',createOperationsRoutes(pool));
 app.route('/v1',createStaffBoardRoutes(pool));
 app.route('/',createMarketingRoutes(pool,clock));
 app.onError((err,c)=>{console.error('API error',err.message);return c.json(reject('Internal server error'),500);});
 return app;
}
async function insertGeoEvent(client:PoolClient,event:z.infer<typeof geoEventSchema>,organizationId:string,userId:string){
 const location=event.location;
 const hasGeo='latitude' in location;
 await client.query(`INSERT INTO event_log(organization_id,actor_id,event_type,subject_type,subject_id,source,latitude,longitude,accuracy_meters,captured_at,consent_status,unavailable_reason,request_id,details)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)`,[
 organizationId,userId,event.eventType,event.subjectType,event.subjectId,location.source,
 hasGeo?location.latitude:null,hasGeo?location.longitude:null,hasGeo?(location.accuracyMeters??null):null,
 hasGeo?location.capturedAt:null,location.consentStatus,hasGeo?null:location.unavailableReason,event.requestId??null,JSON.stringify(event.details)]);
}
