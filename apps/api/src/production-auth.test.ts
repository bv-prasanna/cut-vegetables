import {describe,it,expect} from 'vitest';
import type {Pool} from 'pg';
import {passwordHash} from './security.js';
import {createProductionApp} from './production-app.js';

const secret='test-only-jwt-secret-for-freshprep-do-not-use-in-deployment';
const userId='11111111-1111-4111-8111-111111111111';
const organizationId='22222222-2222-4222-8222-222222222222';
const now=new Date('2026-10-31T08:00:00Z');
function createMockPool(){
 const password='correct-and-long-password';
 const stored=passwordHash(password);
 let sessionHash='';
 let revoked=false;
 const log:string[]=[];
 const mock={
  async query(sql:string,args:any[]=[]){
   log.push(sql);
   if(sql.includes('auth_login_attempts')&&sql.startsWith('SELECT'))
    return {rows:[{locked:false}],rowCount:1};
   if(sql.startsWith('DELETE FROM auth_login_attempts')||sql.startsWith('INSERT INTO auth_login_attempts'))
    return {rows:[],rowCount:1};
   if(sql.startsWith('SELECT id,password_hash,active FROM users'))
    return {rows:[{id:userId,password_hash:stored,active:true}],rowCount:1};
   if(sql.startsWith('SELECT 1 FROM memberships'))
    return {rows:[{ok:true}],rowCount:1};
   if(sql.startsWith('INSERT INTO auth_sessions')) {
    sessionHash=args[2];
    return {rows:[],rowCount:1};
   }
   if(sql.startsWith('SELECT s.user_id,s.organization_id,m.role FROM auth_sessions')){
    const valid=!revoked&&args[0]===sessionHash&&args[1]===userId&&args[2]===organizationId;
    return {rows:valid?[{user_id:userId,organization_id:organizationId,role:'SUPERADMIN'}]:[],rowCount:valid?1:0};
   }
   if(sql.startsWith('UPDATE auth_sessions')){revoked=true;return {rows:[],rowCount:1};}
   if(sql.startsWith('SELECT count('))return {rows:[{count:0}],rowCount:1};
   if(sql.startsWith('SELECT state,count('))return {rows:[],rowCount:0};
   throw new Error('Unexpected query: '+sql);
  }
 };
 return {pool:mock as unknown as Pool,password,log};
}
describe('PostgreSQL JWT API contract',()=>{
 it('rejects startup without a configured strong secret',()=>{
  const {pool}=createMockPool();
  expect(()=>createProductionApp(pool,()=>now,'weak')).toThrow('JWT_SECRET');
 });
 it('issues JWT and validates user/organization/session from database for /v1/me',async()=>{
  const {pool,password}=createMockPool();
  const app=createProductionApp(pool,()=>now,secret);
  const login=await app.request('/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'admin@example.com',password,organizationId})});
  expect(login.status).toBe(200);
  const data=await login.json() as {accessToken:string;tokenType:string;expiresInSeconds:number};
  expect(data.accessToken.split('.')).toHaveLength(3);
  expect(data.expiresInSeconds).toBe(900);
  const token='Bearer '+data.accessToken;
  const me=await app.request('/v1/me',{headers:{Authorization:token}});
  expect(me.status).toBe(200);
  expect(await me.json()).toEqual({userId,organizationId,roles:['SUPERADMIN']});
  const bad=await app.request('/v1/me',{headers:{Authorization:token.slice(0,-2)+'xx'}});
  expect(bad.status).toBe(401);
  const logout=await app.request('/v1/logout',{method:'POST',headers:{Authorization:token}});
  expect(logout.status).toBe(200);
  const after=await app.request('/v1/me',{headers:{Authorization:token}});
  expect(after.status).toBe(401);
 });
 it('denies unauthenticated access to superadmin endpoints',async()=>{
  const {pool}=createMockPool();
  const app=createProductionApp(pool,()=>now,secret);
  expect((await app.request('/v1/admin/staff')).status).toBe(401);
  expect((await app.request('/v1/ops/production-plan?date=2026-11-02')).status).toBe(401);
 });
 it('never accepts a user-supplied role as authentication',async()=>{
  const {pool}=createMockPool();
  const app=createProductionApp(pool,()=>now,secret);
  const response=await app.request('/v1/admin/staff',{headers:{'x-role':'SUPERADMIN','x-organization-id':organizationId}});
  expect(response.status).toBe(401);
 });
});
