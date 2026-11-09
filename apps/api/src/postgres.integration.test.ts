import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {Pool} from 'pg';
import {createProductionApp} from './production-app.js';

/** Real PostgreSQL lifecycle test. CI starts a disposable PostgreSQL 16 service,
 * runs numbered migrations, bootstraps the admin, and inserts demo catalogue.
 * No application account, production DB, or network provider is used.
 */
const enabled=process.env.FRESHPREP_PG_INTEGRATION==='true';
const suite=enabled?describe:describe.skip;
const secret='freshprep-ci-isolated-jwt-key-at-least-32-chars-long-123456';
const adminEmail='freshprep-ci-admin@example.invalid';
const adminPassword='CI-only-password-never-use-in-prod-123!';
type Login={accessToken:string};
type Created={organizationId:string;kitchenId:string};
suite('real PostgreSQL UAT and negative flows',()=>{
 let pool:Pool;
 let app:ReturnType<typeof createProductionApp>;
 let adminToken='',customerToken='',customerOrg='',kitchenId='',slotId='',variantId='',grams=500,deliveryDate='';
 const event={eventType:'ORDER_CREATED',subjectType:'ORDER',subjectId:'pending',
  location:{source:'UNAVAILABLE',unavailableReason:'CI cannot read device GPS',consentStatus:'NOT_REQUESTED'},
  details:{client:'ci-integration'}};
 const request=(path:string,method='GET',body?:unknown,token=adminToken)=>
  app.request(path,{method,headers:{
   ...(body?{'Content-Type':'application/json'}:{}),
   ...(token?{Authorization:'Bearer '+token}:{})
  },body:body?JSON.stringify(body):undefined});
 beforeAll(async()=>{
  if(!process.env.DATABASE_URL)throw Error('DATABASE_URL required for PostgreSQL integration');
  pool=new Pool({connectionString:process.env.DATABASE_URL,max:5});
  await pool.query('SELECT 1');
  app=createProductionApp(pool,()=>new Date(),secret);
  const org=await pool.query<{organization_id:string}>("SELECT organization_id FROM memberships WHERE role='SUPERADMIN' LIMIT 1");
  if(!org.rowCount)throw Error('No bootstrapped Super Admin in CI database');
  const r=await request('/auth/login','POST',{email:adminEmail,password:adminPassword,
   organizationId:org.rows[0].organization_id},'');
  if(r.status!==200)throw Error('Bootstrap admin login failed ('+r.status+'): '+await r.text());
  adminToken=(await r.json() as Login).accessToken;
  deliveryDate=new Date(Date.now()+10*86400000).toISOString().slice(0,10);
 });
 afterAll(async()=>{if(pool)await pool.end()});
 it('migrates, authenticates and loads at least 100 sample product variants',async()=>{
  const [health,me,cat]=await Promise.all([
   app.request('/health'),request('/v1/me'),request('/v1/catalog')
  ]);
  expect(health.status).toBe(200);expect(me.status).toBe(200);expect(cat.status).toBe(200);
  const products=await cat.json() as {id:string;minimum_grams:number}[];
  expect(products.length).toBeGreaterThanOrEqual(100);
  variantId=products[0].id;grams=products[0].minimum_grams;
 });
 it('rejects untrusted role header and unauthorised endpoints',async()=>{
  expect((await app.request('/v1/admin/staff',{headers:{'x-role':'SUPERADMIN'}})).status).toBe(401);
  expect((await app.request('/v1/ops/production-plan?date='+deliveryDate)).status).toBe(401);
 });
 it('onboards a kitchen and rejects conflicting customer email',async()=>{
  const body={organizationName:'FreshPrep UAT Test Kitchen',contactEmail:'uat-customer@example.invalid',
   contactPassword:'Customer-ci-secret-123456',kitchenName:'Kitchen One',
   address:'12 Mock Street, Bengaluru 560040',zoneCode:'BENGALURU_DEMO'};
  const first=await request('/v1/admin/customers','POST',body);
  expect(first.status).toBe(201);
  const created=await first.json() as Created;customerOrg=created.organizationId;kitchenId=created.kitchenId;
  const duplicate=await request('/v1/admin/customers','POST',body);
  expect(duplicate.status).toBe(409);
  const login=await request('/auth/login','POST',{
   email:body.contactEmail,password:body.contactPassword,organizationId:customerOrg
  },'');
  expect(login.status).toBe(200);
  customerToken=(await login.json() as Login).accessToken;
  expect((await request('/v1/admin/staff','GET',undefined,customerToken)).status).toBe(403);
  const kitchenRes=await request('/v1/kitchens','GET',undefined,customerToken);
  expect(kitchenRes.status).toBe(200);
  expect((await kitchenRes.json() as {id:string}[]).map(x=>x.id)).toContain(kitchenId);
 });
 it('validates order payloads, rejects invalid quantity and enforces scoped kitchen',async()=>{
  const slots=await request('/v1/delivery-slots','GET',undefined,customerToken);
  expect(slots.status).toBe(200);
  slotId=(await slots.json() as {id:string;zone_code:string}[]).find(x=>x.zone_code==='BENGALURU_DEMO')!.id;
  const body={kitchenId,slotId,deliveryDate,idempotencyKey:'integration-negative-case',
   items:[{variantId,grams}],event};
  expect((await request('/v1/orders','POST',{...body,items:[]},customerToken)).status).toBe(400);
  expect((await request('/v1/orders','POST',{...body,items:[{variantId,grams:grams+1}]},customerToken)).status).toBe(422);
  expect((await request('/v1/orders','POST',{...body,kitchenId:'11111111-1111-4111-8111-111111111111'},customerToken)).status).toBe(422);
 });
 it('creates one order and replays idempotently without double-reserving the slot',async()=>{
  const key='integration-safe-order-key-0001';
  const body={kitchenId,slotId,deliveryDate,idempotencyKey:key,items:[{variantId,grams}],event};
  const first=await request('/v1/orders','POST',body,customerToken);
  expect(first.status).toBe(201);
  const created=await first.json() as {id:string;replayed:boolean};
  expect(created.replayed).toBe(false);
  const replay=await request('/v1/orders','POST',body,customerToken);
  expect(replay.status).toBe(200);
  expect(await replay.json()).toMatchObject({id:created.id,replayed:true});
  const db=await pool.query<{n:string}>('SELECT count(*)::text AS n FROM slot_reservations WHERE order_id=$1',[created.id]);
  expect(Number(db.rows[0].n)).toBe(1);
 });
 it('generates a recurring order exactly once and exposes it only to the customer org',async()=>{
  const newSchedule=await request('/v1/recurrences','POST',{
   kitchenId,slotId,startDate:deliveryDate,frequency:'DAILY',weekdays:[],
   items:[{variantId,grams}]
  },customerToken);
  expect(newSchedule.status).toBe(201);
  const generation=await request('/v1/admin/recurrences/generate','POST',{deliveryDate});
  expect(generation.status).toBe(200);
  expect((await generation.json() as {summary:{CREATED:number}}).summary.CREATED).toBeGreaterThanOrEqual(1);
  const second=await request('/v1/admin/recurrences/generate','POST',{deliveryDate});
  expect(second.status).toBe(200);
  expect((await second.json() as {summary:{EXISTS:number}}).summary.EXISTS).toBeGreaterThanOrEqual(1);
  const orders=await request('/v1/orders','GET',undefined,customerToken);
  expect(orders.status).toBe(200);
  expect((await orders.json() as unknown[]).length).toBeGreaterThanOrEqual(2);
 });
 it('rejects a customer attempting to generate schedules or manage catalogue',async()=>{
  expect((await request('/v1/admin/recurrences/generate','POST',{deliveryDate},customerToken)).status).toBe(403);
  expect((await request('/v1/admin/variants','POST',{sku:'FAKE-FOOD'},customerToken)).status).toBe(403);
 });
});
