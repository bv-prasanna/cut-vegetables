import {describe,it,expect} from 'vitest';
import {actionChoicesForField,emptyActionOptions,isActionChoiceField,type ActionOptions} from './action-choices';
const options:ActionOptions={
 ...emptyActionOptions,
 suppliers:[{id:'s1',name:'Farm One',active:true},{id:'s2',name:'Inactive Farm',active:false}],
 purchases:[{id:'p1',status:'APPROVED',supplier_id:'s1',supplier:'Farm One'},{id:'p2',status:'CANCELLED',supplier_id:'s1',supplier:'Farm One'}],
 vegetables:[{id:'v1',name:'Potato'},{id:'v2',name:'Carrot'}],
 rawLots:[{id:'l1',vegetable_id:'v1',vegetable:'Potato',supplier_lot:'LOT-A',usable_grams:2500},{id:'l2',vegetable_id:'v2',vegetable:'Carrot',supplier_lot:'LOT-B',usable_grams:3000},{id:'l3',vegetable_id:'v1',vegetable:'Potato',supplier_lot:'EMPTY',usable_grams:0}],
 orders:[{id:'o1',delivery_date:'2026-11-24',slot_id:'slot1',slot_label:'Morning',state:'CONFIRMED',kitchen:'Kitchen A',customer:'Hotel A',items:[{variantId:'var1',vegetableId:'v1',description:'Potato diced 10 mm',grams:1000}]}],
 batches:[
  {id:'b1',order_id:'o1',variant_id:'var1',state:'PROCESSING',input_grams:1000,output_grams:null,waste_grams:null,delivery_date:'2026-11-24',slot_label:'Morning',vegetable:'Potato',preparation:'DICED',size:'10 mm'},
  {id:'b2',order_id:'o1',variant_id:'var1',state:'AWAITING_QC',input_grams:1000,output_grams:950,waste_grams:50,delivery_date:'2026-11-24',slot_label:'Morning',vegetable:'Potato',preparation:'DICED',size:'10 mm'},
  {id:'b3',order_id:'o1',variant_id:'var1',state:'QC_PASSED',input_grams:1000,output_grams:950,waste_grams:50,delivery_date:'2026-11-24',slot_label:'Morning',vegetable:'Potato',preparation:'DICED',size:'10 mm'},
  {id:'b4',order_id:'o1',variant_id:'var1',state:'QC_FAILED',input_grams:1000,output_grams:900,waste_grams:100,delivery_date:'2026-11-24',slot_label:'Morning',vegetable:'Potato',preparation:'DICED',size:'10 mm'}
 ],
 drivers:[{id:'d1',email:'driver@example.invalid'}],
 slots:[{id:'slot1',label:'Morning',zone_code:'ZONE-A'}],
 runs:[{id:'r1',driver_id:'d1',driver_email:'driver@example.invalid',slot_id:'slot1',slot_label:'Morning',delivery_date:'2026-11-24',status:'PLANNED'}],
 stops:[{id:'st1',run_id:'r1',order_id:'o1',stop_number:1,status:'PENDING',driver_id:'d1',delivery_date:'2026-11-24',slot_id:'slot1',slot_label:'Morning',kitchen:'Kitchen A',customer:'Hotel A'}]
};
describe('mobile operational selection options',()=>{
 it('replaces procurement UUID entry with active supplier, approved purchase and vegetable choices',()=>{
  expect(actionChoicesForField('PURCHASE','supplierId',options,[] as unknown as Record<string,string>)).toEqual([{value:'s1',label:'Farm One'}]);
  expect(actionChoicesForField('RECEIVE','id',options,{}).map(x=>x.value)).toEqual(['p1']);
  expect(actionChoicesForField('RECEIVE','vegetableId',options,{}).map(x=>x.label)).toEqual(['Potato','Carrot']);
 });
 it('limits production selections to confirmed order lines and matching usable raw lots',()=>{
  expect(actionChoicesForField('BATCH','orderId',options,{}).map(x=>x.value)).toEqual(['o1']);
  expect(actionChoicesForField('BATCH','variantId',options,{orderId:'o1'}).map(x=>x.value)).toEqual(['var1']);
  expect(actionChoicesForField('BATCH','rawLotId',options,{orderId:'o1',variantId:'var1'}).map(x=>x.value)).toEqual(['l1']);
 });
 it('offers only batches at the correct state for completion, QC and packing',()=>{
  expect(actionChoicesForField('COMPLETE','id',options,{}).map(x=>x.value)).toEqual(['b1']);
  expect(actionChoicesForField('QC','id',options,{}).map(x=>x.value)).toEqual(['b2']);
  expect(actionChoicesForField('REWORK','id',options,{}).map(x=>x.value)).toEqual(['b4']);
  expect(actionChoicesForField('PACK','id',options,{}).map(x=>x.value)).toEqual(['b3']);
 });
 it('limits dispatch and driver choices to compatible runs, packed orders and assigned open stops',()=>{
  expect(actionChoicesForField('RUN','slotId',options,{}).map(x=>x.value)).toEqual(['slot1']);
  expect(actionChoicesForField('RUN','driverId',options,{}).map(x=>x.value)).toEqual(['d1']);
  expect(actionChoicesForField('STOP','id',options,{}).map(x=>x.value)).toEqual(['r1']);
  expect(actionChoicesForField('STOP','orderId',options,{id:'r1'})).toHaveLength(0);
  expect(actionChoicesForField('ARRIVE','id',options,{}).map(x=>x.value)).toEqual(['st1']);
  expect(actionChoicesForField('POD','id',options,{}).map(x=>x.value)).toEqual(['st1']);
 });
 it('identifies selector fields so the app never falls back to asking staff to type UUIDs',()=>{
  expect(isActionChoiceField('BATCH','orderId')).toBe(true);
  expect(isActionChoiceField('QC','id')).toBe(true);
  expect(isActionChoiceField('REWORK','id')).toBe(true);
  expect(isActionChoiceField('ARRIVE','id')).toBe(true);
  expect(isActionChoiceField('POD','id')).toBe(true);
  expect(isActionChoiceField('SUPPLIER','name')).toBe(false);
 });
});
