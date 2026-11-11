import {describe,it,expect} from 'vitest';
import {checkoutError,fingerprintOrder} from './checkout-validation';
import type {CatalogueVariant,DeliverySlot,Kitchen} from './secure-api';
const K='a',S='b',V='c',DATE='2026-11-18';
const kitchens:Kitchen[]=[{id:K,name:'Commercial Kitchen',zone_code:'BENGALURU',address:'Mock address'}];
const slots:DeliverySlot[]=[{id:S,label:'Morning 05–08',zone_code:'BENGALURU',start_minute:300,end_minute:480,cutoff_day_offset:1,cutoff_minute:1380,capacity_orders:10}];
const products:CatalogueVariant[]=[{id:V,sku:'CARROT10',vegetable:'Carrot',preparation:'DICED',size_kind:'numeric',size_number:'10',size_unit:'mm',size_label:null,image_url:'',price_paise_per_kg:7000,minimum_grams:500,increment_grams:250}];
const items=[{variantId:V,grams:500}];
const check=(k:string=K,s:string=S,d:string=DATE,it=items,z=slots)=>checkoutError(k,s,d,it,kitchens,z,products,'2026-11-10');
describe('mobile checkout negative preflight',()=>{
 it('rejects wrong kitchen, wrong zone, missing basket and impossible dates before network',()=>{
  expect(check('wrong')).toContain('registered kitchens');
  expect(check(K,'bad')).toContain('delivery window');
  expect(check(K,S,DATE,items,[{...slots[0],zone_code:'OTHER'}])).toContain('delivery window');
  expect(check(K,S,DATE,[])).toContain('at least one');
  expect(check(K,S,'2026-02-30')).toContain('valid delivery date');
  expect(check(K,S,'2026-10-30')).toContain('in the past');
 });
 it('accepts only supported SKU minimum and increments',()=>{
  expect(check()).toBeNull();
  expect(check(K,S,DATE,[{variantId:V,grams:250}])).toContain('minimum');
  expect(check(K,S,DATE,[{variantId:V,grams:625}])).toContain('increment');
  expect(check(K,S,DATE,[{variantId:'not-in-catalogue',grams:500}])).toContain('unavailable');
 });
 it('generates a stable order fingerprint independent of basket item order',()=>{
  expect(fingerprintOrder(K,S,DATE,[{variantId:'a',grams:500},{variantId:'b',grams:750}]))
   .toBe(fingerprintOrder(K,S,DATE,[{variantId:'b',grams:750},{variantId:'a',grams:500}]));
  expect(fingerprintOrder(K,S,DATE,items)).not.toBe(fingerprintOrder(K,S,'2026-11-19',items));
 });
});
