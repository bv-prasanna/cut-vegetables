import {describe,it,expect} from 'vitest';
import {passwordHash,passwordMatches,newSessionToken,digestToken,bearerToken} from './security.js';
describe('session and password security',()=>{
 it('stores salted hashes and verifies correct password',()=>{
  const a=passwordHash('long-enough-secret-123');const b=passwordHash('long-enough-secret-123');
  expect(a).not.toBe(b);expect(passwordMatches('long-enough-secret-123',a)).toBe(true);
  expect(passwordMatches('wrong-password',a)).toBe(false);
 });
 it('rejects malformed hashes and weak passwords',()=>{
  expect(passwordMatches('whatever','bad')).toBe(false);
  expect(()=>passwordHash('short')).toThrow();
 });
 it('creates random tokens and digests only for storage',()=>{
  const a=newSessionToken(),b=newSessionToken();expect(a).not.toBe(b);
  expect(digestToken(a)).not.toBe(a);expect(digestToken(a)).toBe(digestToken(a));
  expect(bearerToken('Bearer '+a)).toBe(a);
  expect(bearerToken('Basic '+a)).toBe(null);
 });
});
