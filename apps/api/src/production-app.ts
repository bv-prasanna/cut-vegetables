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
  if(!canAny(c.get('roles'),'catalog:read')&&!canAny(c.get('roles'),'catalog:write'))return c.json(reject('Forbidden'),403);
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
 app.post('/v1/orders',async c=>{
  if(!canAny(c.get('roles'),'orders:write'))return c.json(reject('Forbidden'),403);
  const parsed=orderSchema.safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return c.json({error:'Invalid order',issues:parsed.error.flatten()},400);
  const data=parsed.data;try{localDate(data.deliveryDate)}catch{return c.json(reject('Invalid delivery date'),400);}
  if(data.event.eventType!=='ORDER_CREATED')return c.json(reject('Expected ORDER_CREATED audit event'),400);
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   // Lock the slot row to serialize reservations and capacity checks across processes.
   const slotQ=await client.query('SELECT * FROM delivery_slots WHERE id=$1 FOR UPDATE',[data.slotId]);
   const slot=slotQ.rows[0];if(!slot||!slot.active){await client.query('ROLLBACK');return c.json(reject('Slot unavailable'),422);}
   const existing=await client.query('SELECT id FROM orders WHERE organization_id=$1 AND idempotency_key=$2',[c.get('organizationId'),data.idempotencyKey]);
   if(existing.rowCount){await client.query('COMMIT');return c.json({id:existing.rows[0].id,replayed:true});}
   const kitchen=await client.query('SELECT id,zone_code,producer_organization_id FROM kitchens WHERE id=$1 AND organization_id=$2 AND active=true',[data.kitchenId,c.get('organizationId')]);
   if(!kitchen.rowCount||kitchen.rows[0].zone_code!==slot.zone_code||!kitchen.rows[0].producer_organization_id){await client.query('ROLLBACK');return c.json(reject('Kitchen, zone or producer assignment unavailable'),422);}
   if(clock().getTime()>=cutoffInstant(data.deliveryDate,{id:slot.id,label:slot.label,startMinute:slot.start_minute,endMinute:slot.end_minute,cutoffDayOffset:slot.cutoff_day_offset,cutoffMinute:slot.cutoff_minute,capacityOrders:slot.capacity_orders,active:slot.active}).getTime()){await client.query('ROLLBACK');return c.json(reject('Slot cutoff reached'),422);}
   const blackout=await client.query('SELECT 1 FROM slot_blackouts WHERE slot_id=$1 AND delivery_date=$2::date',[data.slotId,data.deliveryDate]);
   if(blackout.rowCount){await client.query('ROLLBACK');return c.json(reject('Slot blackout'),422);}
   const count=await client.query('SELECT count(*)::int AS n FROM slot_reservations WHERE slot_id=$1 AND delivery_date=$2::date',[data.slotId,data.deliveryDate]);
   if(count.rows[0].n>=slot.capacity_orders){await client.query('ROLLBACK');return c.json(reject('Slot full'),409);}
   const ids=data.items.map(i=>i.variantId);
   if(new Set(ids).size!==ids.length){await client.query('ROLLBACK');return c.json(reject('Duplicate variant'),422);}
   const variants=await client.query('SELECT id,price_paise_per_kg,minimum_grams,increment_grams FROM product_variants WHERE active=true AND id=ANY($1::uuid[])',[ids]);
   const prices=new Map<string,{price_paise_per_kg:number;minimum_grams:number;increment_grams:number}>(variants.rows.map(v=>[v.id,v]));
   if(prices.size!==ids.length||data.items.some(i=>{const v=prices.get(i.variantId);return !v||i.grams<v.minimum_grams||(i.grams-v.minimum_grams)%v.increment_grams!==0;})){await client.query('ROLLBACK');return c.json(reject('Invalid variant or quantity'),422);}
   const inserted=await client.query('INSERT INTO orders(organization_id,kitchen_id,slot_id,delivery_date,idempotency_key,producer_organization_id) VALUES($1,$2,$3,$4::date,$5,$6) RETURNING id',[c.get('organizationId'),data.kitchenId,data.slotId,data.deliveryDate,data.idempotencyKey,kitchen.rows[0].producer_organization_id]);
   const orderId:string=inserted.rows[0].id;
   for(const item of data.items){const v=prices.get(item.variantId)!;const amount=Math.round(v.price_paise_per_kg*item.grams/1000);await client.query('INSERT INTO order_items(order_id,variant_id,grams,price_paise_per_kg,line_total_paise) VALUES($1,$2,$3,$4,$5)',[orderId,item.variantId,item.grams,v.price_paise_per_kg,amount]);}
   await client.query('INSERT INTO slot_reservations(slot_id,delivery_date,order_id) VALUES($1,$2::date,$3)',[data.slotId,data.deliveryDate,orderId]);
   await insertGeoEvent(client,{...data.event,subjectId:orderId},c.get('organizationId'),c.get('userId'));
   await client.query('COMMIT');return c.json({id:orderId,replayed:false},201);
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
 });
 app.route('/v1',createRecurrenceRoutes(pool,clock));
 app.route('/v1',createAdminRoutes(pool));
 app.route('/v1',createOperationsRoutes(pool));
 app.route('/v1',createStaffBoardRoutes(pool));
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
