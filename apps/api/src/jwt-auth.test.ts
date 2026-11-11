import {describe,it,expect} from 'vitest';
import {SignJWT} from 'jose';
import {issueJwt,jwtKey,verifyJwt,readBearer,JWT_AUDIENCE,JWT_ISSUER,ACCESS_TOKEN_SECONDS} from './jwt-auth.js';

const secret='test-only-secret-very-long-at-least-32-bytes-do-not-deploy';
const other='a-different-key-that-is-long-enough-for-hmac-verification';
const userId='33333333-3333-4333-8333-333333333333';
const orgId='44444444-4444-4444-8444-444444444444';
const now=new Date('2026-10-31T12:00:00Z');

describe('signed access tokens',()=>{
 it('issues signed short-lived JWT with required subject, organization and jti',async()=>{
  const issued=await issueJwt(secret,userId,orgId,now);
  expect(issued.expiresInSeconds).toBe(ACCESS_TOKEN_SECONDS);
  expect(issued.accessToken.split('.')).toHaveLength(3);
  const verified=await verifyJwt(issued.accessToken,secret,now);
  expect(verified).toMatchObject({userId,organizationId:orgId,sessionHash:issued.sessionHash,sessionId:issued.sessionId});
  expect(readBearer('Bearer '+issued.accessToken)).toBe(issued.accessToken);
 });
 it('rejects a modified token, incorrect key, and expiry',async()=>{
  const token=(await issueJwt(secret,userId,orgId,now)).accessToken;
  expect(await verifyJwt(token,other,now)).toBeNull();
  expect(await verifyJwt(token,secret,new Date(now.getTime()+15*60_000+1000))).toBeNull();
  expect(await verifyJwt(token.slice(0,-2)+'aa',secret,now)).toBeNull();
 });
 it('rejects forged audience and issuer despite valid HMAC',async()=>{
  const key=jwtKey(secret);
  const otherAudience=await new SignJWT({org:orgId}).setProtectedHeader({alg:'HS256',typ:'JWT'})
   .setIssuer(JWT_ISSUER).setAudience('other-client').setSubject(userId).setJti('session')
   .setIssuedAt(Math.floor(now.getTime()/1000)).setExpirationTime(Math.floor(now.getTime()/1000)+300).sign(key);
  expect(await verifyJwt(otherAudience,secret,now)).toBeNull();
  const otherIssuer=await new SignJWT({org:orgId}).setProtectedHeader({alg:'HS256',typ:'JWT'})
   .setIssuer('someone-else').setAudience(JWT_AUDIENCE).setSubject(userId).setJti('session')
   .setIssuedAt(Math.floor(now.getTime()/1000)).setExpirationTime(Math.floor(now.getTime()/1000)+300).sign(key);
  expect(await verifyJwt(otherIssuer,secret,now)).toBeNull();
 });
 it('refuses weak or absent JWT secrets and malformed bearers',()=>{
  expect(()=>jwtKey('short')).toThrow('JWT_SECRET');
  expect(()=>jwtKey(undefined)).toThrow('JWT_SECRET');
  expect(readBearer('Basic abc')).toBeNull();
  expect(readBearer('Bearer a.b')).toBeNull();
 });
});
