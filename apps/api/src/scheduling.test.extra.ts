import {describe,it,expect} from 'vitest';
import {localDate,recurrenceRunsOn,isSlotBookable,cutoffInstant,validateOrderQuantities} from './scheduling.js';
import type {Slot,Variant,Recurrence} from './domain.js';
const slot:Slot={id:'afternoon',label:'14-17',startMinute:840,endMinute:1020,cutoffDayOffset:0,cutoffMinute:660,capacityOrders:5,active:true};
const variant:Variant={id:'onion-20',vegetable:'Onion',preparation:'CHOPPED',size:{kind:'numeric',value:20,unit:'mm'},imageUrl:'https://example.com/onion.jpg',pricePaisePerKg:9600,minimumGrams:500,incrementGrams:250,active:true};
describe('calendar cutoffs and negative validation',()=>{
 it.each(['2026-02-30','2026-13-01','2026-00-01','not-a-date'])('rejects invalid calendar date %s',day=>expect(()=>localDate(day)).toThrow());
 it('checks 11am cutoff exactly',()=>{const at=cutoffInstant('2026-10-27',slot);expect(at.toISOString()).toBe('2026-10-27T05:30:00.000Z');expect(isSlotBookable('2026-10-27',slot,new Date(at.getTime()-1))).toBe(true);expect(isSlotBookable('2026-10-27',slot,at)).toBe(false);});
 it('rejects inactive slots',()=>expect(isSlotBookable('2026-10-27',{...slot,active:false},new Date('2026-10-26'))).toBe(false));
 it('checks min quantity and increments',()=>{expect(validateOrderQuantities([{variantId:variant.id,grams:500}],[variant])).toEqual([]);expect(validateOrderQuantities([{variantId:variant.id,grams:501}],[variant])).toHaveLength(1);expect(validateOrderQuantities([{variantId:variant.id,grams:250}],[variant])).toHaveLength(1);});
 it('rejects unavailable SKU and disabled variant',()=>{expect(validateOrderQuantities([{variantId:'none',grams:500}],[variant])).toHaveLength(1);expect(validateOrderQuantities([{variantId:variant.id,grams:500}],[{...variant,active:false}])).toHaveLength(1);});
 it('weekly schedules reject nonchosen weekdays',()=>{const rule:Recurrence={frequency:'WEEKLY',weekdays:[1,3,5],startDate:'2026-10-26',endDate:'2026-11-06',slotId:'afternoon',items:[{variantId:variant.id,grams:500}]};expect(recurrenceRunsOn(rule,'2026-10-26')).toBe(true);expect(recurrenceRunsOn(rule,'2026-10-27')).toBe(false);expect(recurrenceRunsOn(rule,'2026-11-09')).toBe(false);});
});
