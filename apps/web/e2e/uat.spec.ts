import {test,expect,type Page} from '@playwright/test';
const ORG='22222222-2222-4222-8222-222222222222';
const KITCHEN='33333333-3333-4333-8333-333333333333';
const PRODUCT='44444444-4444-4444-8444-444444444444';
const SLOT='55555555-5555-4555-8555-555555555555';
const DATE='2026-11-18';
const activeProduct={id:PRODUCT,sku:'CARROT-10',vegetable:'Carrot',preparation:'DICED',
 size_kind:'numeric',size_number:'10',size_unit:'mm',size_label:null,image_url:'',
 price_paise_per_kg:6000,minimum_grams:500,increment_grams:250};
const metrics={asOf:'2026-11-10',
 metrics:{upcomingOrders:2,exceptionOrders:0,bookedValuePaise:12000,customersWithOrders:1},
 daily:[{date:DATE,orders:2,grams:1500,bookedPaise:12000}],
 topCuts:[{name:'Carrot · DICED · 10 mm',grams:1500,orders:2}],
 slots:[{date:DATE,label:'Morning delivery',orders:2,capacity:30}],
 recentEvents:[{event_type:'ORDER_CREATED',subject_type:'ORDER',created_at:'2026-11-10T06:20:00Z'}]};
async function mockApi(page:Page,roles:string[]|null){
 await page.route('**/api/**',async route=>{
  const req=route.request(),p=new URL(req.url()).pathname.replace(/^\/api/,'');
  const ok=(data:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(p==='/home/slides'||p==='/home/announcements')return ok([]);
  if(p==='/auth/login')return roles?ok({accessToken:'test.jwt.token',tokenType:'Bearer',expiresInSeconds:900}):ok({error:'Invalid credentials'},401);
  if(p==='/v1/me')return ok({userId:'11111111-1111-4111-8111-111111111111',organizationId:ORG,roles});
  if(p==='/v1/admin/overview')return ok({staff:2,activeKitchens:1,ordersByState:[]});
  if(p==='/v1/admin/staff')return ok([{id:'a',email:'team@freshprep.test',roles:['OPERATOR'],active:true}]);
  if(p==='/v1/admin/customers')return ok([{kitchen_id:KITCHEN,kitchen_name:'Commercial Kitchen',organization_name:'UAT Client',address:'Bengaluru test address',zone_code:'BENGALURU_TEST'}]);
  if(p==='/v1/admin/insights')return ok(metrics);
  if(p==='/v1/admin/vegetables')return ok([{id:'33333333-3333-4333-8333-333333333334',name:'Carrot',active:true}]);
  if(p==='/v1/admin/variants')return ok([]);
  if(p==='/v1/admin/slots')return ok([]);
  if(p==='/v1/catalog')return ok([activeProduct]);
  if(p==='/v1/kitchens')return ok([{id:KITCHEN,name:'UAT Kitchen',address:'Bengaluru test address',zone_code:'BENGALURU_TEST'}]);
  if(p==='/v1/delivery-slots')return ok([{id:SLOT,zone_code:'BENGALURU_TEST',label:'Morning 05:00–08:00',
   start_minute:300,end_minute:480,cutoff_day_offset:1,cutoff_minute:1380,capacity_orders:30}]);
  if(p==='/v1/orders')return ok([]);
  if(p==='/v1/recurrences')return ok([]);
  if(p.startsWith('/v1/ops/delivery-board'))return ok([{delivery_date:DATE,slot_label:'Morning 05:00–08:00',
   order_id:'99999999-9999-4999-8999-999999999999',state:'DISPATCHED',vegetable:'Carrot'}]);
  if(p.startsWith('/v1/ops/production-plan'))return ok([]);
  if(p.startsWith('/v1/ops/packing-board'))return ok([]);
  if(p.startsWith('/v1/ops/batches'))return ok([]);
  if(p.startsWith('/v1/ops/raw-lots'))return ok([]);
  if(p==='/v1/logout')return ok({ok:true});
  return ok({error:'Unknown mocked endpoint: '+p},404);
 });
}
async function signin(page:Page){
 await page.getByRole('button',{name:/Sign in \/ Get Started/}).click();
 await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
 await page.getByLabel('Email address').fill('tester@freshprep.example');
 await page.getByLabel('Password',{exact:true}).fill('Example-secure-password-123');
 await page.getByLabel('Organisation ID').fill(ORG);
 await page.getByRole('button',{name:/Sign in securely/}).click();
}
async function assertNoHorizontalOverflow(page:Page){
 const size=await page.evaluate(()=>({document:document.documentElement.scrollWidth,viewport:window.innerWidth}));
 expect(size.document,'page must fit viewport without horizontal scrolling').toBeLessThanOrEqual(size.viewport+2);
}
test('desktop marketing: premium landing, complete navigation and responsive layout',async({page},info)=>{
 await mockApi(page,[]);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 await expect(page.getByRole('heading',{name:/Shop by Preparation/})).toBeVisible();
 await expect(page.getByRole('heading',{level:1})).toContainText('Freshly Cut.');
 await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();
 await assertNoHorizontalOverflow(page);
 await page.screenshot({path:info.outputPath('desktop-marketing.png'),fullPage:true});
 expect(errors).toEqual([]);
});
test('mobile: menu is accessible, opens and closes, no clipped content',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});
 await mockApi(page,[]);
 await page.goto('/');
 const menu=page.getByRole('button',{name:'Open navigation menu'});
 await expect(menu).toBeVisible();
 await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeHidden();
 await assertNoHorizontalOverflow(page);
 await page.screenshot({path:info.outputPath('mobile-marketing.png'),fullPage:true});
 await menu.click();
 await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Close navigation menu'})).toHaveAttribute('aria-expanded','true');
 await page.screenshot({path:info.outputPath('mobile-navigation.png'),fullPage:true});
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Recurring Orders'}).click();
 await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
 await assertNoHorizontalOverflow(page);
});
test('login: incorrect credentials are safe and password visibility is operable',async({page},info)=>{
 await mockApi(page,null);
 await page.goto('/');
 await page.getByRole('button',{name:/Sign in \/ Get Started/}).click();
 await page.getByLabel('Email address').fill('buyer@freshprep.example');
 await page.getByLabel('Password',{exact:true}).fill('bad-password');
 await page.getByLabel('Organisation ID').fill(ORG);
 const show=page.getByRole('button',{name:'Show password'});
 await show.click();
 await expect(page.getByLabel('Password',{exact:true})).toHaveAttribute('type','text');
 await page.getByRole('button',{name:'Hide password'}).click();
 await expect(page.getByLabel('Password',{exact:true})).toHaveAttribute('type','password');
 await page.getByRole('button',{name:/Sign in securely/}).click();
 await expect(page.getByRole('alert')).toContainText('Email, password or organisation ID is incorrect.');
 await expect(page.getByText('relation "users"')).toHaveCount(0);
 await page.screenshot({path:info.outputPath('login-negative.png'),fullPage:true});
});
test('admin: dashboard, staff, customers, catalogue and slots all mount without exceptions',async({page},info)=>{
 await mockApi(page,['SUPERADMIN']);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await signin(page);
 await expect(page.getByRole('heading',{name:'Business overview'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Production & delivery outlook'})).toBeVisible();
 await expect(page.getByText('Booked order value')).toBeVisible();
 await expect(page.getByText('Database connected')).toHaveCount(0);
 await page.screenshot({path:info.outputPath('admin-dashboard.png'),fullPage:true});
 await page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:/Team management|Staff/}).click();
 await expect(page.getByRole('heading',{name:'Create staff account'})).toBeVisible();
 await page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:/Customer network|Customers/}).click();
 await expect(page.getByRole('heading',{name:'Onboard a customer kitchen'})).toBeVisible();
 await page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:'Catalogue'}).click();
 await expect(page.getByRole('heading',{name:'Product Master'})).toBeVisible();
 await page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:'Slots'}).click();
 await expect(page.getByRole('heading',{name:'Delivery Windows',exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});
test('customer: role-scoped buying catalogue has no admin overview or staff controls',async({page},info)=>{
 await mockApi(page,['CUSTOMER_BUYER']);
 await page.goto('/');await signin(page);
 await expect(page.getByRole('heading',{name:'Your kitchen, always prepared'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Prepared vegetables'})).toBeVisible();
 await expect(page.getByText('Carrot',{exact:true})).toBeVisible();
 await expect(page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:'Overview'})).toHaveCount(0);
 await expect(page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:'Staff'})).toHaveCount(0);
 await assertNoHorizontalOverflow(page);
 await page.screenshot({path:info.outputPath('customer-catalogue.png'),fullPage:true});
});
test('driver: assigned delivery only; no admin or customer orders',async({page})=>{
 await mockApi(page,['DRIVER']);
 await page.goto('/');await signin(page);
 await expect(page.getByRole('heading',{name:'Delivery control'})).toBeVisible();
 const nav=page.getByRole('navigation',{name:'Workspace navigation'});
 await expect(nav.getByRole('button',{name:'Delivery'})).toBeVisible();
 await expect(nav.getByRole('button',{name:'Staff'})).toHaveCount(0);
 await expect(nav.getByRole('button',{name:'Overview'})).toHaveCount(0);
 await expect(page.getByText('DISPATCHED')).toBeVisible();
});

for(const entry of [
 {role:'PROCUREMENT',heading:'Procurement & inventory',menu:'Procurement'},
 {role:'OPERATOR',heading:'Production planning',menu:'Cutting'},
 {role:'QC',heading:'Quality assurance',menu:'Quality'},
 {role:'PACKER',heading:'Packing operations',menu:'Packing'}
]){
 test(entry.role.toLowerCase()+' operator sees a role-specific queue without unrelated administration',async({page},info)=>{
  await mockApi(page,[entry.role]);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await signin(page);
  await expect(page.getByRole('heading',{name:entry.heading})).toBeVisible();
  const navigation=page.getByRole('navigation',{name:'Workspace navigation'});
  await expect(navigation.getByRole('button',{name:entry.menu})).toBeVisible();
  await expect(navigation.getByRole('button',{name:'Staff'})).toHaveCount(0);
  await expect(navigation.getByRole('button',{name:'Overview'})).toHaveCount(0);
  await expect(page.getByText('No records for this role and delivery date')).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({path:info.outputPath(entry.role.toLowerCase()+'-workboard.png'),fullPage:true});
  expect(errors).toEqual([]);
 });
}
test('delivery date change reloads the current work queue rather than showing yesterday’s data',async({page})=>{
 await mockApi(page,['DRIVER']);
 const dates:string[]=[];
 page.on('request',request=>{
  if(request.url().includes('/v1/ops/delivery-board?date=')){
   dates.push(new URL(request.url()).searchParams.get('date')||'');
  }
 });
 await page.goto('/');await signin(page);
 await expect(page.getByRole('heading',{name:'Delivery control'})).toBeVisible();
 const newDay='2026-11-19';
 await page.getByLabel('Delivery date').fill(newDay);
 await expect.poll(()=>dates.includes(newDay)).toBe(true);
});

test('auditor has an honest read-only access state, not a blank sidebar',async({page})=>{
 await mockApi(page,['AUDITOR']);
 await page.goto('/');await signin(page);
 await expect(page.getByRole('heading',{name:'Business overview'})).toBeVisible();
 const nav=page.getByRole('navigation',{name:'Workspace navigation'});
 await expect(nav.getByRole('button',{name:'Overview'})).toBeVisible();
 await expect(page.getByText('Your role currently has no interactive workspaces.')).toBeVisible();
 await expect(nav.getByRole('button',{name:'Staff'})).toHaveCount(0);
});
