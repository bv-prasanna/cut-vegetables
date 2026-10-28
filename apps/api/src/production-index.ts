import {Pool} from 'pg';
import {serve} from '@hono/node-server';
import {createProductionApp} from './production-app.js';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is mandatory');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:10});
const port=Number(process.env.PORT||3001);
serve({fetch:createProductionApp(pool).fetch,port,hostname:process.env.HOST||'127.0.0.1'});
console.log(`PostgreSQL-backed API on port ${port}`);
