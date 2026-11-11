import type {Pool} from 'pg';
import {createHash} from 'node:crypto';

export function loginScope(email:string,organizationId:string){
 return createHash('sha256').update(email.trim().toLowerCase()+'|'+organizationId).digest('hex');
}
export async function loginLocked(pool:Pool,scope:string,now:Date):Promise<boolean>{
 const row=await pool.query<{locked:boolean}>(
  'SELECT COALESCE(locked_until>$2,false) AS locked FROM auth_login_attempts WHERE scope_hash=$1',
  [scope,now]
 );
 return Boolean(row.rows[0]?.locked);
}
export async function loginFailed(pool:Pool,scope:string,now:Date):Promise<void>{
 await pool.query(`INSERT INTO auth_login_attempts(scope_hash,failures,window_started,updated_at,locked_until)
  VALUES($1,1,$2,$2,NULL)
  ON CONFLICT(scope_hash) DO UPDATE SET
   failures=CASE WHEN auth_login_attempts.window_started < $2::timestamptz-interval '15 minutes'
     THEN 1 ELSE auth_login_attempts.failures+1 END,
   window_started=CASE WHEN auth_login_attempts.window_started < $2::timestamptz-interval '15 minutes'
     THEN $2 ELSE auth_login_attempts.window_started END,
   updated_at=$2,
   locked_until=CASE WHEN
     (CASE WHEN auth_login_attempts.window_started < $2::timestamptz-interval '15 minutes'
      THEN 1 ELSE auth_login_attempts.failures+1 END)>=8
     THEN $2::timestamptz+interval '15 minutes' ELSE NULL END`,[scope,now]);
}
export async function loginSucceeded(pool:Pool,scope:string):Promise<void>{
 await pool.query('DELETE FROM auth_login_attempts WHERE scope_hash=$1',[scope]);
}
