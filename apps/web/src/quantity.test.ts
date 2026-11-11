import {describe,expect,it} from 'vitest';
import {nextQuantity} from './quantity';
describe('SKU quantity control negatives',()=>{
 it('adds the product minimum first, then exact increment',()=>{
  expect(nextQuantity(0,500,250,1)).toBe(500);
  expect(nextQuantity(500,500,250,1)).toBe(750);
 });
 it('drops directly to zero from product minimum, never an invalid 250g basket',()=>{
  expect(nextQuantity(500,500,250,-1)).toBe(0);
  expect(nextQuantity(750,500,250,-1)).toBe(500);
  expect(nextQuantity(500,500,100,-1)).toBe(0);
 });
 it('rejects missing, negative or invalid SKU weight configuration',()=>{
  expect(()=>nextQuantity(0,0,200,1)).toThrow();
  expect(()=>nextQuantity(500,500,0,-1)).toThrow();
  expect(()=>nextQuantity(-1,500,250,1)).toThrow();
 });
});
