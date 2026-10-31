import { describe,it,expect } from 'vitest';
import { cutoffInstant, isSlotBookable, recurrenceRunsOn, validateOrderQuantities } from './scheduling.js';
import type {Slot,Variant} from './domain.js';
const morning:Slot={id:'morning',label:'5–8 AM',startMinute:300,endMinute:480,cutoffDayOffset:1,cutoffMinute:1380,capacityOrders:50,active:true};
describe('cutoff calculation, India time',()=>{
 it('previous-day 11PM cutoff becomes previous-day 17:30Z',()=>expect(cutoffInstant('2026-10-26',morning).toISOString()).toBe('2026-10-25T17:30:00.000Z'));
 it('accepts before deadline but rejects exactly at deadline',()=>{
  expect(isSlotBookable('2026-10-26',morning,new Date('2026-10-25T17:29:59Z'))).toBe(true);
  expect(isSlotBookable('2026-10-26',morning,new Date('2026-10-25T17:30:00Z'))).toBe(false);
 });
 it('same-day 11AM cutoff',()=>{
  const slot={...morning,startMinute:840,endMinute:1020,cutoffDayOffset:0,cutoffMinute:660};
  expect(cutoffInstant('2026-10-26',slot).toISOString()).toBe('2026-10-26T05:30:00.000Z');
 });
});
describe('recurrences',()=>{
 const r={frequency:'WEEKLY' as const,weekdays:[1,3,5],startDate:'2026-10-26',endDate:'2026-11-06',slotId:'morning',items:[{variantId:'p10',grams:1000}]};
 it('respects selected weekdays and date range',()=>{
  expect(recurrenceRunsOn(r,'2026-10-26')).toBe(true);
  expect(recurrenceRunsOn(r,'2026-10-27')).toBe(false);
  expect(recurrenceRunsOn(r,'2026-11-09')).toBe(false);
 });
});
describe('quantity increments',()=>{
 const v:Variant={id:'p10',vegetable:'Potato',preparation:'DICED',size:{kind:'numeric',value:10,unit:'mm'},imageUrl:'https://example.com/p.jpg',pricePaisePerKg:8000,minimumGrams:500,incrementGrams:250,active:true};
 it('validates minimum/increment and inactive variant',()=>{
  expect(validateOrderQuantities([{variantId:'p10',grams:750}],[v])).toEqual([]);
  expect(validateOrderQuantities([{variantId:'p10',grams:600}],[v])).toHaveLength(1);
  expect(validateOrderQuantities([{variantId:'p10',grams:750}],[{...v,active:false}])).toHaveLength(1);
 });
});
