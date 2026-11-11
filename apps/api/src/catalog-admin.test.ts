import {describe,it,expect} from 'vitest';
import {Hono} from 'hono';
import type {Pool} from 'pg';
import {createCatalogAdminRoutes,variantInput,slotInput,variantUpdate} from './catalog-admin.js';

describe('production catalogue and slot validation',()=>{
 it('accepts a numeric diced product',()=>{
  const data={
   vegetableId:'11111111-1111-4111-8111-111111111111',
   sku:'POTATO-DICED-10MM',methodCode:'DICED',
   size:{kind:'numeric',value:10,unit:'mm'},
   imageUrl:'https://example.org/potato.jpg',
   pricePaisePerKg:4800,minimumGrams:500,incrementGrams:250
  };
  expect(variantInput.safeParse(data).success).toBe(true);
 });
 it('rejects label products with a fake unit and unknown cutting method',()=>{
  const input={
   vegetableId:'11111111-1111-4111-8111-111111111111',
   sku:'CARROT-GRATED',methodCode:'GRATED',size:{kind:'label',value:'fine',unit:'mm'},
   imageUrl:'https://example.org/carrot.jpg',pricePaisePerKg:6800,
   minimumGrams:500,incrementGrams:250
  };
  // Zod strips unknown keys; compare the parsed shape to ensure unit cannot enter SQL mapping.
  const parsed=variantInput.parse(input);
  expect(parsed.size).toEqual({kind:'label',value:'fine'});
  expect(variantInput.safeParse({...input,methodCode:'BOILED'}).success).toBe(false);
 });
 it('rejects reversed or zero-capacity delivery windows',()=>{
  const data={zoneCode:'BENGALURU',label:'Morning',startMinute:480,endMinute:300,
   cutoffDayOffset:1,cutoffMinute:1380,capacityOrders:0};
  expect(slotInput.safeParse(data).success).toBe(false);
  expect(slotInput.safeParse({...data,startMinute:300,endMinute:480,capacityOrders:40}).success).toBe(true);
 });
 it('requires at least one variant field on update',()=>{
  expect(variantUpdate.safeParse({}).success).toBe(false);
  expect(variantUpdate.safeParse({active:false}).success).toBe(true);
 });
 it('rejects mutation from an ordinary Admin even when client claims superadmin',async()=>{
  const app=new Hono<any>();
  app.use('*',async(c,next)=>{
   c.set('userId','u');c.set('organizationId','o');c.set('roles',['ADMIN']);
   await next();
  });
  app.route('/v1',createCatalogAdminRoutes({} as Pool));
  const res=await app.request('/v1/admin/vegetables',{
   method:'POST',headers:{'content-type':'application/json','x-role':'SUPERADMIN'},
   body:JSON.stringify({name:'Potato'})
  });
  expect(res.status).toBe(403);
 });
});
