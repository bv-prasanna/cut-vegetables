import {Hono,type Context} from 'hono';
import {z} from 'zod';
import type {Pool} from 'pg';
import {passwordHash} from './security.js';
import {permissions,canAny,isRole,type Role} from './authorization.js';
import {inTransaction,BusinessFailure,respondError,recordEvent,systemEvent} from './ops-db.js';

type Env={Variables:{userId:string;organizationId:string;roles:Role[]}};
const roles=z.array(z.string().refine(isRole,{message:'Unknown role'})).min(1).max(4)
 .refine(items=>new Set(items).size===items.length,{message:'Duplicate role'});
const password=z.string().min(12).max(1024);
const staffSchema=z.object({
 email:z.string().email().max(254),password,roles
});
const customerSchema=z.object({
 organizationName:z.string().trim().min(2).max(160),
 contactEmail:z.string().email().max(254),contactPassword:password,
 kitchenName:z.string().trim().min(2).max(160),
 address:z.string().trim().min(10).max(500),
 zoneCode:z.string().trim().min(2).max(100)
});
function authorizedAdmin(c:Context<Env>):void {
 if(!canAny(c.get('roles'),'users:manage'))throw new BusinessFailure(403,'Only administrators may manage accounts');
}
export function createAdminRoutes(pool:Pool){
 const app=new Hono<Env>();
 app.onError((err,c)=>{
  const e=respondError(err);
  if(e.status===500)console.error('Admin API failure',err);
  return c.json({error:e.message},e.status);
 });
 app.get('/admin/roles',c=>{
  authorizedAdmin(c);
  return c.json(Object.entries(permissions).map(([role,grants])=>({role,permissions:grants})));
 });
 app.get('/admin/staff',async c=>{
  authorizedAdmin(c);
  const q=await pool.query(`SELECT u.id,u.email,u.active,ARRAY_AGG(m.role ORDER BY m.role) AS roles
   FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.organization_id=$1
   GROUP BY u.id,u.email,u.active ORDER BY u.email LIMIT 250`,[c.get('organizationId')]);
  return c.json(q.rows);
 });
 app.post('/admin/staff',async c=>{
  authorizedAdmin(c);
  const input=staffSchema.safeParse(await c.req.json().catch(()=>null));
  if(!input.success)return c.json({error:'Invalid staff account',issues:input.error.flatten()},400);
  const isSuper=c.get('roles').includes('SUPERADMIN');
  const allowed=isSuper?new Set(Object.keys(permissions)):new Set(
   ['SALES','PROCUREMENT','STORE','OPERATOR','PRODUCTION_SUPERVISOR','QC','PACKER','DISPATCH','DRIVER','FINANCE','MARKETING','AUDITOR']
  );
  if(input.data.roles.some(role=>!allowed.has(role)))return c.json({error:'Role grant requires Super Admin'},403);
  const created=await inTransaction(pool,async tx=>{
   const result=await tx.query<{id:string}>(`INSERT INTO users(email,password_hash)
    VALUES(lower($1),$2) ON CONFLICT(email) DO NOTHING RETURNING id`,[
     input.data.email.trim(),passwordHash(input.data.password)
    ]);
   if(!result.rowCount)throw new BusinessFailure(409,'This email already has an account');
   const userId=result.rows[0].id;
   for(const role of input.data.roles){
    await tx.query('INSERT INTO memberships(organization_id,user_id,role) VALUES($1,$2,$3)',[
      c.get('organizationId'),userId,role
    ]);
   }
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),
    systemEvent('STAFF_ACCOUNT_CREATED','USER',userId),'STAFF_ACCOUNT_CREATED','USER',userId);
   return {id:userId,email:input.data.email.trim().toLowerCase(),roles:input.data.roles};
  });
  return c.json(created,201);
 });
 app.get('/admin/customers',async c=>{
  authorizedAdmin(c);
  const result=await pool.query(`SELECT k.id AS kitchen_id,k.name AS kitchen_name,k.address,k.zone_code,
    org.id AS organization_id,org.name AS organization_name,k.active
    FROM kitchens k JOIN organizations org ON org.id=k.organization_id
    WHERE k.producer_organization_id=$1 ORDER BY org.name,k.name LIMIT 250`,[c.get('organizationId')]);
  return c.json(result.rows);
 });
 app.post('/admin/customers',async c=>{
  authorizedAdmin(c);
  const parsed=customerSchema.safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return c.json({error:'Invalid customer registration',issues:parsed.error.flatten()},400);
  const data=parsed.data;
  const created=await inTransaction(pool,async tx=>{
   const kind=await tx.query<{kind:string}>('SELECT kind FROM organizations WHERE id=$1',[c.get('organizationId')]);
   if(kind.rows[0]?.kind!=='PRODUCER')throw new BusinessFailure(403,'Staff organization must be a producer');
   const org=await tx.query<{id:string}>(`INSERT INTO organizations(name,kind) VALUES($1,'CUSTOMER') RETURNING id`,[data.organizationName]);
   const user=await tx.query<{id:string}>(`INSERT INTO users(email,password_hash)
    VALUES(lower($1),$2) ON CONFLICT(email) DO NOTHING RETURNING id`,[
     data.contactEmail.trim(),passwordHash(data.contactPassword)
    ]);
   if(!user.rowCount)throw new BusinessFailure(409,'Customer email is already registered');
   await tx.query(`INSERT INTO memberships(organization_id,user_id,role) VALUES($1,$2,'CUSTOMER_ADMIN')`,[
    org.rows[0].id,user.rows[0].id
   ]);
   const kitchen=await tx.query<{id:string}>(`INSERT INTO kitchens(organization_id,producer_organization_id,name,address,zone_code)
    VALUES($1,$2,$3,$4,$5) RETURNING id`,[
    org.rows[0].id,c.get('organizationId'),data.kitchenName,data.address,data.zoneCode
   ]);
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),
    systemEvent('CUSTOMER_KITCHEN_CREATED','KITCHEN',kitchen.rows[0].id),
    'CUSTOMER_KITCHEN_CREATED','KITCHEN',kitchen.rows[0].id);
   return {organizationId:org.rows[0].id,kitchenId:kitchen.rows[0].id,contactEmail:data.contactEmail.toLowerCase()};
  });
  return c.json(created,201);
 });
 app.get('/admin/overview',async c=>{
  authorizedAdmin(c);
  const org=c.get('organizationId');
  const [staff,customers,orders]=await Promise.all([
   pool.query<{count:number}>('SELECT count(DISTINCT user_id)::int AS count FROM memberships WHERE organization_id=$1',[org]),
   pool.query<{count:number}>('SELECT count(*)::int AS count FROM kitchens WHERE producer_organization_id=$1 AND active=true',[org]),
   pool.query<{state:string;count:number}>(`SELECT state,count(*)::int AS count FROM orders WHERE producer_organization_id=$1 GROUP BY state`,[org])
  ]);
  return c.json({staff:staff.rows[0]?.count??0,activeKitchens:customers.rows[0]?.count??0,ordersByState:orders.rows});
 });
 app.get('/delivery-slots',async c=>{
  if(!canAny(c.get('roles'),'catalog:read')&&!canAny(c.get('roles'),'orders:read'))
   return c.json({error:'Forbidden'},403);
  const q=await pool.query(`SELECT id,label,zone_code,start_minute,end_minute,cutoff_day_offset,cutoff_minute,capacity_orders
   FROM delivery_slots WHERE active=true ORDER BY start_minute LIMIT 100`);
  return c.json(q.rows);
 });
 app.get('/kitchens',async c=>{
  if(!canAny(c.get('roles'),'orders:write')&&!canAny(c.get('roles'),'orders:read'))
   return c.json({error:'Forbidden'},403);
  const q=await pool.query('SELECT id,name,address,zone_code FROM kitchens WHERE organization_id=$1 AND active=true ORDER BY name',
    [c.get('organizationId')]);
  return c.json(q.rows);
 });
 return app;
}
