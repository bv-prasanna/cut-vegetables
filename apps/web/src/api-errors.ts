/**
 * FreshPrep's safe, customer-facing API error contract.
 * Based on the generic safeApiError/observability conventions of
 * varadatechworks/app-skeleton, adapted without sharing auth state.
 */
export type ApiErrorCode='NETWORK_UNAVAILABLE'|'SESSION_EXPIRED'|'ACCESS_DENIED'|
 'NOT_FOUND'|'CONFLICT'|'INVALID_REQUEST'|'RATE_LIMITED'|'SERVICE_UNAVAILABLE'|'REQUEST_FAILED';
export class FriendlyApiError extends Error{
 constructor(public readonly code:ApiErrorCode,public readonly status:number,
  message:string,public readonly correlationId?:string){
  super(message);this.name='FriendlyApiError';
 }
}
const statusMessages:Record<number,{code:ApiErrorCode;message:string}>={
 400:{code:'INVALID_REQUEST',message:'Please review the highlighted details and try again.'},
 401:{code:'SESSION_EXPIRED',message:'Your session has expired. Please sign in again.'},
 403:{code:'ACCESS_DENIED',message:'Your account does not have permission for this action.'},
 404:{code:'NOT_FOUND',message:'This record could not be found. Refresh the page and try again.'},
 409:{code:'CONFLICT',message:'This request conflicts with an existing booking or record. Refresh and review it.'},
 422:{code:'INVALID_REQUEST',message:'Some details are invalid or this action is not allowed in its current state.'},
 429:{code:'RATE_LIMITED',message:'Too many attempts. Please wait before trying again.'},
 500:{code:'SERVICE_UNAVAILABLE',message:'We could not complete your request. Please try again shortly.'},
 502:{code:'SERVICE_UNAVAILABLE',message:'Our service is temporarily unavailable. Please try again shortly.'},
 503:{code:'SERVICE_UNAVAILABLE',message:'Our service is temporarily unavailable. Please try again shortly.'},
 504:{code:'SERVICE_UNAVAILABLE',message:'The request took too long. Please try again.'}
};
const safeBusinessDetail=(value:unknown)=>typeof value==='string' &&
 value.length<=170 && !/(?:SQLSTATE|stack trace|syntax error|at\s+\S+\s*\(|internal server|password|secret|token|postgres|pg_|relation\s+"|SELECT\s+|INSERT\s+|UPDATE\s+|DELETE\s+|\/(?:home|var|usr)\/)/i.test(value) &&
 !/[\r\n<>]/.test(value) ? value.trim() : '';
export function messageForStatus(status:number,serverError?:unknown,correlationId?:string):FriendlyApiError{
 const entry=statusMessages[status]??(status>=500?statusMessages[500]:{
  code:'REQUEST_FAILED' as ApiErrorCode,message:'The request could not be completed. Please try again.'
 });
 // Only display backend business messages for recoverable validation conflicts.
 const businessDetail=[400,409,422].includes(status)?safeBusinessDetail(serverError):'';
 return new FriendlyApiError(entry.code,status,businessDetail||entry.message,correlationId);
}
export function networkError():FriendlyApiError{
 return new FriendlyApiError('NETWORK_UNAVAILABLE',0,
  'Cannot reach FreshPrep. Check your connection and try again.');
}
export async function apiRequest<T>(base:string,path:string,
 options:{token?:string;method?:string;payload?:unknown;signal?:AbortSignal}={}):Promise<T>{
 const {token,method='GET',payload,signal}=options;
 let response:Response;
 try{
  response=await fetch(base+path,{method,
   headers:{...(payload!==undefined?{'Content-Type':'application/json'}:{}),
    ...(token?{Authorization:'Bearer '+token}:{})},
   body:payload===undefined?undefined:JSON.stringify(payload),cache:'no-store',signal
  });
 }catch(e){
  if(e instanceof Error&&e.name==='AbortError')throw e;
  throw networkError();
 }
 const data:unknown=await response.json().catch(()=>null);
 if(!response.ok){
  const obj=data&&typeof data==='object'?data as Record<string,unknown>:{};
  const correlationId=response.headers.get('X-Correlation-ID')||
    (typeof obj.correlationId==='string'?obj.correlationId:undefined);
  if(response.status===401&&path==='/auth/login')
   throw new FriendlyApiError('ACCESS_DENIED',401,'Email, password or organisation ID is incorrect.',correlationId||undefined);
  throw messageForStatus(response.status,obj.error||obj.message,correlationId||undefined);
 }
 if(data===null)throw new FriendlyApiError('REQUEST_FAILED',response.status,'The server sent an unreadable response.');
 return data as T;
}
