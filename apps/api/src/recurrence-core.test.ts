import {describe,it,expect} from 'vitest';
import {occurrenceKey,listOccurrences} from './recurrence-core.js';
const rule={frequency:'WEEKLY' as const,weekdays:[1,3,5],startDate:'2026-10-26',endDate:'2026-10-30',slotId:'am',items:[{variantId:'p10',grams:500}]};
describe('recurrence planner',()=>{
 it('selects weekdays and excludes skip dates',()=>expect(listOccurrences(rule,'2026-10-26',7,new Set(['2026-10-28']))).toEqual(['2026-10-26','2026-10-30']));
 it('returns no occurrences outside schedule',()=>expect(listOccurrences(rule,'2026-11-01',7)).toEqual([]));
 it('rejects unbounded horizons',()=>expect(()=>listOccurrences(rule,'2026-10-26',367)).toThrow());
 it('uses deterministic occurrence keys',()=>expect(occurrenceKey('schedule','2026-10-26','slot')).toBe('schedule:2026-10-26:slot'));
});
