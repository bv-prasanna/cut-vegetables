import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import StaffBoards from './StaffBoards';
describe('staff boards presentation',()=>{
 it('shows cutter, QC, packer, dispatch and driver role selectors',()=>{
  const html=renderToStaticMarkup(<StaffBoards slots={[{id:'morning',label:'5 AM – 8 AM'}]}/>);
  for(const heading of ['Consolidated Cutting Plan','Daily vegetable totals','Cutter','Packing','Dispatch','Driver','QC'])
   expect(html).toContain(heading);
 });
 it('displays operational disclaimers instead of claiming physical fulfilment',()=>{
  const html=renderToStaticMarkup(<StaffBoards slots={[]}/>);
  expect(html).toContain('Local demonstration');
  expect(html).toContain('physical QC');
 });
});
