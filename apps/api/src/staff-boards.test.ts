import {describe,it,expect} from 'vitest';
import {buildProductionPlan,buildPackingQueue,buildDispatchQueue,mayAdvance,type PlanOrder,type CatalogItem} from './staff-boards.js';
const variants:CatalogItem[]=[
{id:'p10',vegetable:'Potato',preparation:'DICED',size:{kind:'numeric',value:10,unit:'mm'}},
{id:'p20',vegetable:'Potato',preparation:'DICED',size:{kind:'numeric',value:20,unit:'mm'}},
{id:'o5',vegetable:'Onion',preparation:'CHOPPED',size:{kind:'numeric',value:5,unit:'mm'}}
];
const slots=[{id:'am',label:'05:00–08:00',startMinute:300},{id:'pm',label:'14:00–17:00',startMinute:840}];
const orders:PlanOrder[]=[
{id:'a',deliveryDate:'2026-11-02',slotId:'am',state:'CONFIRMED',items:[{variantId:'p10',grams:5000},{variantId:'o5',grams:1000}]},
{id:'b',deliveryDate:'2026-11-02',slotId:'am',state:'IN_PRODUCTION',items:[{variantId:'p10',grams:7000}]},
{id:'c',deliveryDate:'2026-11-02',slotId:'pm',state:'QC_PASSED',items:[{variantId:'p20',grams:2000}]},
{id:'d',deliveryDate:'2026-11-02',slotId:'am',state:'CANCELLED',items:[{variantId:'p10',grams:12000}]},
{id:'e',deliveryDate:'2026-11-03',slotId:'am',state:'PACKED',items:[{variantId:'p10',grams:2500}]}
];
describe('cutter consolidated work board',()=>{
 it('aggregates same date, delivery slot, vegetable and cut size',()=>{
  const rows=buildProductionPlan(orders,variants,slots,'2026-11-02');
  const potato=rows.find(r=>r.slotId==='am'&&r.variantId==='p10');
  expect(potato).toMatchObject({grams:12000,orderCount:2,startedOrders:1,size:'10 mm'});
  expect(rows).toHaveLength(3);
 });
 it('does not combine 10 mm and 20 mm or different delivery slots',()=>{
  const rows=buildProductionPlan(orders,variants,slots,'2026-11-02');
  expect(rows.find(r=>r.variantId==='p20')?.grams).toBe(2000);
  expect(rows.find(r=>r.variantId==='p10')?.grams).toBe(12000);
 });
 it('respects date and slot filters',()=>{
  expect(buildProductionPlan(orders,variants,slots,'2026-11-02','pm')).toHaveLength(1);
  expect(buildProductionPlan(orders,variants,slots,'2026-11-03','am')[0].grams).toBe(2500);
 });
});
describe('packing and delivery boards',()=>{
 it('lists order-specific cut specifications and weights',()=>{
  const rows=buildPackingQueue(orders,variants,slots,'2026-11-02','am');
  expect(rows.map(r=>r.orderId)).toEqual(['a','b']);
  expect(rows[0].lines[0]).toMatchObject({description:'Potato · DICED · 10 mm',grams:5000});
 });
 it('preserves delivery queue stage and total weight',()=>{
  expect(buildDispatchQueue(orders,slots,'2026-11-02','pm')[0]).toMatchObject({orderId:'c',state:'QC_PASSED',totalGrams:2000});
 });
 it('gates status changes according to staff role',()=>{
  expect(mayAdvance('CUTTER','CONFIRMED','IN_PRODUCTION')).toBe(true);
  expect(mayAdvance('PACKER','QC_PASSED','PACKED')).toBe(true);
  expect(mayAdvance('PACKER','CONFIRMED','PACKED')).toBe(false);
  expect(mayAdvance('DELIVERY','QC_PASSED','DELIVERED')).toBe(false);
  expect(mayAdvance('QC','IN_PRODUCTION','QC_PASSED')).toBe(true);
 });
});
