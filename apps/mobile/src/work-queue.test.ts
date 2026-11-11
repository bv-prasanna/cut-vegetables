import {describe,it,expect} from 'vitest';
import {remainingGrams,packingReadiness,kgOf,rowOf,humanState,todayInIndia} from './work-queue';
describe('real staff workboard quantities and empty states',()=>{
 it('does not show negative remaining kilograms if already packed exceeds required',()=>{
  expect(remainingGrams(500,750)).toBe(0);
  expect(remainingGrams(18000,12750)).toBe(5250);
  expect(kgOf(1250)).toContain('1.25');
 });
 it('requires ALL order lines to be fully packed, not just one line',()=>{
  const incomplete=[{requiredGrams:2000,qcApprovedGrams:2000,packedGrams:2000},
   {requiredGrams:1000,qcApprovedGrams:1000,packedGrams:0}];
  expect(packingReadiness(incomplete)).toMatchObject({required:3000,remaining:1000,ready:false});
  expect(packingReadiness([{...incomplete[0]},{...incomplete[1],packedGrams:1000}]).ready).toBe(true);
  expect(packingReadiness([]).ready).toBe(false);
 });
 it('does not mistake null, invalid numeric or object data for completed work',()=>{
  expect(kgOf('garbage')).toBe('0 kg');
  expect(rowOf(null)).toEqual({});
  expect(remainingGrams(1000,-500)).toBe(1000);
  expect(humanState('QC_PASSED')).toBe('Qc passed');
 });
 it('calculates the business date in IST, not the device timezone',()=>{
  expect(todayInIndia(new Date('2026-11-09T21:00:00Z'))).toBe('2026-11-10');
 });
});
