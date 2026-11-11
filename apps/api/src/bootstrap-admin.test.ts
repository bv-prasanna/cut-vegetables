import {describe,it,expect} from 'vitest';
import type {Pool} from 'pg';
import {bootstrap} from './bootstrap-admin.js';
describe('one-time superadmin bootstrap CLI',()=>{
 it('refuses weak passwords before connecting to Postgres',async()=>{
  const pool={connect:()=>{throw Error('must not connect')}} as unknown as Pool;
  await expect(bootstrap(pool,'FreshPrep','owner@example.com','weak')).rejects.toThrow();
 });
 it('uses advisory lock and creates a single PRODUCER organization',async()=>{
  const queries:{sql:string;values:unknown[]}[]=[];
  const client={
   async query(sql:string,values:unknown[]=[]){
    queries.push({sql,values});
    if(sql.includes('SELECT 1 FROM memberships'))return {rowCount:0,rows:[]};
    if(sql.includes('INSERT INTO organizations'))return {rowCount:1,rows:[{id:'org-id'}]};
    if(sql.includes('INSERT INTO users'))return {rowCount:1,rows:[{id:'user-id'}]};
    return {rowCount:1,rows:[]};
   },release(){}
  };
  const pool={async connect(){return client}} as unknown as Pool;
  const result=await bootstrap(pool,'FreshPrep','owner@example.com','long-enough-test-password');
  expect(result).toEqual({organizationId:'org-id',userId:'user-id'});
  expect(queries.some(q=>q.sql.includes('pg_advisory_xact_lock'))).toBe(true);
  const create=queries.find(q=>q.sql.includes('INSERT INTO organizations'));
  expect(create?.values).toEqual(['FreshPrep','PRODUCER']);
  expect(queries.at(-1)?.sql).toBe('COMMIT');
 });
 it('prevents a second superadmin and rolls back',async()=>{
  let rolledBack=false;
  const pool={async connect(){return {
   async query(sql:string){if(sql.includes('SELECT 1 FROM memberships'))return {rowCount:1,rows:[{ok:true}]};if(sql==='ROLLBACK')rolledBack=true;return {rowCount:0,rows:[]};},
   release(){}
  }}} as unknown as Pool;
  await expect(bootstrap(pool,'FreshPrep','owner@example.com','long-enough-test-password')).rejects.toThrow('already exists');
  expect(rolledBack).toBe(true);
 });
});
