import {describe,it,expect} from 'vitest';
import {createApp} from './app.js';
function request(app:ReturnType<typeof createApp>,path:string,method='GET',body?:unknown){
 return app.request(path,{method,headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
}
const item=(id:string,grams:number)=>({variantId:id,grams});
describe('staff role dashboards and order transitions in local mode',()=>{
 it('consolidates cutter demand across customers without combining distinct slots or cut sizes',async()=>{
  const app=createApp();const catalog=await (await request(app,'/catalog/variants')).json() as {id:string;vegetable:string;preparation:string;size:{value:number|string}}[];
  const potato=catalog.find(v=>v.vegetable==='Potato'&&v.preparation==='DICED'&&v.size.value===10)!;
  const date='2099-11-02';
  for(const [id,grams,slotId] of [['order-a',5000,'sample-morning'],['order-b',7000,'sample-morning'],['order-c',2000,'sample-afternoon']] as const){
   const r=await request(app,'/dev/orders','POST',{id,slotId,deliveryDate:date,items:[item(potato.id,grams)]});
   expect(r.status).toBe(201);
  }
  const plan=await (await request(app,'/dev/staff/production?date='+date)).json() as {slotId:string;grams:number;orderCount:number}[];
  expect(plan.find(p=>p.slotId==='sample-morning')).toMatchObject({grams:12000,orderCount:2});
  expect(plan.find(p=>p.slotId==='sample-afternoon')).toMatchObject({grams:2000,orderCount:1});
  const pack=await (await request(app,'/dev/staff/packing?date='+date+'&slotId=sample-morning')).json() as {orderId:string;totalGrams:number}[];
  expect(pack).toHaveLength(2);expect(pack.map(p=>p.totalGrams).sort((a,b)=>a-b)).toEqual([5000,7000]);
 });
 it('guards packing behind QC and delivery behind dispatch',async()=>{
  const app=createApp(),items=await (await request(app,'/catalog/variants')).json() as {id:string}[];
  expect((await request(app,'/dev/orders','POST',{id:'flow-1',slotId:'sample-morning',deliveryDate:'2099-11-02',items:[item(items[0].id,500)]})).status).toBe(201);
  async function step(role:string,nextState:string){return request(app,'/dev/staff/orders/flow-1/advance','POST',{role,nextState});}
  expect((await step('PACKER','PACKED')).status).toBe(409);
  expect((await step('CUTTER','IN_PRODUCTION')).status).toBe(200);
  expect((await step('PACKER','PACKED')).status).toBe(409);
  expect((await step('QC','QC_PASSED')).status).toBe(200);
  expect((await step('PACKER','PACKED')).status).toBe(200);
  expect((await step('DELIVERY','DELIVERED')).status).toBe(409);
  expect((await step('DISPATCH','DISPATCHED')).status).toBe(200);
  expect((await step('DELIVERY','DELIVERED')).status).toBe(200);
 });
});
