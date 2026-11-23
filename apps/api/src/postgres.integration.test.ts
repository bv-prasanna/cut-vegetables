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
 let adminToken='',financeToken='',customerToken='',customerOrg='',kitchenId='',slotId='',variantId='',grams=500,deliveryDate='',producerOrg='',orderId='',contractId='',basePrice=0,minimumGrams=0,incrementGrams=0,quoteVariantId='',quoteGrams=0,quoteBasePrice=0,quoteMinimum=0,quoteIncrement=0,quoteId='';
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
  producerOrg=org.rows[0].organization_id;
  const r=await request('/auth/login','POST',{email:adminEmail,password:adminPassword,
   organizationId:producerOrg},'');
  if(r.status!==200)throw Error('Bootstrap admin login failed ('+r.status+'): '+await r.text());
  adminToken=(await r.json() as Login).accessToken;
  // Use a date within the admin's rolling 7-day slot-utilisation horizon.
  deliveryDate=new Date(Date.now()+5*86400000).toISOString().slice(0,10);
 });
 afterAll(async()=>{if(pool)await pool.end()});
 it('migrates, authenticates and loads at least 100 sample product variants',async()=>{
  const [health,me,cat]=await Promise.all([
   app.request('/health'),request('/v1/me'),request('/v1/catalog')
  ]);
  expect(health.status).toBe(200);expect(me.status).toBe(200);expect(cat.status).toBe(200);
  const products=await cat.json() as {id:string;minimum_grams:number;increment_grams:number;price_paise_per_kg:number}[];
  expect(products.length).toBeGreaterThanOrEqual(100);
  variantId=products[0].id;grams=products[0].minimum_grams;basePrice=products[0].price_paise_per_kg;minimumGrams=products[0].minimum_grams;incrementGrams=products[0].increment_grams;quoteVariantId=products[1].id;quoteGrams=products[1].minimum_grams;quoteBasePrice=products[1].price_paise_per_kg;quoteMinimum=products[1].minimum_grams;quoteIncrement=products[1].increment_grams;
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
  expect((await request('/v1/catalog?kitchenId='+kitchenId,'GET',undefined,customerToken)).status).toBe(409);
  expect((await request('/v1/admin/contracts','GET',undefined,customerToken)).status).toBe(403);
  const today=new Date().toISOString().slice(0,10);
  const createdContract=await request('/v1/admin/contracts','POST',{
   buyerOrganizationId:customerOrg,kitchenId,contractCode:'UAT-KITCHEN-001',name:'UAT Kitchen Contract',
   validFrom:today,minimumOrderValuePaise:0,deliveryFeePaise:1500,paymentTermsDays:7
  });
  expect(createdContract.status,await createdContract.clone().text()).toBe(201);
  contractId=(await createdContract.json() as {id:string}).id;
  const priceRule=await request('/v1/admin/contracts/'+contractId+'/prices','POST',{
   variantId,pricePaisePerKg:basePrice+250,minimumGrams,incrementGrams,effectiveFrom:today
  });
  expect(priceRule.status).toBe(201);
  expect(await priceRule.json()).toMatchObject({status:'APPROVED'});
  const quotePriceRule=await request('/v1/admin/contracts/'+contractId+'/prices','POST',{
   variantId:quoteVariantId,pricePaisePerKg:quoteBasePrice+400,minimumGrams:quoteMinimum,incrementGrams:quoteIncrement,effectiveFrom:today
  });
  expect(quotePriceRule.status).toBe(201);
  const activated=await request('/v1/admin/contracts/'+contractId+'/status','PATCH',{status:'ACTIVE'});
  expect(activated.status).toBe(200);
  const contractedCatalog=await request('/v1/catalog?kitchenId='+kitchenId+'&deliveryDate='+deliveryDate,'GET',undefined,customerToken);
  expect(contractedCatalog.status).toBe(200);
  const contractedProducts=await contractedCatalog.json() as {id:string;price_paise_per_kg:number;delivery_fee_paise:number}[];
  expect(Number(contractedProducts.find(x=>x.id===variantId)?.price_paise_per_kg)).toBe(basePrice+250);
  expect(Number(contractedProducts.find(x=>x.id===variantId)?.delivery_fee_paise)).toBe(1500);
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
 it('supports buyer quote request, sales proposal, acceptance and idempotent replay',async()=>{
  const created=await request('/v1/quotes','POST',{
   kitchenId,slotId,deliveryDate,idempotencyKey:'quote-request-idempotency-0001',
   items:[{variantId:quoteVariantId,grams:quoteGrams}]
  },customerToken);
  expect(created.status).toBe(201);
  quoteId=(await created.json() as {id:string}).id;
  expect((await request('/v1/quotes/'+quoteId,'GET',undefined,customerToken)).status).toBe(200);
  expect((await request('/v1/admin/quotes/'+quoteId+'/propose','POST',{discountPaise:0},customerToken)).status).toBe(403);
  const proposed=await request('/v1/admin/quotes/'+quoteId+'/propose','POST',{discountPaise:100,validHours:48,note:'Approved UAT discount'});
  expect(proposed.status).toBe(200);
  expect(await proposed.json()).toMatchObject({state:'PROPOSED',discountPaise:100});
  const accepted=await request('/v1/quotes/'+quoteId+'/accept','POST',{},customerToken);
  expect(accepted.status).toBe(201);
  const acceptedBody=await accepted.json() as {id:string;replayed:boolean};
  expect(acceptedBody.replayed).toBe(false);
  const replay=await request('/v1/quotes/'+quoteId+'/accept','POST',{},customerToken);
  expect(replay.status).toBe(200);
  expect(await replay.json()).toMatchObject({id:acceptedBody.id,replayed:true});
  const snapshot=await pool.query<{quote_id:string;discount_paise:string;total_paise:string;subtotal_paise:string;delivery_fee_paise:string}>(
   'SELECT quote_id,discount_paise,total_paise,subtotal_paise,delivery_fee_paise FROM orders WHERE id=$1',[acceptedBody.id]);
  expect(snapshot.rows[0].quote_id).toBe(quoteId);
  expect(Number(snapshot.rows[0].discount_paise)).toBe(100);
  expect(Number(snapshot.rows[0].total_paise)).toBe(Number(snapshot.rows[0].subtotal_paise)-100+Number(snapshot.rows[0].delivery_fee_paise));
 });
 it('creates one order and replays idempotently without double-reserving the slot',async()=>{
  const startsAt=new Date(Date.now()-60_000).toISOString(),endsAt=new Date(Date.now()+86_400_000).toISOString();
  const offer=await request('/v1/admin/offers','POST',{
   code:'CI10',name:'UAT ten percent offer',discountType:'PERCENT_BPS',discountValue:1000,
   maxDiscountPaise:1000,minimumSubtotalPaise:0,startsAt,endsAt,maxRedemptions:2,perBuyerLimit:2
  });
  expect(offer.status).toBe(201);
  const offerId=(await offer.json() as {id:string}).id;
  const marketingEmail='uat-marketing@example.invalid',marketingPassword='Marketing-ci-secret-123456';
  expect((await request('/v1/admin/staff','POST',{email:marketingEmail,password:marketingPassword,roles:['MARKETING']})).status).toBe(201);
  const marketingLogin=await request('/auth/login','POST',{email:marketingEmail,password:marketingPassword,organizationId:producerOrg},'');
  const marketingToken=(await marketingLogin.json() as Login).accessToken;
  expect((await request('/v1/admin/offers/'+offerId+'/status','PATCH',{status:'ACTIVE'},marketingToken)).status).toBe(403);
  expect((await request('/v1/admin/offers/'+offerId+'/status','PATCH',{status:'ACTIVE'})).status).toBe(200);
  const validation=await request('/v1/promotions/validate?code=CI10&kitchenId='+kitchenId,'GET',undefined,customerToken);
  expect(validation.status).toBe(200);
  expect(await validation.json()).toMatchObject({code:'CI10',discountType:'PERCENT_BPS',discountValue:1000});
  const key='integration-safe-order-key-0001';
  const body={kitchenId,slotId,deliveryDate,idempotencyKey:key,items:[{variantId,grams}],promotionCode:'CI10',event};
  const first=await request('/v1/orders','POST',body,customerToken);
  expect(first.status).toBe(201);
  const created=await first.json() as {id:string;replayed:boolean};
  orderId=created.id;
  expect(created.replayed).toBe(false);
  const replay=await request('/v1/orders','POST',body,customerToken);
  expect(replay.status).toBe(200);
  expect(await replay.json()).toMatchObject({id:created.id,replayed:true});
  const conflictingReplay=await request('/v1/orders','POST',{
   ...body,items:[{variantId,grams:grams+incrementGrams}]
  },customerToken);
  expect(conflictingReplay.status).toBe(409);
  expect(await conflictingReplay.json()).toMatchObject({
   error:'This idempotency key was already used for a different or unverifiable order request. Start a new order.'
  });
  const db=await pool.query<{n:string}>('SELECT count(*)::text AS n FROM slot_reservations WHERE order_id=$1',[created.id]);
  expect(Number(db.rows[0].n)).toBe(1);
  const snapshot=await pool.query<{contract_id:string;subtotal_paise:string;delivery_fee_paise:string;total_paise:string;price_paise_per_kg:string}>(
   'SELECT o.contract_id,o.subtotal_paise,o.delivery_fee_paise,o.discount_paise,o.total_paise,oi.price_paise_per_kg FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE o.id=$1',[created.id]);
  expect(snapshot.rows[0].contract_id).toBe(contractId);
  expect(Number(snapshot.rows[0].price_paise_per_kg)).toBe(basePrice+250);
  expect(Number(snapshot.rows[0].delivery_fee_paise)).toBe(1500);
  expect(Number(snapshot.rows[0].discount_paise)).toBeGreaterThan(0);
  expect(Number(snapshot.rows[0].total_paise)).toBe(Number(snapshot.rows[0].subtotal_paise)-Number(snapshot.rows[0].discount_paise)+1500);
  const redemption=await pool.query<{n:string}>('SELECT count(*)::text AS n FROM offer_redemptions WHERE order_id=$1',[created.id]);
  expect(Number(redemption.rows[0].n)).toBe(1);
 });


 it('cancels a confirmed customer order before cutoff and releases its slot reservation exactly once',async()=>{
  const created=await request('/v1/orders','POST',{
   kitchenId,slotId,deliveryDate,idempotencyKey:'integration-cancel-order-key-0001',
   items:[{variantId,grams}],promotionCode:'CI10',event
  },customerToken);
  expect(created.status).toBe(201);
  const id=(await created.json() as {id:string}).id;
  const cancellationEvent={eventType:'ORDER_CANCELLED',subjectType:'ORDER',subjectId:id,
   location:{source:'UNAVAILABLE',unavailableReason:'CI has no device GPS',consentStatus:'NOT_REQUESTED'},
   details:{client:'freshprep-ci-cancellation'}};
  expect((await request('/v1/orders/'+id+'/cancel','POST',{event:cancellationEvent},customerToken)).status).toBe(200);
  const replay=await request('/v1/orders/'+id+'/cancel','POST',{},customerToken);
  expect(replay.status).toBe(200);
  expect(await replay.json()).toMatchObject({id,state:'CANCELLED',replayed:true});
  const db=await pool.query<{state:string;reservations:string}>(
   "SELECT o.state,(SELECT count(*)::text FROM slot_reservations sr WHERE sr.order_id=o.id) AS reservations FROM orders o WHERE o.id=$1",[id]);
  expect(db.rows[0]).toMatchObject({state:'CANCELLED',reservations:'0'});
  const afterReversal=await request('/v1/orders','POST',{kitchenId,slotId,deliveryDate,idempotencyKey:'integration-after-coupon-reversal-0001',items:[{variantId,grams}],promotionCode:'CI10',event},customerToken);
  expect(afterReversal.status).toBe(201);
  const afterReversalId=(await afterReversal.json() as {id:string}).id;
  expect((await request('/v1/orders/'+afterReversalId+'/cancel','POST',{},customerToken)).status).toBe(200);
  const quota=await pool.query<{total:string;active:string}>('SELECT count(*)::text AS total,count(*) FILTER(WHERE reversed_at IS NULL)::text AS active FROM offer_redemptions WHERE offer_id=(SELECT id FROM customer_offers WHERE producer_organization_id=$1 AND code=$2)',[producerOrg,'CI10']);
  expect(Number(quota.rows[0].total)).toBe(3);
  expect(Number(quota.rows[0].active)).toBe(1);
  expect((await request('/v1/orders/'+id+'/cancel','POST',{},'')).status).toBe(401);
 });

 it('consolidates cutter demand across all delivery slots with a slot-wise breakdown',async()=>{
  const slot=await pool.query<{id:string}>(`INSERT INTO delivery_slots
   (zone_code,label,start_minute,end_minute,cutoff_day_offset,cutoff_minute,capacity_orders,active)
   VALUES('BENGALURU_DEMO','Afternoon CI',840,1020,0,660,100,true) RETURNING id`);
  const secondOrder=await request('/v1/orders','POST',{
   kitchenId,slotId:slot.rows[0].id,deliveryDate,idempotencyKey:'integration-safe-order-key-0002',
   items:[{variantId,grams}],event
  },customerToken);
  expect(secondOrder.status).toBe(201);
  const response=await request('/v1/ops/production-summary?date='+deliveryDate);
  expect(response.status).toBe(200);
  const rows=await response.json() as {variant_id:string;daily_required_grams:number;order_count:number;
   slot_breakdown:{slotId:string;requiredGrams:number}[]}[];
  const item=rows.find(x=>x.variant_id===variantId);
  expect(item).toBeTruthy();
  expect(item!.daily_required_grams).toBe(grams*2);
  expect(item!.order_count).toBe(2);
  expect(item!.slot_breakdown).toHaveLength(2);
  expect(item!.slot_breakdown.map(x=>x.slotId)).toContain(slot.rows[0].id);
  expect((await request('/v1/ops/production-summary?date='+deliveryDate,'GET',undefined,customerToken)).status).toBe(403);
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

 it('configures and approves a loyalty program before order fulfilment',async()=>{
  const email='uat-finance@example.invalid',password='Finance-ci-secret-123456';
  const created=await request('/v1/admin/staff','POST',{email,password,roles:['FINANCE']});
  expect(created.status).toBe(201);
  const login=await request('/auth/login','POST',{email,password,organizationId:producerOrg},'');
  expect(login.status).toBe(200);
  financeToken=(await login.json() as Login).accessToken;
  const saved=await request('/v1/admin/loyalty/program','PUT',{
   pointsPer100Rupees:10,paisePerPoint:10,minimumRedeemPoints:1,maximumDiscountBps:1000
  },financeToken);
  expect(saved.status).toBe(200);
  expect(await saved.json()).toMatchObject({status:'DRAFT'});
  expect((await request('/v1/admin/loyalty/program/approve','PATCH',{},financeToken)).status).toBe(200);
  const wallet=await request('/v1/loyalty/me?kitchenId='+kitchenId,'GET',undefined,customerToken);
  expect(wallet.status).toBe(200);
  expect(await wallet.json()).toMatchObject({balancePoints:0,programActive:true});
 });
 it('executes and audits procurement → cutter → QC → packer → dispatch → assigned-driver POD',async()=>{
  expect(orderId).toBeTruthy();
  const actorRoles=['PROCUREMENT','OPERATOR','QC','PACKER','DISPATCH','DRIVER'] as const;
  const accounts=new Map<string,{id:string;token:string}>();
  for(const role of actorRoles){
   const email='uat-'+role.toLowerCase()+'@example.invalid';
   const password='UAT-only-actor-secret-123456';
   const created=await request('/v1/admin/staff','POST',{email,password,roles:[role]});
   expect(created.status).toBe(201);
   const actor=await created.json() as {id:string};
   const login=await request('/auth/login','POST',{email,password,organizationId:producerOrg},'');
   expect(login.status).toBe(200);
   accounts.set(role,{id:actor.id,token:(await login.json() as Login).accessToken});
  }
  const actor=(role:typeof actorRoles[number])=>accounts.get(role)!.token;
  const ev=(eventType:string,subjectType:string)=>({
   eventType,subjectType,subjectId:'ci-pending',
   location:{source:'UNAVAILABLE',unavailableReason:'CI has no device GPS',consentStatus:'NOT_REQUESTED'},
   details:{client:'freshprep-ci-operations'}
  });
  // Producer procurement: raw lot must match the vegetable of the customer order line.
  const vegetable=await pool.query<{vegetable_id:string}>(
   'SELECT vegetable_id FROM product_variants WHERE id=$1',[variantId]);
  const vegId=vegetable.rows[0].vegetable_id;
  const supplier=await request('/v1/ops/suppliers','POST',{
   name:'FreshPrep UAT Local Farm',event:ev('SUPPLIER_CREATED','SUPPLIER')
  },actor('PROCUREMENT'));
  expect(supplier.status).toBe(201);
  const supplierId=(await supplier.json() as {id:string}).id;
  const purchase=await request('/v1/ops/purchases','POST',{
   supplierId,event:ev('PURCHASE_ORDER_CREATED','PURCHASE')
  },actor('PROCUREMENT'));
  expect(purchase.status).toBe(201);
  const purchaseId=(await purchase.json() as {id:string}).id;
  const raw=await request('/v1/ops/purchases/'+purchaseId+'/receive','POST',{
   vegetableId:vegId,receivedGrams:grams*2,usableGrams:grams*2,rejectedGrams:0,
   supplierLot:'CI-LOT-A',event:ev('RAW_LOT_RECEIVED','RAW_LOT')
  },actor('PROCUREMENT'));
  expect(raw.status).toBe(201);
  const rawId=(await raw.json() as {id:string}).id;
  // Customer cannot call staff mutation endpoints.
  const denied=await request('/v1/ops/batches','POST',{
   orderId,variantId,rawLotId:rawId,inputGrams:grams,event:ev('PRODUCTION_BATCH_STARTED','BATCH')
  },customerToken);
  expect(denied.status).toBe(403);
  const started=await request('/v1/ops/batches','POST',{
   orderId,variantId,rawLotId:rawId,inputGrams:grams,event:ev('PRODUCTION_BATCH_STARTED','BATCH')
  },actor('OPERATOR'));
  expect(started.status).toBe(201);
  const batchId=(await started.json() as {id:string}).id;
  const failEarlyPack=await request('/v1/ops/batches/'+batchId+'/pack','POST',{
   netGrams:grams,labelCode:'CI-PACK-DO-NOT-CREATE',useBy:new Date(Date.now()+7*86400000).toISOString(),
   event:ev('PACK_UNIT_CREATED','PACK_UNIT')
  },actor('PACKER'));
  expect(failEarlyPack.status).toBe(409);
  const failEarlyQc=await request('/v1/ops/batches/'+batchId+'/qc','POST',{
   passed:true,findings:'Too early',event:ev('QC_CHECK_RECORDED','QC_CHECK')
  },actor('QC'));
  expect(failEarlyQc.status).toBe(409);
  const complete=await request('/v1/ops/batches/'+batchId+'/complete','POST',{
   outputGrams:grams,wasteGrams:0,event:ev('PRODUCTION_BATCH_COMPLETED','BATCH')
  },actor('OPERATOR'));
  expect(complete.status).toBe(200);
  const qc=await request('/v1/ops/batches/'+batchId+'/qc','POST',{
   passed:true,findings:'Visual inspection passed; clean and verified',
   temperatureC:5,event:ev('QC_CHECK_RECORDED','QC_CHECK')
  },actor('QC'));
  expect(qc.status).toBe(201);
  const pack=await request('/v1/ops/batches/'+batchId+'/pack','POST',{
   netGrams:grams,labelCode:'CI-PACK-A-001',useBy:new Date(Date.now()+7*86400000).toISOString(),
   event:ev('PACK_UNIT_CREATED','PACK_UNIT')
  },actor('PACKER'));
  expect(pack.status).toBe(201);
  expect((await pool.query<{state:string}>('SELECT state FROM orders WHERE id=$1',[orderId])).rows[0].state).toBe('PACKED');
  const extraPack=await request('/v1/ops/batches/'+batchId+'/pack','POST',{
   netGrams:grams,labelCode:'CI-PACK-OVERAGE',useBy:new Date(Date.now()+7*86400000).toISOString(),
   event:ev('PACK_UNIT_CREATED','PACK_UNIT')
  },actor('PACKER'));
  expect(extraPack.status).toBe(422);
  const run=await request('/v1/ops/runs','POST',{
   slotId,deliveryDate,driverId:accounts.get('DRIVER')!.id,
   event:ev('DELIVERY_RUN_CREATED','DELIVERY_RUN')
  },actor('DISPATCH'));
  expect(run.status).toBe(201);
  const runId=(await run.json() as {id:string}).id;
  const stop=await request('/v1/ops/runs/'+runId+'/stops','POST',{
   orderId,stopNumber:1,event:ev('DELIVERY_STOP_ASSIGNED','DELIVERY_STOP')
  },actor('DISPATCH'));
  expect(stop.status).toBe(201);
  const stopId=(await stop.json() as {id:string}).id;
  const deliveryEvent=ev('DELIVERY_POD_CAPTURED','DELIVERY_STOP');
  const wrongDriver=await request('/v1/ops/stops/'+stopId+'/complete','POST',{
   receivedBy:'UAT Customer',notes:'Handover confirmed',event:deliveryEvent
  },actor('DISPATCH'));
  expect(wrongDriver.status).toBe(403);
  const handed=await request('/v1/ops/stops/'+stopId+'/complete','POST',{
   receivedBy:'UAT Customer',notes:'Handover confirmed',event:deliveryEvent
  },actor('DRIVER'));
  expect(handed.status).toBe(201);
  const replay=await request('/v1/ops/stops/'+stopId+'/complete','POST',{
   receivedBy:'UAT Customer',notes:'Handover confirmed',event:deliveryEvent
  },actor('DRIVER'));
  expect(replay.status).toBe(409);
  const state=await pool.query<{state:string}>('SELECT state FROM orders WHERE id=$1',[orderId]);
  expect(state.rows[0].state).toBe('DELIVERED');
  const wallet=await request('/v1/loyalty/me?kitchenId='+kitchenId,'GET',undefined,customerToken);
  expect(wallet.status).toBe(200);
  const walletBody=await wallet.json() as {balancePoints:number;entries:{entry_type:string;points_delta:number}[]};
  expect(walletBody.balancePoints).toBeGreaterThan(0);
  expect(walletBody.entries).toContainEqual(expect.objectContaining({entry_type:'EARN',points_delta:walletBody.balancePoints}));
  const customerOrderDetail=await request('/v1/orders/'+orderId,'GET',undefined,customerToken);
  expect(customerOrderDetail.status).toBe(200);
  const detail=await customerOrderDetail.json() as {
   state:string;items:{variant_id:string;grams:number}[];
   packUnits:{label_code:string;net_grams:number}[];
   delivery:{delivery_status:string;received_by:string;proof_received_at:string}|null
  };
  expect(detail.state).toBe('DELIVERED');
  expect(detail.items).toContainEqual(expect.objectContaining({variant_id:variantId,grams}));
  expect(detail.packUnits).toContainEqual(expect.objectContaining({label_code:'CI-PACK-A-001',net_grams:grams}));
  expect(detail.delivery).toMatchObject({delivery_status:'DELIVERED',received_by:'UAT Customer'});
  expect((await request('/v1/orders/not-a-uuid','GET',undefined,customerToken)).status).toBe(400);
  const audit=await pool.query<{count:string}>(
   "SELECT count(*)::text AS count FROM event_log WHERE organization_id=$1 AND event_type='DELIVERY_POD_CAPTURED'",[producerOrg]);
  expect(Number(audit.rows[0].count)).toBe(1);
 });


 it('opens tenant-scoped shortage/return cases and enforces authorised resolution',async()=>{
  const opened=await request('/v1/support/cases','POST',{
   orderId,category:'SHORTAGE',
   description:'One pack was short by 250 grams compared with the confirmed order.',
   requestedResolution:'Please arrange a replacement or issue an account credit.',
   event:{eventType:'SUPPORT_CASE_CREATED',subjectType:'SUPPORT_CASE',subjectId:'pending',
    location:{source:'UNAVAILABLE',unavailableReason:'CI has no device GPS',consentStatus:'NOT_REQUESTED'},
    details:{client:'freshprep-ci-support'}}
  },customerToken);
  expect(opened.status,await opened.clone().text()).toBe(201);
  const caseBody=await opened.json() as {id:string;case_number:number;state:string};
  expect(caseBody.state).toBe('OPEN');
  const duplicate=await request('/v1/support/cases','POST',{
   orderId,category:'SHORTAGE',description:'A duplicate active shortage report for the same order.',
   event:{eventType:'SUPPORT_CASE_CREATED',subjectType:'SUPPORT_CASE',subjectId:'pending',
    location:{source:'UNAVAILABLE',unavailableReason:'CI has no device GPS',consentStatus:'NOT_REQUESTED'},details:{}}
  },customerToken);
  expect(duplicate.status).toBe(409);
  const customerCases=await request('/v1/support/cases','GET',undefined,customerToken);
  expect(customerCases.status).toBe(200);
  expect((await customerCases.json() as {id:string}[]).some(x=>x.id===caseBody.id)).toBe(true);
  const customerCannotResolve=await request('/v1/support/cases/'+caseBody.id,'PATCH',{
   state:'RESOLVED',resolutionNote:'Customer cannot resolve supplier case'
  },customerToken);
  expect(customerCannotResolve.status).toBe(403);
  const supplierCases=await request('/v1/support/cases');
  expect(supplierCases.status).toBe(200);
  expect((await supplierCases.json() as {id:string}[]).some(x=>x.id===caseBody.id)).toBe(true);
  const invalidResolve=await request('/v1/support/cases/'+caseBody.id,'PATCH',{state:'RESOLVED'});
  expect(invalidResolve.status).toBe(422);
  const resolved=await request('/v1/support/cases/'+caseBody.id,'PATCH',{
   state:'RESOLVED',resolutionNote:'Replacement approved and delivery credit recorded for the buyer.'
  });
  expect(resolved.status).toBe(200);
  expect(await resolved.json()).toMatchObject({id:caseBody.id,state:'RESOLVED'});
  const closedAgain=await request('/v1/support/cases/'+caseBody.id,'PATCH',{
   state:'CLOSED',resolutionNote:'Attempt to modify a resolved case'
  });
  expect(closedAgain.status).toBe(409);
  const persisted=await pool.query<{state:string;resolved_by:string|null;resolved_at:Date|null}>(
   'SELECT state,resolved_by,resolved_at FROM support_cases WHERE id=$1',[caseBody.id]);
  expect(persisted.rows[0].state).toBe('RESOLVED');
  expect(persisted.rows[0].resolved_by).toBeTruthy();
  expect(persisted.rows[0].resolved_at).toBeTruthy();
 });

 it('creates provisional invoices and enforces receipt allocation and credit-note limits',async()=>{
  expect(financeToken).toBeTruthy();
  const walletBefore=await request('/v1/loyalty/me?kitchenId='+kitchenId,'GET',undefined,customerToken);
  const balanceBefore=(await walletBefore.json() as {balancePoints:number}).balancePoints;
  const adjustment=await request('/v1/admin/loyalty/adjustments','POST',{buyerOrganizationId:customerOrg,pointsDelta:2,idempotencyKey:'CI-LOYALTY-ADJUSTMENT-001',note:'UAT approved customer goodwill points.'},financeToken);
  expect(adjustment.status).toBe(201);
  expect(await adjustment.json()).toMatchObject({balancePoints:balanceBefore+2,replayed:false});
  const adjustmentReplay=await request('/v1/admin/loyalty/adjustments','POST',{buyerOrganizationId:customerOrg,pointsDelta:2,idempotencyKey:'CI-LOYALTY-ADJUSTMENT-001',note:'UAT approved customer goodwill points.'},financeToken);
  expect(adjustmentReplay.status).toBe(201);
  expect(await adjustmentReplay.json()).toMatchObject({balancePoints:balanceBefore+2,replayed:true});
  const invalidAdjustment=await request('/v1/admin/loyalty/adjustments','POST',{buyerOrganizationId:customerOrg,pointsDelta:-100,idempotencyKey:'CI-LOYALTY-ADJUSTMENT-002',note:'Negative balance must be blocked.'},financeToken);
  expect(invalidAdjustment.status).toBe(409);
  const invoiceResponse=await request('/v1/finance/invoices/from-order/'+orderId,'POST',{},financeToken);
  expect(invoiceResponse.status).toBe(201);
  const invoice=await invoiceResponse.json() as {id:string;total_paise:number;status:string;tax_policy_status:string};
  expect(invoice).toMatchObject({status:'PROVISIONAL',tax_policy_status:'PENDING_APPROVAL'});
  const replay=await request('/v1/finance/invoices/from-order/'+orderId,'POST',{},financeToken);
  expect(replay.status).toBe(200);
  expect(await replay.json()).toMatchObject({id:invoice.id,replayed:true});
  const customerInvoices=await request('/v1/finance/invoices','GET',undefined,customerToken);
  expect(customerInvoices.status).toBe(200);
  expect((await customerInvoices.json() as {id:string}[]).some(row=>row.id===invoice.id)).toBe(true);
  const noFinance=await request('/v1/finance/summary','GET',undefined,customerToken);
  expect(noFinance.status).toBe(403);
  const receipt=await request('/v1/finance/receipts','POST',{
   buyerOrganizationId:customerOrg,amountPaise:1000,paymentMethod:'UPI',reference:'CI-UPI-RECEIPT-001',
   receivedOn:new Date().toISOString().slice(0,10),allocations:[{invoiceId:invoice.id,amountPaise:1000}]
  },financeToken);
  expect(receipt.status).toBe(201);
  expect(await receipt.json()).toMatchObject({allocatedPaise:1000,unallocatedPaise:0});
  const duplicateReference=await request('/v1/finance/receipts','POST',{
   buyerOrganizationId:customerOrg,amountPaise:1000,paymentMethod:'UPI',reference:'CI-UPI-RECEIPT-001',
   receivedOn:new Date().toISOString().slice(0,10),allocations:[]
  },financeToken);
  expect(duplicateReference.status).toBe(409);
  const overAllocation=await request('/v1/finance/receipts','POST',{
   buyerOrganizationId:customerOrg,amountPaise:Number(invoice.total_paise)+1,paymentMethod:'BANK_TRANSFER',reference:'CI-UPI-OVERALLOC-001',
   receivedOn:new Date().toISOString().slice(0,10),allocations:[{invoiceId:invoice.id,amountPaise:Number(invoice.total_paise)+1}]
  },financeToken);
  expect(overAllocation.status).toBe(409);
  const credit=await request('/v1/finance/invoices/'+invoice.id+'/credit-notes','POST',{
   amountPaise:100,reason:'Approved shortage credit for the buyer.'
  },financeToken);
  expect(credit.status).toBe(201);
  const creditId=(await credit.json() as {id:string}).id;
  expect((await request('/v1/finance/credit-notes/'+creditId+'/approve','PATCH',{},financeToken)).status).toBe(200);
  const issued=await request('/v1/finance/invoices/from-order/'+orderId,'POST',{},financeToken);
  expect(issued.status).toBe(200);
  const summary=await request('/v1/finance/summary','GET',undefined,financeToken);
  expect(summary.status).toBe(200);
 });
 it('exposes permission-scoped action selectors and keeps driver data assigned-only',async()=>{
  const adminOptions=await request('/v1/ops/action-options');
  expect(adminOptions.status).toBe(200);
  const adminData=await adminOptions.json() as {suppliers:unknown[];purchases:unknown[];vegetables:unknown[];variants:unknown[];rawLots:unknown[];orders:{id:string}[];batches:unknown[];drivers:unknown[];runs:unknown[];stops:{id:string}[]};
  expect(adminData.suppliers.length).toBeGreaterThan(0);
  expect(adminData.purchases.length).toBeGreaterThan(0);
  expect(adminData.vegetables.length).toBeGreaterThan(0);
  expect(adminData.variants.length).toBeGreaterThanOrEqual(100);
  expect(adminData.rawLots.length).toBeGreaterThan(0);
  expect(adminData.orders.some(o=>o.id===orderId)).toBe(true);
  expect(adminData.batches.length).toBeGreaterThan(0);
  expect(adminData.drivers.length).toBeGreaterThan(0);
  expect(adminData.runs.length).toBeGreaterThan(0);
  expect(adminData.stops.length).toBeGreaterThan(0);
  const customerOptions=await request('/v1/ops/action-options','GET',undefined,customerToken);
  expect(customerOptions.status).toBe(200);
  const customerData=await customerOptions.json() as {suppliers:unknown[];purchases:unknown[];vegetables:unknown[];variants:unknown[];rawLots:unknown[];orders:unknown[];batches:unknown[];drivers:unknown[];runs:unknown[];stops:unknown[]};
  expect(Object.values(customerData).every(rows=>rows.length===0)).toBe(true);
 });


 it('publishes scheduled marketing slides and announcements through authenticated admin APIs',async()=>{
  const now=Date.now();
  const startsAt=new Date(now-60_000).toISOString(),endsAt=new Date(now+86_400_000).toISOString();
  const slide={
   eyebrow:'READY FOR KITCHENS',headline:'Fresh cuts for every kitchen',
   description:'Precision prepared vegetables for professional kitchens.',
   imageUrl:'https://example.invalid/freshprep-hero.jpg',
   mobileImageUrl:'https://example.invalid/freshprep-hero-mobile.jpg',
   altText:'Freshly prepared vegetables in a kitchen',
   targetUrl:'https://example.invalid/catalogue',ctaLabel:'Browse catalogue',
   sortOrder:1,startsAt,endsAt,active:true,audience:'ALL'
  };
  expect((await request('/v1/admin/marketing/slides','POST',{...slide,imageUrl:'http://insecure.example/hero.jpg'})).status).toBe(400);
  expect((await request('/v1/admin/marketing/slides','POST',{...slide,endsAt:startsAt})).status).toBe(400);
  const created=await request('/v1/admin/marketing/slides','POST',slide);
  expect(created.status).toBe(201);
  const slideId=(await created.json() as {id:string}).id;
  const adminSlides=await request('/v1/admin/marketing/slides');
  expect(adminSlides.status).toBe(200);
  expect((await adminSlides.json() as {id:string;headline:string}[]).some(x=>x.id===slideId&&x.headline===slide.headline)).toBe(true);
  const publicSlides=await app.request('/home/slides');
  expect(publicSlides.status).toBe(200);
  expect((await publicSlides.json() as {id:string}[]).some(x=>x.id===slideId)).toBe(true);
  const denied=await request('/v1/admin/marketing/slides','POST',slide,customerToken);
  expect(denied.status).toBe(403);
  const archived=await request('/v1/admin/marketing/slides/'+slideId,'DELETE');
  expect(archived.status).toBe(200);
  expect((await (await app.request('/home/slides')).json() as {id:string}[]).some(x=>x.id===slideId)).toBe(false);

  const announcement={title:'Holiday delivery notice',body:'Please place orders before the published cutoff.',startsAt,endsAt,active:true,audience:'ALL',priority:10,urgency:'INFO'};
  const notice=await request('/v1/admin/marketing/announcements','POST',announcement);
  expect(notice.status).toBe(201);
  const noticeId=(await notice.json() as {id:string}).id;
  const publicNotices=await app.request('/home/announcements');
  expect((await publicNotices.json() as {id:string;title:string}[]).some(x=>x.id===noticeId&&x.title===announcement.title)).toBe(true);
  expect((await request('/v1/admin/marketing/announcements/'+noticeId,'DELETE')).status).toBe(200);
 });

 it('shows only scoped live admin insights and never grants a customer report access',async()=>{
  const staff=await request('/v1/admin/insights');
  expect(staff.status).toBe(200);
  const report=await staff.json() as {
   metrics:{upcomingOrders:number;bookedValuePaise:number;exceptionOrders:number};
   daily:{date:string;orders:number}[];
   topCuts:{name:string;grams:number}[];
   slots:{date:string;orders:number}[];
   recentEvents:{event_type:string}[];
  };
  expect(report.metrics.bookedValuePaise).toBeGreaterThan(0);
  expect(report.daily.some(r=>r.date===deliveryDate&&r.orders>=2)).toBe(true);
  expect(report.topCuts.length).toBeGreaterThan(0);
  expect(report.slots.length).toBeGreaterThan(0);
  expect(report.recentEvents.some(r=>r.event_type==='DELIVERY_POD_CAPTURED')).toBe(true);
  expect((await request('/v1/admin/insights','GET',undefined,customerToken)).status).toBe(403);
 });
});
