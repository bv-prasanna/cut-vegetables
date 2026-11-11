import {it,expect,describe} from 'vitest';
import {createApp} from './app.js';
describe('dev API integration',()=>{
 it('creates distinct variant, slot and recurring schedule; rejects duplicates',async()=>{
  const app=createApp();
  const post=(path:string,obj:unknown)=>app.request(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(obj)});
  const variant={id:'potato-10',vegetable:'Potato',preparation:'DICED',size:{kind:'numeric',value:10,unit:'mm'},imageUrl:'https://example.com/p.jpg',pricePaisePerKg:8000,minimumGrams:500,incrementGrams:250,active:true};
  expect((await post('/dev/admin/variants',variant)).status).toBe(201);
  expect((await post('/dev/admin/variants',variant)).status).toBe(409);
  const slot={id:'am',label:'05-08',startMinute:300,endMinute:480,cutoffDayOffset:1,cutoffMinute:1380,capacityOrders:5,active:true};
  expect((await post('/dev/admin/slots',slot)).status).toBe(201);
  const schedule={id:'s1',frequency:'WEEKLY',weekdays:[1,3,5],startDate:'2026-10-26',slotId:'am',items:[{variantId:'potato-10',grams:1000}]};
  expect((await post('/dev/recurrences',schedule)).status).toBe(201);
  expect((await post('/dev/recurrences',schedule)).status).toBe(409);
  const dates=await (await app.request('/dev/recurrences/s1/dates?from=2026-10-26&days=7')).json() as {dates:string[]};
  expect(dates.dates).toEqual(['2026-10-26','2026-10-28','2026-10-30']);
 });
 it('rejects orders when the cutoff passed',async()=>{
  const r=await createApp().request('/dev/orders',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:'x',slotId:'missing',deliveryDate:'2026-10-27',items:[{variantId:'p',grams:1000}]})});
  expect(r.status).toBe(422);
 });
});
