import React from 'react';
import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import SecureOperations from './SecureOperations';
const props={base:'/api',token:'test-token',date:'2026-11-22',onChanged:()=>{},onSessionExpired:()=>{}};
describe('secure operational action workspaces',()=>{
 it('offers supplier, purchase and receipt actions to procurement',()=>{
  const html=renderToStaticMarkup(<SecureOperations {...props} tab="Procurement" roles={['PROCUREMENT']}/>);
  expect(html).toContain('Create supplier');expect(html).toContain('Create purchase order');expect(html).toContain('Receive raw vegetable lot');
  expect(html).not.toContain('Local demonstration');
 });
 it('offers production start and reconciled completion to operators',()=>{
  const html=renderToStaticMarkup(<SecureOperations {...props} tab="Cutting" roles={['OPERATOR']}/>);
  expect(html).toContain('Start production batch');expect(html).toContain('Complete production batch');
 });
 it('keeps QC approval separate from production supervision',()=>{
  const supervisor=renderToStaticMarkup(<SecureOperations {...props} tab="Quality" roles={['PRODUCTION_SUPERVISOR']}/>);
  expect(supervisor).toContain('cannot approve or reject QC');
  expect(supervisor).not.toContain('Record QC inspection');
  const qc=renderToStaticMarkup(<SecureOperations {...props} tab="Quality" roles={['QC']}/>);
  expect(qc).toContain('Record QC inspection');
 });
 it('shows packing and dispatcher actions only to their permitted roles',()=>{
  const packer=renderToStaticMarkup(<SecureOperations {...props} tab="Packing" roles={['PACKER']}/>);
  const dispatcher=renderToStaticMarkup(<SecureOperations {...props} tab="Delivery" roles={['DISPATCH']}/>);
  expect(packer).toContain('Create labelled pack');
  expect(dispatcher).toContain('Create delivery run');expect(dispatcher).toContain('Assign packed order to run');
  expect(dispatcher).not.toContain('Confirm proof of delivery');
 });
 it('shows proof of delivery only to the assigned-driver role',()=>{
  const driver=renderToStaticMarkup(<SecureOperations {...props} tab="Delivery" roles={['DRIVER']}/>);
  expect(driver).toContain('Confirm proof of delivery');
  expect(driver).not.toContain('Create delivery run');
 });
});
