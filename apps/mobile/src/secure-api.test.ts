import {describe,it,expect} from 'vitest';
import {validateApiBase,isSecureMobileRelease,screenPermissions,sizeDescription} from './secure-api';
describe('secure mobile environment',()=>{
 it('requires an explicit API URL and HTTPS for public hosts',()=>{
  expect(()=>validateApiBase(undefined)).toThrow('EXPO_PUBLIC_API_URL');
  expect(()=>validateApiBase('http://example.com')).toThrow('HTTPS');
  expect(validateApiBase('https://freshprep-api.example.org/')).toBe('https://freshprep-api.example.org');
  expect(validateApiBase('http://10.0.2.2:3001')).toBe('http://10.0.2.2:3001');
  expect(()=>validateApiBase('https://user:pass@example.com')).toThrow();
 });
 it('does not select an unauthenticated demo by default',()=>{
  expect(isSecureMobileRelease()).toBe(process.env.EXPO_PUBLIC_ENABLE_DEMO!=='true');
 });
 it('never exposes production tasks from buyer role claims',()=>{
  const buyer=screenPermissions(['CUSTOMER_BUYER']);
  expect(buyer).toContain('Place Order');
  expect(buyer).not.toContain('Delivery');
  expect(buyer).not.toContain('Packing');
 });
 it('restricts cutting, packing and driver menus to verified role claims',()=>{
  expect(screenPermissions(['OPERATOR'])).toContain('Cutting');
  expect(screenPermissions(['PACKER'])).toContain('Packing');
  expect(screenPermissions(['DRIVER'])).toContain('Delivery');
  expect(screenPermissions(['DRIVER'])).not.toContain('Place Order');
 });
 it('formats a product size with correct unit',()=>{
  expect(sizeDescription({id:'a',sku:'POTATO',vegetable:'Potato',preparation:'DICED',size_kind:'numeric',size_number:'10',size_unit:'mm',size_label:null,image_url:'',price_paise_per_kg:4500,minimum_grams:500,increment_grams:250})).toBe('10 mm');
 });
});
