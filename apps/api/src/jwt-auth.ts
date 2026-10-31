import {randomUUID} from 'node:crypto';
import {SignJWT,jwtVerify,errors as joseErrors} from 'jose';
import {digestToken} from './security.js';

export const JWT_ISSUER='freshprep-api';
export const JWT_AUDIENCE='freshprep-client';
export const ACCESS_TOKEN_SECONDS=15*60;
const MIN_SECRET_BYTES=32;

export function jwtKey(secret:string|undefined):Uint8Array {
 if(!secret||Buffer.byteLength(secret,'utf8')<MIN_SECRET_BYTES)
  throw new Error('JWT_SECRET must be configured with at least 32 random bytes');
 return new TextEncoder().encode(secret);
}
export type JwtSession={userId:string;organizationId:string;sessionHash:string;sessionId:string};
export async function issueJwt(
 secret:string,userId:string,organizationId:string,
 now:Date=new Date()
):Promise<{accessToken:string;sessionHash:string;sessionId:string;expiresInSeconds:number}>{
 const key=jwtKey(secret);
 const sessionId=randomUUID();
 const issuedAt=Math.floor(now.getTime()/1000);
 const accessToken=await new SignJWT({org:organizationId})
  .setProtectedHeader({alg:'HS256',typ:'JWT'})
  .setIssuer(JWT_ISSUER).setAudience(JWT_AUDIENCE)
  .setSubject(userId).setJti(sessionId)
  .setIssuedAt(issuedAt).setNotBefore(issuedAt)
  .setExpirationTime(issuedAt+ACCESS_TOKEN_SECONDS)
  .sign(key);
 return {accessToken,sessionHash:digestToken(sessionId),sessionId,expiresInSeconds:ACCESS_TOKEN_SECONDS};
}
export async function verifyJwt(
 token:string,secret:string,now:Date=new Date()
):Promise<JwtSession|null>{
 try{
  const {payload,protectedHeader}=await jwtVerify(token,jwtKey(secret),{
   algorithms:['HS256'],issuer:JWT_ISSUER,audience:JWT_AUDIENCE,
   clockTolerance:0,currentDate:now,requiredClaims:['sub','jti','iss','aud','exp','iat','nbf']
  });
  if(protectedHeader.typ!=='JWT'||typeof payload.sub!=='string'||typeof payload.jti!=='string'
   ||typeof payload.org!=='string'||!payload.sub||!payload.org)return null;
  return {userId:payload.sub,organizationId:payload.org,sessionId:payload.jti,sessionHash:digestToken(payload.jti)};
 }catch(error){
  if(error instanceof joseErrors.JOSEError)return null;
  throw error;
 }
}
export function readBearer(header:string|undefined):string|null {
 if(!header||!header.startsWith('Bearer '))return null;
 const token=header.slice(7);
 return token.length>=50&&token.length<=4096&&/^[A-Za-z0-9_.-]+$/.test(token)?token:null;
}
