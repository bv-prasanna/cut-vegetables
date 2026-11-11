import {Pool} from 'pg';
import {serve} from '@hono/node-server';
import {createProductionApp} from './production-app.js';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is mandatory');
const pool=new Pool({
 connectionString:process.env.DATABASE_URL,max:5,
 connectionTimeoutMillis:10_000,idleTimeoutMillis:10_000
});
const port=Number(process.env.PORT||3001);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT');
const app=createProductionApp(pool);
serve({fetch:app.fetch,port,hostname:process.env.HOST||'127.0.0.1'});
console.log(`PostgreSQL-backed API on port ${port}`);
