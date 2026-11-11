import {describe,it,expect} from 'vitest';
import {checkOrder,quoteOrder} from './order-core.js';
import type {Slot,Variant} from './domain.js';
const slot:Slot={id:'am',label:'05-08',startMinute:300,endMinute:480,cutoffDayOffset:1,cutoffMinute:1380,capacityOrders:2,active:true};
const veg:Variant={id:'p10',vegetable:'Potato',preparation:'DICED',size:{kind:'numeric',value:10,unit:'mm'},imageUrl:'https://example.com/p.png',pricePaisePerKg:8099,minimumGrams:500,incrementGrams:250,active:true};
const now=new Date('2026-10-25T12:00:00.000Z');
describe('order pricing and admission',()=>{
 it('snapshots integer paise and rounded line totals',()=>expect(quoteOrder([{variantId:'p10',grams:750}],[veg]).totalPaise).toBe(6074));
 it('rejects duplicates',()=>expect(()=>quoteOrder([{variantId:'p10',grams:500},{variantId:'p10',grams:500}],[veg])).toThrow('Duplicate'));
 it('rejects empty and unavailable variants',()=>{expect(()=>quoteOrder([],[veg])).toThrow();expect(()=>quoteOrder([{variantId:'x',grams:500}],[veg])).toThrow();});
 it('accepts a future bookable slot',()=>expect(checkOrder({deliveryDate:'2026-10-26',slot,ordersAlreadyReserved:0,items:[{variantId:'p10',grams:500}],variants:[veg]},now).ok).toBe(true));
 it('rejects full capacity',()=>expect(checkOrder({deliveryDate:'2026-10-26',slot,ordersAlreadyReserved:2,items:[{variantId:'p10',grams:500}],variants:[veg]},now)).toEqual({ok:false,reason:'Slot full'}));
 it('rejects the exact cutoff',()=>expect(checkOrder({deliveryDate:'2026-10-26',slot,ordersAlreadyReserved:0,items:[{variantId:'p10',grams:500}],variants:[veg]},new Date('2026-10-25T17:30:00Z'))).toEqual({ok:false,reason:'Slot cutoff passed or inactive'}));
 it('rejects invalid calendar dates',()=>expect(checkOrder({deliveryDate:'2026-02-30',slot,ordersAlreadyReserved:0,items:[{variantId:'p10',grams:500}],variants:[veg]},now).ok).toBe(false));
});
