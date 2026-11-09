import {describe,it,expect} from 'vitest';
import {validateOperationInput,type OperationFields} from './operation-validation';
const id='12345678-1234-4234-8234-1234567890ab';
const event={id,vegetableId:id,receivedGrams:'1000',usableGrams:'900',rejectedGrams:'100'};
const valid=(name:Parameters<typeof validateOperationInput>[0],fields:OperationFields)=>expect(validateOperationInput(name,fields)).toBeNull();
describe('staff physical work forms',()=>{
 it('rejects malformed resource identifiers before any network request',()=>{
  expect(validateOperationInput('RECEIVE',{...event,id:'abc'})).toContain('valid id');
  valid('RECEIVE',event);
 });
 it('never sends NaN, negative, fraction or over-limit weights to PostgreSQL',()=>{
  for(const grams of ['NaN','-10','1.2','1000000001']){
   expect(validateOperationInput('BATCH',{orderId:id,variantId:id,rawLotId:id,inputGrams:grams})).not.toBeNull();
  }
  expect(validateOperationInput('RECEIVE',{...event,usableGrams:'1000',rejectedGrams:'100'}))
   .toContain('cannot exceed');
 });
 it('requires explicit human QC approval/rejection and meaningful findings',()=>{
  expect(validateOperationInput('QC',{id,passed:'',findings:'Good'})).toContain('passed');
  expect(validateOperationInput('QC',{id,passed:'true',findings:'ok'})).toContain('findings');
  valid('QC',{id,passed:'false',findings:'Visual QC failure',temperatureC:'4.5'});
  expect(validateOperationInput('QC',{id,passed:'true',findings:'Good',temperatureC:'130'})).toContain('Temperature');
 });
 it('rejects pack labels and expiration without timezone or in the past',()=>{
  const x={id,netGrams:'500',labelCode:'FRESH-100',useBy:'2099-11-20T08:00:00+05:30'};
  valid('PACK',x);
  expect(validateOperationInput('PACK',{...x,useBy:'2099-11-20T08:00:00'})).toContain('timezone');
  expect(validateOperationInput('PACK',{...x,useBy:'2020-11-20T08:00:00+05:30'})).toContain('future');
 });
 it('rejects invalid delivery dates, route stops and missing receiver names',()=>{
  expect(validateOperationInput('RUN',{slotId:id,driverId:id,deliveryDate:'2026-02-30'})).toContain('valid delivery date');
  expect(validateOperationInput('STOP',{id,orderId:id,stopNumber:'0'})).toContain('between 1 and 1000');
  expect(validateOperationInput('POD',{id,receivedBy:'X'})).toContain('Receiver name');
 });
});
