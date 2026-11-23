import {Hono} from 'hono';
import {z} from 'zod';
import type {Pool} from 'pg';
import {canAny,type Role} from './authorization.js';
import {BusinessFailure,inTransaction,recordEvent,systemEvent,respondError} from './ops-db.js';
type Env={Variables:{userId:string;organizationId:string;roles:Role[]}};
const programInput=z.object({pointsPer100Rupees:z.number().int().positive().max(10000),paisePerPoint:z.number().int().positive().max(100000),minimumRedeemPoints:z.number().int().positive().default(1),maximumDiscountBps:z.number().int().min(1).max(10000)});
function permission(roles:Role[],name:string){if(!canAny(roles,name))throw new BusinessFailure(403,'Permission denied');}
function parse<T extends z.ZodTypeAny>(v:unknown,s:T):z.infer<T>{const r=s.safeParse(v);if(!r.success)throw new BusinessFailure(400,'Invalid request: '+r.error.issues.map(i=>i.path.join('.')).join(', '));return r.data;}
export function createLoyaltyRoutes(pool:Pool){
 const app=new Hono<Env>();
 app.onError((err,c)=>{const e=respondError(err);if(e.status===500)console.error('Loyalty API failed',err);return c.json({error:e.message},e.status);});
 app.get('/admin/loyalty/program',async c=>{
  permission(c.get('roles'),'finance:read');
  const q=await pool.query('SELECT id,points_per_100_rupees,paise_per_point,minimum_redeem_points,maximum_discount_bps,status,approved_by,approved_at,updated_at FROM loyalty_programs WHERE producer_organization_id=$1',[c.get('organizationId')]);
  return c.json(q.rows[0]??null);
 });
 app.put('/admin/loyalty/program',async c=>{
  permission(c.get('roles'),'finance:write');const d=parse(await c.req.json().catch(()=>null),programInput);
  const row=await inTransaction(pool,async tx=>{
   const q=await tx.query('SELECT id,status FROM loyalty_programs WHERE producer_organization_id=$1 FOR UPDATE',[c.get('organizationId')]);
   if(q.rowCount){
    if(q.rows[0].status==='ACTIVE')throw new BusinessFailure(409,'Pause the active loyalty program before changing its earning or redemption rules');
    const updated=await tx.query("UPDATE loyalty_programs SET points_per_100_rupees=$2,paise_per_point=$3,minimum_redeem_points=$4,maximum_discount_bps=$5,status='DRAFT',approved_by=NULL,approved_at=NULL,updated_at=now() WHERE id=$1 RETURNING id,status",[q.rows[0].id,d.pointsPer100Rupees,d.paisePerPoint,d.minimumRedeemPoints,d.maximumDiscountBps]);
    await recordEvent(tx,c.get('organizationId'),c.get('userId'),systemEvent('LOYALTY_PROGRAM_UPDATED','LOYALTY_PROGRAM',updated.rows[0].id),'LOYALTY_PROGRAM_UPDATED','LOYALTY_PROGRAM',updated.rows[0].id);return updated.rows[0];
   }
   const created=await tx.query("INSERT INTO loyalty_programs(producer_organization_id,points_per_100_rupees,paise_per_point,minimum_redeem_points,maximum_discount_bps,status) VALUES($1,$2,$3,$4,$5,'DRAFT') RETURNING id,status",[c.get('organizationId'),d.pointsPer100Rupees,d.paisePerPoint,d.minimumRedeemPoints,d.maximumDiscountBps]);
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),systemEvent('LOYALTY_PROGRAM_CREATED','LOYALTY_PROGRAM',created.rows[0].id),'LOYALTY_PROGRAM_CREATED','LOYALTY_PROGRAM',created.rows[0].id);return created.rows[0];
  });
  return c.json(row);
 });
 app.patch('/admin/loyalty/program/approve',async c=>{
  permission(c.get('roles'),'loyalty:review');
  const row=await inTransaction(pool,async tx=>{
   const p=await tx.query('SELECT id,status FROM loyalty_programs WHERE producer_organization_id=$1 FOR UPDATE',[c.get('organizationId')]);
   if(!p.rowCount)throw new BusinessFailure(404,'Loyalty program has not been configured');
   if(p.rows[0].status!=='DRAFT')throw new BusinessFailure(409,'Only a draft loyalty program can be approved');
   await tx.query("UPDATE loyalty_programs SET status='ACTIVE',approved_by=$2,approved_at=now(),updated_at=now() WHERE id=$1",[p.rows[0].id,c.get('userId')]);
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),systemEvent('LOYALTY_PROGRAM_APPROVED','LOYALTY_PROGRAM',p.rows[0].id),'LOYALTY_PROGRAM_APPROVED','LOYALTY_PROGRAM',p.rows[0].id);
   return {id:p.rows[0].id,status:'ACTIVE'};
  });
  return c.json(row);
 });
 app.get('/loyalty/me',async c=>{
  permission(c.get('roles'),'invoices:read');
  const kitchenId=z.string().uuid().safeParse(c.req.query('kitchenId'));
  if(!kitchenId.success)throw new BusinessFailure(400,'Select a valid kitchen');
  const kitchen=await pool.query('SELECT producer_organization_id FROM kitchens WHERE id=$1 AND organization_id=$2 AND active=true',[kitchenId.data,c.get('organizationId')]);
  if(!kitchen.rowCount||!kitchen.rows[0].producer_organization_id)throw new BusinessFailure(422,'Kitchen is not assigned to an active supplier');
  const producer=kitchen.rows[0].producer_organization_id;
  const program=await pool.query("SELECT paise_per_point,minimum_redeem_points,maximum_discount_bps FROM loyalty_programs WHERE producer_organization_id=$1 AND status='ACTIVE'",[producer]);
  const account=await pool.query('SELECT id,balance_points,updated_at FROM loyalty_accounts WHERE producer_organization_id=$1 AND buyer_organization_id=$2',[producer,c.get('organizationId')]);
  const programFields={programActive:program.rowCount>0,paisePerPoint:program.rowCount?Number(program.rows[0].paise_per_point):null,minimumRedeemPoints:program.rowCount?Number(program.rows[0].minimum_redeem_points):null,maximumDiscountBps:program.rowCount?Number(program.rows[0].maximum_discount_bps):null};
  if(!account.rowCount)return c.json({balancePoints:0,entries:[],...programFields});
  const entries=await pool.query('SELECT entry_type,points_delta,note,created_at FROM loyalty_ledger WHERE account_id=$1 ORDER BY created_at DESC LIMIT 100',[account.rows[0].id]);
  return c.json({balancePoints:Number(account.rows[0].balance_points),updatedAt:account.rows[0].updated_at,entries:entries.rows.map(row=>({...row,points_delta:Number(row.points_delta)})),...programFields});
 });
 app.get('/admin/loyalty/accounts',async c=>{
  permission(c.get('roles'),'loyalty:review');
  const q=await pool.query('SELECT a.id,a.buyer_organization_id,o.name AS buyer_name,a.balance_points,a.updated_at FROM loyalty_accounts a JOIN organizations o ON o.id=a.buyer_organization_id WHERE a.producer_organization_id=$1 ORDER BY o.name LIMIT 1000',[c.get('organizationId')]);
  return c.json(q.rows);
 });
 app.post('/admin/loyalty/adjustments',async c=>{
  permission(c.get('roles'),'loyalty:review');
  const d=parse(await c.req.json().catch(()=>null),z.object({buyerOrganizationId:z.string().uuid(),pointsDelta:z.number().int().refine(v=>v!==0).max(1000000).min(-1000000),idempotencyKey:z.string().min(8).max(120),note:z.string().trim().min(5).max(500)}));
  const row=await inTransaction(pool,async tx=>{
   const program=await tx.query("SELECT id FROM loyalty_programs WHERE producer_organization_id=$1 AND status='ACTIVE'",[c.get('organizationId')]);
   if(!program.rowCount)throw new BusinessFailure(409,'An approved active loyalty program is required');
   const buyer=await tx.query("SELECT id FROM organizations WHERE id=$1 AND kind='CUSTOMER'",[d.buyerOrganizationId]);
   if(!buyer.rowCount)throw new BusinessFailure(422,'Select a valid customer organisation');
   await tx.query('INSERT INTO loyalty_accounts(producer_organization_id,buyer_organization_id) VALUES($1,$2) ON CONFLICT(producer_organization_id,buyer_organization_id) DO NOTHING',[c.get('organizationId'),d.buyerOrganizationId]);
   const account=await tx.query('SELECT id,balance_points FROM loyalty_accounts WHERE producer_organization_id=$1 AND buyer_organization_id=$2 FOR UPDATE',[c.get('organizationId'),d.buyerOrganizationId]);
   const prior=await tx.query('SELECT id,points_delta FROM loyalty_ledger WHERE account_id=$1 AND idempotency_key=$2',[account.rows[0].id,d.idempotencyKey]);
   if(prior.rowCount)return {id:prior.rows[0].id,balancePoints:Number(account.rows[0].balance_points),replayed:true};
   const next=Number(account.rows[0].balance_points)+d.pointsDelta;
   if(next<0)throw new BusinessFailure(409,'Adjustment would make the customer points balance negative');
   const entry=await tx.query("INSERT INTO loyalty_ledger(account_id,entry_type,points_delta,idempotency_key,note,created_by) VALUES($1,'ADJUSTMENT',$2,$3,$4,$5) RETURNING id",[account.rows[0].id,d.pointsDelta,d.idempotencyKey,d.note,c.get('userId')]);
   await tx.query('UPDATE loyalty_accounts SET balance_points=$2,updated_at=now() WHERE id=$1',[account.rows[0].id,next]);
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),systemEvent('LOYALTY_POINTS_ADJUSTED','LOYALTY_ACCOUNT',account.rows[0].id),'LOYALTY_POINTS_ADJUSTED','LOYALTY_ACCOUNT',account.rows[0].id);
   return {id:entry.rows[0].id,balancePoints:next,replayed:false};
  });
  return c.json(row,201);
 });
 return app;
}
