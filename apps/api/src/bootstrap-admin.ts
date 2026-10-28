import {Pool} from 'pg';
import {passwordHash} from './security.js';
/** Explicit local bootstrap. Never expose as HTTP endpoint. */
export async function bootstrap(pool:Pool,organizationName:string,email:string,password:string){
 if(!organizationName.trim()||!email.includes('@'))throw new Error('Name and email required');
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const existing=await client.query('SELECT 1 FROM memberships WHERE role=$1 LIMIT 1',['SUPERADMIN']);
  if(existing.rowCount)throw new Error('Superadmin already exists; bootstrap disabled');
  const org=await client.query('INSERT INTO organizations(name) VALUES($1) RETURNING id',[organizationName.trim()]);
  const user=await client.query('INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id',[email.toLowerCase().trim(),passwordHash(password)]);
  await client.query('INSERT INTO memberships(organization_id,user_id,role) VALUES($1,$2,$3)',[org.rows[0].id,user.rows[0].id,'SUPERADMIN']);
  await client.query('COMMIT');
  return {organizationId:org.rows[0].id,userId:user.rows[0].id};
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
if(process.argv[1]?.endsWith('bootstrap-admin.ts')){
 const {DATABASE_URL,BOOTSTRAP_ORG,BOOTSTRAP_EMAIL,BOOTSTRAP_PASSWORD}=process.env;
 if(!DATABASE_URL||!BOOTSTRAP_ORG||!BOOTSTRAP_EMAIL||!BOOTSTRAP_PASSWORD)throw new Error('DATABASE_URL, BOOTSTRAP_ORG, BOOTSTRAP_EMAIL, BOOTSTRAP_PASSWORD required');
 const pool=new Pool({connectionString:DATABASE_URL});
 try{console.log(await bootstrap(pool,BOOTSTRAP_ORG,BOOTSTRAP_EMAIL,BOOTSTRAP_PASSWORD));}finally{await pool.end();}
}
