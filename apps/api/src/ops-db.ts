import type {Pool,PoolClient} from 'pg';
import type {GeoEventInput} from './geo-events.js';

export class BusinessFailure extends Error {
 constructor(public status:400|403|404|409|422, message:string){super(message);}
}
export async function inTransaction<T>(pool:Pool,work:(client:PoolClient)=>Promise<T>):Promise<T>{
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const result=await work(client);
  await client.query('COMMIT');
  return result;
 }catch(error){
  await client.query('ROLLBACK').catch(()=>{});
  throw error;
 }finally{client.release();}
}
export function requireRow<T>(rows:T[],message='Resource not found'):T{
 if(!rows.length)throw new BusinessFailure(404,message);
 return rows[0];
}
export function systemEvent(eventType:string,subjectType:string,subjectId:string):GeoEventInput{
 return {eventType,subjectType,subjectId,location:{source:'SYSTEM',unavailableReason:'Backend-generated business event',consentStatus:'NOT_APPLICABLE'},details:{}};
}
export async function recordEvent(
 client:PoolClient, organizationId:string,actorId:string|null,
 event:GeoEventInput,eventType:string,subjectType:string,subjectId:string
):Promise<string>{
 if(event.eventType!==eventType||event.subjectType!==subjectType)
  throw new BusinessFailure(422,'Incorrect business audit event type');
 const location=event.location;
 const withCoords='latitude' in location;
 const row=await client.query<{id:string}>(`INSERT INTO event_log
  (organization_id,actor_id,event_type,subject_type,subject_id,source,latitude,longitude,accuracy_meters,captured_at,consent_status,unavailable_reason,request_id,details)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb) RETURNING id`,[
   organizationId,actorId,eventType,subjectType,subjectId,location.source,
   withCoords?location.latitude:null,withCoords?location.longitude:null,
   withCoords?(location.accuracyMeters??null):null,withCoords?location.capturedAt:null,
   location.consentStatus,withCoords?null:location.unavailableReason,
   event.requestId??null,JSON.stringify(event.details)
  ]);
 return row.rows[0].id;
}
export function respondError(error:unknown):{status:400|403|404|409|422|500;message:string}{
 if(error instanceof BusinessFailure)return {status:error.status,message:error.message};
 // Never include DB/PG details or user information in an HTTP response.
 return {status:500,message:'Internal server error'};
}
