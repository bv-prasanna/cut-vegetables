import {Pool} from 'pg';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

export async function migrate(pool:Pool,directory:string){
 const files=(await readdir(directory)).filter(f=>/^\d{4}_[\w-]+\.sql$/.test(f)).sort();
 const client=await pool.connect();
 try{
  await client.query('SELECT pg_advisory_lock(7824135)');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  for(const name of files){
   const sql=await readFile(resolve(directory,name),'utf8');
   const checksum=createHash('sha256').update(sql).digest('hex');
   const prior=await client.query('SELECT sha256 FROM schema_migrations WHERE name=$1',[name]);
   if(prior.rowCount){
    if(prior.rows[0].sha256!==checksum)throw new Error('Migration modified after application: '+name);
    continue;
   }
   // Each migration manages its own BEGIN/COMMIT.
   await client.query(sql);
   await client.query('INSERT INTO schema_migrations(name,sha256) VALUES($1,$2)',[name,checksum]);
   console.log('Applied',name);
  }
 }finally{await client.query('SELECT pg_advisory_unlock(7824135)').catch(()=>{});client.release();}
}
if(process.argv[1]?.endsWith('db-migrate.ts')){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');
 const pool=new Pool({connectionString:process.env.DATABASE_URL});
 try{await migrate(pool,resolve(process.cwd(),'../../db/migrations'));}finally{await pool.end();}
}
