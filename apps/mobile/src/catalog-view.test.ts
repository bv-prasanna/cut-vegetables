import {describe,it,expect} from 'vitest';
import {searchCuts,basketTotals} from './catalog-view';
import type {CatalogueVariant} from './secure-api';
const p:CatalogueVariant[]=[
 {id:'one',sku:'CARROT-DICE-10',vegetable:'Carrot',preparation:'DICED',size_kind:'numeric',
  size_number:'10',size_unit:'mm',size_label:null,image_url:'',price_paise_per_kg:8000,minimum_grams:500,increment_grams:250},
 {id:'two',sku:'ONION-GRATE-FINE',vegetable:'Onion',preparation:'GRATED',size_kind:'label',
  size_number:null,size_unit:null,size_label:'fine',image_url:'',price_paise_per_kg:9000,minimum_grams:500,increment_grams:250}
];
describe('mobile preparation catalogue',()=>{
 it('searches vegetable, method, size and sku without case sensitivity',()=>{
  expect(searchCuts(p,' carrot ')).toHaveLength(1);
  expect(searchCuts(p,'10 mm')[0].id).toBe('one');
  expect(searchCuts(p,'fine')[0].id).toBe('two');
  expect(searchCuts(p,'DICE')).toHaveLength(1);
  expect(searchCuts(p,'unavailable')).toHaveLength(0);
 });
 it('calculates explanatory B2B basket totals without double counting invalid entries',()=>{
  expect(basketTotals({one:500,two:1000},p)).toEqual({itemCount:2,totalGrams:1500,estimatedPaise:13000});
  expect(basketTotals({one:-250,two:0,ghost:500},p)).toEqual({itemCount:0,totalGrams:0,estimatedPaise:0});
 });
});
