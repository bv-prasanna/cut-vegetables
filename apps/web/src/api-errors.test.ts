import {afterEach,describe,expect,it,vi} from 'vitest';
import {apiRequest,FriendlyApiError,messageForStatus,networkError} from './api-errors';
const base='https://freshprep.example.test';
afterEach(()=>vi.unstubAllGlobals());
describe('customer-safe status and error contract',()=>{
 it('provides clear messages for all negative HTTP statuses',()=>{
  const codes:[[number,string],...Array<[number,string]>]=[
   [400,'INVALID_REQUEST'],[401,'SESSION_EXPIRED'],[403,'ACCESS_DENIED'],[404,'NOT_FOUND'],
   [409,'CONFLICT'],[422,'INVALID_REQUEST'],[429,'RATE_LIMITED'],
   [500,'SERVICE_UNAVAILABLE'],[502,'SERVICE_UNAVAILABLE'],[503,'SERVICE_UNAVAILABLE'],
   [504,'SERVICE_UNAVAILABLE']
  ];
  for(const [status,code] of codes){
   const err=messageForStatus(status);
   expect(err.code).toBe(code);expect(err.message.length).toBeGreaterThan(12);
  }
 });
 it('never exposes SQL details, tokens, backend stack traces or paths',()=>{
  for(const detail of ['password=secret','relation "users" does not exist',
   'SELECT * FROM auth_sessions','Internal server error','at Query (/usr/src/node_modules)']){
   const error=messageForStatus(422,detail);
   expect(error.message).not.toContain(detail);
  }
 });
 it('allows short actionable business validation messages',()=>{
  expect(messageForStatus(422,'Slot cutoff reached').message).toBe('Slot cutoff reached');
  expect(messageForStatus(409,'Slot full').message).toBe('Slot full');
  expect(messageForStatus(401,'Invalid credentials').message).toContain('session has expired');
 });
 it('converts network failures into user action',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
  await expect(apiRequest(base,'/v1/orders')).rejects.toMatchObject({code:'NETWORK_UNAVAILABLE'});
  expect(networkError().message).toContain('connection');
 });
 it('keeps correlation IDs and does not leak sensitive errors',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(
   JSON.stringify({error:'relation "auth_sessions" missing'}),
   {status:500,headers:{'Content-Type':'application/json','X-Correlation-ID':'uat-12345678'}})));
  try{await apiRequest(base,'/v1/orders');throw Error('Expected failure');}catch(e){
   expect(e).toBeInstanceOf(FriendlyApiError);
   const err=e as FriendlyApiError;
   expect(err.correlationId).toBe('uat-12345678');
   expect(err.message).not.toContain('auth_sessions');
  }
 });
 it('sends JWT only as bearer header and does not leak it into URL',async()=>{
  const mock=vi.fn().mockResolvedValue(new Response('{"ok":true}',{status:200,headers:{'Content-Type':'application/json'}}));
  vi.stubGlobal('fetch',mock);
  await apiRequest(base,'/v1/me',{token:'private-access-token'});
  expect(mock.mock.calls[0][0]).toBe(base+'/v1/me');
  expect(mock.mock.calls[0][1].headers.Authorization).toBe('Bearer private-access-token');
 });
});
