import {describe,it,expect} from 'vitest';
import {loginScope} from './login-guard.js';
describe('login throttle keys',()=>{
 it('normalizes email case and whitespace',()=>{
  expect(loginScope(' A@Example.com ','org-1')).toBe(loginScope('a@example.com','org-1'));
 });
 it('separates independent organizations',()=>{
  expect(loginScope('a@example.com','org-1')).not.toBe(loginScope('a@example.com','org-2'));
 });
 it('does not store raw email in scope key',()=>{
  expect(loginScope('a@example.com','org-1')).not.toContain('a@example.com');
 });
});
