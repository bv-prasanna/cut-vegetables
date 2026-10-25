import { Hono } from 'hono';
import { allowDevelopmentApi } from './dev-guard.js';
import { cors } from 'hono/cors';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { recurrenceSchema, slotSchema, variantSchema, type Slot, type Variant } from './domain.js';
import { isSlotBookable, validateOrderQuantities, recurrenceRunsOn } from './scheduling.js';

const orderSchema=z.object({
  id:z.string().min(1),slotId:z.string().min(1),
  deliveryDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items:z.array(z.object({variantId:z.string().min(1),grams:z.number().int().positive()})).min(1)
});
type Order=z.infer<typeof orderSchema>&{totalPaise:number;createdAt:string};
export function createApp() {
 const app=new Hono();
 app.use('/dev/*',async(c,next)=>{if(!allowDevelopmentApi(process.env.NODE_ENV))return c.json({error:'Development API disabled'},404);await next();});
 app.use('*',cors({origin:['http://localhost:5173','http://127.0.0.1:5173']}));
 const variants=new Map<string,Variant>();
 const slots=new Map<string,Slot>();
 const rules=new Map<string,z.infer<typeof recurrenceSchema>&{id:string}>();
 const orders=new Map<string,Order>();
 app.get('/health',c=>c.json({status:'ok',mode:'LOCAL_DEVELOPMENT_ONLY'}));
 app.get('/catalog/variants',c=>c.json([...variants.values()].filter(v=>v.active)));
 app.get('/delivery/slots',c=>c.json([...slots.values()].filter(v=>v.active)));
 // Development-only, no authentication. Bind the server to loopback (index.ts).
 app.post('/dev/admin/variants',zValidator('json',variantSchema),c=>{
   const v=c.req.valid('json');if(variants.has(v.id))return c.json({error:'Duplicate variant'},409);
   variants.set(v.id,v);return c.json(v,201);
 });
 app.post('/dev/admin/slots',zValidator('json',slotSchema),c=>{
   const v=c.req.valid('json');if(slots.has(v.id))return c.json({error:'Duplicate slot'},409);
   slots.set(v.id,v);return c.json(v,201);
 });
 app.post('/dev/recurrences',zValidator('json',z.intersection(z.object({id:z.string().min(1)}),recurrenceSchema)),c=>{
   const v=c.req.valid('json');if(rules.has(v.id))return c.json({error:'Duplicate schedule'},409);
   if(!slots.has(v.slotId))return c.json({error:'Unknown slot'},422);
   const errors=validateOrderQuantities(v.items,[...variants.values()]);
   if(errors.length)return c.json({errors},422);
   rules.set(v.id,v);return c.json(v,201);
 });
 app.get('/dev/recurrences',c=>c.json([...rules.values()]));
 app.get('/dev/recurrences/:id/dates',c=>{
   const rule=rules.get(c.req.param('id'));if(!rule)return c.json({error:'Unknown schedule'},404);
   const from=c.req.query('from')||'';if(!/^\d{4}-\d{2}-\d{2}$/.test(from))return c.json({error:'Invalid start date'},400);
   const count=Math.min(31,Math.max(1,Number(c.req.query('days')||14)));
   const dates:string[]=[];let start=new Date(from+'T00:00:00.000Z');
   if(Number.isNaN(start.getTime())||start.toISOString().slice(0,10)!==from)return c.json({error:'Invalid date'},400);
   for(let i=0;i<count;i++){const date=start.toISOString().slice(0,10);if(recurrenceRunsOn(rule,date))dates.push(date);start=new Date(start.getTime()+86400000);}
   return c.json({dates});
 });
 app.get('/dev/orders',c=>c.json([...orders.values()]));
 app.post('/dev/orders',zValidator('json',orderSchema),c=>{
   const v=c.req.valid('json');
   if(orders.has(v.id))return c.json({error:'Duplicate order ID'},409);
   const slot=slots.get(v.slotId);if(!slot)return c.json({error:'Unknown slot'},422);
   try{if(!isSlotBookable(v.deliveryDate,slot,new Date()))return c.json({error:'Slot cutoff passed or inactive'},422);}
   catch{return c.json({error:'Invalid delivery date'},400);}
   const errors=validateOrderQuantities(v.items,[...variants.values()]);
   if(errors.length)return c.json({errors},422);
   if([...orders.values()].filter(o=>o.slotId===v.slotId&&o.deliveryDate===v.deliveryDate).length>=slot.capacityOrders)return c.json({error:'Slot full'},409);
   const totalPaise=v.items.reduce((sum,item)=>sum+Math.round((variants.get(item.variantId)?.pricePaisePerKg||0)*item.grams/1000),0);
   const order={...v,totalPaise,createdAt:new Date().toISOString()};orders.set(v.id,order);return c.json(order,201);
 });
 app.get('/delivery/slots/:id/availability',c=>{
   const slot=slots.get(c.req.param('id'));if(!slot)return c.json({error:'Unknown slot'},404);
   const date=c.req.query('date')||'';
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return c.json({error:'Expected YYYY-MM-DD'},400);
   try{return c.json({slotId:slot.id,date,open:isSlotBookable(date,slot,new Date())&&[...orders.values()].filter(o=>o.slotId===slot.id&&o.deliveryDate===date).length<slot.capacityOrders});}
   catch{return c.json({error:'Invalid date'},400);}
 });
 return app;
}
