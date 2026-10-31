import {describe,it,expect} from 'vitest';
import {buildDemoCatalogue,buildDemoSlots} from './demo-catalog.js';
import {variantSchema,slotSchema} from './domain.js';
describe('100-product development catalogue',()=>{
 const catalog=buildDemoCatalogue();
 it('provides exactly 100 distinctive saleable variants',()=>{
  expect(catalog).toHaveLength(100);
  expect(new Set(catalog.map(p=>p.id)).size).toBe(100);
  expect(new Set(catalog.map(p=>p.vegetable)).size).toBe(25);
 });
 it('validates every variant against production input constraints',()=>{
  expect(catalog.every(p=>variantSchema.safeParse(p).success)).toBe(true);
 });
 it('includes multiple cutting and grating options',()=>{
  const carrots=catalog.filter(p=>p.vegetable==='Carrot');
  expect(carrots.some(p=>p.preparation==='GRATED'&&p.size.kind==='label'&&p.size.value==='fine')).toBe(true);
  expect(carrots.some(p=>p.preparation==='GRATED'&&p.size.kind==='label'&&p.size.value==='coarse')).toBe(true);
  const potato=catalog.filter(p=>p.vegetable==='Potato');
  expect(potato.some(p=>p.size.kind==='numeric'&&p.size.value===10)).toBe(true);
  expect(potato.some(p=>p.size.kind==='numeric'&&p.size.value===20)).toBe(true);
 });
 it('has sane positive demo pricing, usable images and quantities',()=>{
  expect(catalog.every(p=>p.pricePaisePerKg>0&&p.minimumGrams>0&&p.imageUrl.startsWith('https://'))).toBe(true);
 });
 it('uses the two requested delivery cutoff examples',()=>{
  const slots=buildDemoSlots();
  expect(slots.every(s=>slotSchema.safeParse(s).success)).toBe(true);
  expect(slots.find(s=>s.id==='sample-morning')).toMatchObject({cutoffDayOffset:1,cutoffMinute:1380});
  expect(slots.find(s=>s.id==='sample-afternoon')).toMatchObject({cutoffDayOffset:0,cutoffMinute:660});
 });
});
