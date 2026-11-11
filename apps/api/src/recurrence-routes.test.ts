import {describe,it,expect} from 'vitest';
import type {Pool} from 'pg';
import {recurrenceIsDue,generateRecurrences} from './recurrence-routes.js';

const producer='22222222-2222-4222-8222-222222222222';
const schedule='33333333-3333-4333-8333-333333333333';
const org='44444444-4444-4444-8444-444444444444';
const s={
 id:schedule,organization_id:org,kitchen_id:'55555555-5555-4555-8555-555555555555',
 slot_id:'66666666-6666-4666-8666-666666666666',
 frequency:'WEEKLY' as const,weekdays:[1,3,5],
 start_date:'2026-11-01',end_date:null,state:'ACTIVE' as const,
 zone_code:'BENGALURU',producer_organization_id:producer
};
describe('PostgreSQL recurring order generator',()=>{
 it('matches weekdays and respects customer start date',()=>{
  expect(recurrenceIsDue(s,'2026-11-02')).toBe(true); // Monday
  expect(recurrenceIsDue(s,'2026-11-03')).toBe(false); // Tuesday
  expect(recurrenceIsDue(s,'2026-10-30')).toBe(false);
  expect(recurrenceIsDue({...s,frequency:'DAILY',weekdays:[]},'2026-11-03')).toBe(true);
 });
 it('rejects invalid dates and does not attempt database writes',async()=>{
  let queried=false;
  const pool={async query(){queried=true;return {rows:[]}}} as unknown as Pool;
  await expect(generateRecurrences(pool,'2026-02-30',producer)).rejects.toThrow('Invalid ISO date');
  expect(queried).toBe(false);
 });
 it('finds schedules only for the requesting producer',async()=>{
  const calls:{sql:string;args:unknown[]}[]=[];
  const pool={async query(sql:string,args:unknown[]){calls.push({sql,args});return {rows:[]}}} as unknown as Pool;
  expect(await generateRecurrences(pool,'2026-11-02',producer)).toEqual([]);
  expect(calls).toHaveLength(1);
  expect(calls[0].sql).toContain('k.producer_organization_id=$1');
  expect(calls[0].args).toEqual([producer,'2026-11-02']);
 });
 it('records an explicitly skipped delivery without creating an order',async()=>{
  const statements:string[]=[];
  const client={
   async query(sql:string){statements.push(sql);
    if(sql.includes('FROM recurring_schedules rs')&&sql.includes('FOR UPDATE'))
     return {rows:[s],rowCount:1};
    if(sql.includes('FROM recurring_occurrences'))return {rows:[],rowCount:0};
    if(sql.includes('FROM schedule_skips'))return {rows:[{ok:true}],rowCount:1};
    if(sql.startsWith('INSERT INTO event_log'))return {rows:[{id:'event-1'}],rowCount:1};
    return {rows:[],rowCount:1};
   },
   release(){}
  };
  const pool={
   async query(){return {rows:[{id:schedule}],rowCount:1};},
   async connect(){return client;}
  } as unknown as Pool;
  const result=await generateRecurrences(pool,'2026-11-02',producer,new Date('2026-10-31T12:00:00Z'));
  expect(result).toEqual([{scheduleId:schedule,state:'SKIPPED',reason:'Customer skipped this delivery'}]);
  expect(statements.some(sql=>sql.startsWith('INSERT INTO recurring_occurrences'))).toBe(true);
  expect(statements.some(sql=>sql.startsWith('INSERT INTO orders'))).toBe(false);
  expect(statements.at(-1)).toBe('COMMIT');
 });
 it('never creates a duplicate when an occurrence exists',async()=>{
  const statements:string[]=[];
  const client={
   async query(sql:string){statements.push(sql);
    if(sql.includes('FROM recurring_schedules rs')&&sql.includes('FOR UPDATE'))
     return {rows:[s],rowCount:1};
    if(sql.includes('FROM recurring_occurrences'))return {rows:[{order_id:'existing',state:'CREATED'}],rowCount:1};
    return {rows:[],rowCount:1};
   },release(){}
  };
  const pool={async query(){return {rows:[{id:schedule}]};},async connect(){return client;}} as unknown as Pool;
  const result=await generateRecurrences(pool,'2026-11-02',producer,new Date('2026-10-31T12:00:00Z'));
  expect(result).toEqual([{scheduleId:schedule,state:'EXISTS',orderId:'existing'}]);
  expect(statements.some(sql=>sql.startsWith('INSERT INTO orders'))).toBe(false);
 });
});
