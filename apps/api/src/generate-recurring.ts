import {Pool} from 'pg';
import {z} from 'zod';
import {generateRecurrences} from './recurrence-routes.js';

const args=z.object({
 DATABASE_URL:z.string().min(1),
 PRODUCER_ORG_ID:z.string().uuid(),
 DELIVERY_DATE:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
}).parse(process.env);
const pool=new Pool({connectionString:args.DATABASE_URL,max:3});
try{
 const result=await generateRecurrences(pool,args.DELIVERY_DATE,args.PRODUCER_ORG_ID,new Date());
 const summary=Object.fromEntries(['CREATED','BLOCKED','SKIPPED','EXISTS','NOT_DUE'].map(key=>[
  key,result.filter(row=>row.state===key).length
 ]));
 console.log(JSON.stringify({deliveryDate:args.DELIVERY_DATE,summary},null,2));
 if(summary.BLOCKED>0){
  console.error('Attention: recurring orders blocked. Review reasons in recurring_occurrences.');
  process.exitCode=2;
 }
}finally{await pool.end();}
