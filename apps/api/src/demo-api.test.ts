import {describe,it,expect} from 'vitest';
import {createApp} from './app.js';
const fetchJSON=async(app:ReturnType<typeof createApp>,path:string,method='GET',body?:unknown)=>{
 const response=await app.request(path,{method,headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
 return {status:response.status,data:await response.json() as any};
};
describe('operations demo API with seeded catalog',()=>{
 it('serves 100 variants, three delivery slots, and real zero-value KPIs',async()=>{
  const app=createApp();
  const [p,s,d]=await Promise.all([fetchJSON(app,'/catalog/variants'),fetchJSON(app,'/delivery/slots'),fetchJSON(app,'/dev/admin/dashboard')]);
  expect(p.data).toHaveLength(100);expect(s.data).toHaveLength(3);
  expect(d.data.metrics).toMatchObject({variants:100,vegetables:25,orders:0,recurringSchedules:0,deliverySlots:3,demoOrderValuePaise:0});
 });
 it('rejects incorrect role change and records demo order event',async()=>{
  const app=createApp();
  const variants=(await fetchJSON(app,'/catalog/variants')).data;
  const product=variants[0];
  const data={id:'test-order',slotId:'sample-morning',deliveryDate:'2099-10-26',items:[{variantId:product.id,grams:500}],event:{
   eventType:'ORDER_CREATED',subjectType:'ORDER',subjectId:'test-order',
   location:{source:'UNAVAILABLE',unavailableReason:'User denied location',consentStatus:'DENIED'}
  }};
  expect((await fetchJSON(app,'/dev/orders','POST',data)).status).toBe(201);
  expect((await fetchJSON(app,'/dev/admin/orders/test-order/state','PATCH',{state:'DELIVERED'})).status).toBe(409);
  expect((await fetchJSON(app,'/dev/admin/orders/test-order/state','PATCH',{state:'IN_PRODUCTION'})).status).toBe(200);
  const summary=(await fetchJSON(app,'/dev/admin/dashboard')).data;
  expect(summary.metrics.orders).toBe(1);
  expect(summary.stateCounts.IN_PRODUCTION).toBe(1);
  const events=(await fetchJSON(app,'/dev/admin/events')).data;
  expect(events.some((event:any)=>event.eventType==='ORDER_CREATED'&&event.location.unavailableReason==='User denied location')).toBe(true);
 });
 it('returns role definitions for the intended staff personas',async()=>{
  const roles=(await fetchJSON(createApp(),'/dev/admin/roles')).data;
  expect(roles.map((r:any)=>r.role)).toEqual(expect.arrayContaining(['ADMIN','PROCUREMENT','OPERATOR','QC','PACKER','DRIVER','FINANCE']));
 });
});
