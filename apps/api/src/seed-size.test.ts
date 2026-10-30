import {describe,it,expect} from 'vitest';
import {toSqlSizeFields} from './seed-size.js';
describe('sample variant SQL size mapping',()=>{
 it('maps numeric 10 mm cut into number and unit, no descriptive label',()=>{
  expect(toSqlSizeFields({kind:'numeric',value:10,unit:'mm'})).toEqual({
   kind:'numeric',number:10,unit:'mm',label:null
  });
 });
 it('maps numeric cm cut into centimeter unit',()=>{
  expect(toSqlSizeFields({kind:'numeric',value:2,unit:'cm'})).toEqual({
   kind:'numeric',number:2,unit:'cm',label:null
  });
 });
 it('maps grated fine into descriptive label without numeric dimensions',()=>{
  expect(toSqlSizeFields({kind:'label',value:'fine'})).toEqual({
   kind:'label',number:null,unit:null,label:'fine'
  });
 });
 it('maps grated coarse without a SQL size unit',()=>{
  expect(toSqlSizeFields({kind:'label',value:'coarse'})).toEqual({
   kind:'label',number:null,unit:null,label:'coarse'
  });
 });
});
