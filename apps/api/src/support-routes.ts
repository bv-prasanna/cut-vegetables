import {Hono} from 'hono';
import type {Pool} from 'pg';
import {z} from 'zod';
import {canAny,type Role} from './authorization.js';
import {BusinessFailure,inTransaction,recordEvent,systemEvent,respondError} from './ops-db.js';
import {geoEventSchema} from './geo-events.js';
import {notifyOrganization} from './notification-service.js';

type Env={Variables:{userId:string;organizationId:string;roles:Role[]}};
const uuid=z.string().uuid();
const categories=['QUALITY','SHORTAGE','WRONG_ITEM','LATE_DELIVERY','PACKAGING','BILLING','RETURN_REQUEST','OTHER'] as const;
const createSchema=z.object({orderId:uuid,category:z.enum(categories),description:z.string().trim().min(10).max(4000),requestedResolution:z.string().trim().max(1000).optional(),event:geoEventSchema});
const updateSchema=z.object({state:z.enum(['IN_REVIEW','WAITING_CUSTOMER','RESOLVED','REJECTED','CLOSED']),resolutionNote:z.string().trim().max(2000).optional(),resolutionType:z.enum(['RESUPPLY','REPLACEMENT','CREDIT_NOTE','REFUND','NO_ACTION']).optional()});
export function createSupportRoutes(pool:Pool){
 const app=new Hono<Env>();
 app.onError((err,c)=>{const e=respondError(err);if(e.status===500)console.error('Support API failed',err);return c.json({error:e.message},e.status);});
 app.get('/support/cases',async c=>{
  const roles=c.get('roles');
  if(!canAny(roles,'support:read')&&!canAny(roles,'support:write'))throw new BusinessFailure(403,'You do not have permission to view support cases');
  const org=c.get('organizationId');
  const customer=roles.some(r=>r==='CUSTOMER_ADMIN'||r==='CUSTOMER_BUYER'||r==='CUSTOMER_VIEWER');
  const q=customer
   ? await pool.query('SELECT id,case_number,order_id,category,description,requested_resolution,state,resolution_note,created_at,updated_at FROM support_cases WHERE buyer_organization_id=$1 ORDER BY created_at DESC LIMIT 100',[org])
   : await pool.query('SELECT id,case_number,order_id,buyer_organization_id,kitchen_id,category,description,requested_resolution,state,resolution_note,created_at,updated_at FROM support_cases WHERE producer_organization_id=$1 ORDER BY created_at DESC LIMIT 200',[org]);
  return c.json(q.rows);
 });
 app.post('/support/cases',async c=>{
  if(!canAny(c.get('roles'),'support:write'))throw new BusinessFailure(403,'Your role cannot open support cases');
  const body=createSchema.safeParse(await c.req.json().catch(()=>null));
  if(!body.success)throw new BusinessFailure(400,'Enter a valid order, issue category and description (at least 10 characters)');
  const {orderId,category,description,requestedResolution,event}=body.data;
  const org=c.get('organizationId');
  const created=await inTransaction(pool,async tx=>{
   const order=await tx.query<{id:string;kitchen_id:string;producer_organization_id:string|null}>(
    'SELECT o.id,o.kitchen_id,k.producer_organization_id FROM orders o JOIN kitchens k ON k.id=o.kitchen_id AND k.organization_id=o.organization_id WHERE o.id=$1 AND o.organization_id=$2 FOR UPDATE OF o',[orderId,org]);
   if(!order.rowCount)throw new BusinessFailure(404,'Order not found in your account');
   const producer=order.rows[0].producer_organization_id;
   const duplicate=await tx.query("SELECT 1 FROM support_cases WHERE order_id=$1 AND category=$2 AND state IN ('OPEN','IN_REVIEW','WAITING_CUSTOMER')",[orderId,category]);
   if(duplicate.rowCount)throw new BusinessFailure(409,'An active case already exists for this order and issue category. Add details to the existing case or contact support.');
   if(!producer)throw new BusinessFailure(409,'This kitchen is not assigned to a supplier. Contact support for assistance.');
   const q=await tx.query('INSERT INTO support_cases(buyer_organization_id,producer_organization_id,order_id,kitchen_id,category,description,requested_resolution,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,case_number,order_id,category,state,created_at',[org,producer,orderId,order.rows[0].kitchen_id,category,description,requestedResolution??null,c.get('userId')]);
   const row=q.rows[0] as {id:string};
   await recordEvent(tx,org,c.get('userId'),event,'SUPPORT_CASE_CREATED','SUPPORT_CASE',row.id);
   await notifyOrganization(tx,producer,['SUPERADMIN','ADMIN','SALES'],'SUPPORT','New customer support case','A customer has reported an order issue requiring review.','SUPPORT_CASE',row.id,'SUPPORT_CASE_CREATED:'+row.id,{caseNumber:q.rows[0].case_number,category});
   await notifyOrganization(tx,org,['CUSTOMER_ADMIN','CUSTOMER_BUYER'],'SUPPORT','Support request received','Your support request has been recorded. You can track its progress here.','SUPPORT_CASE',row.id,'SUPPORT_CASE_RECEIVED:'+row.id,{caseNumber:q.rows[0].case_number});
   return q.rows[0];
  });
  return c.json(created,201);
 });
 app.patch('/support/cases/:id',async c=>{
  if(!canAny(c.get('roles'),'support:resolve'))throw new BusinessFailure(403,'Only authorised support staff can update case decisions');
  const id=uuid.safeParse(c.req.param('id'));
  if(!id.success)throw new BusinessFailure(400,'Invalid support case ID');
  const body=updateSchema.safeParse(await c.req.json().catch(()=>null));
  if(!body.success)throw new BusinessFailure(400,'Invalid support case update');
  const org=c.get('organizationId'),{state,resolutionNote,resolutionType}=body.data;
  const result=await inTransaction(pool,async tx=>{
   const current=await tx.query<{id:string;state:string;buyer_organization_id:string}>('SELECT id,state,buyer_organization_id FROM support_cases WHERE id=$1 AND producer_organization_id=$2 FOR UPDATE',[id.data,org]);
   if(!current.rowCount)throw new BusinessFailure(404,'Support case not found');
   if(['RESOLVED','REJECTED','CLOSED'].includes(current.rows[0].state))throw new BusinessFailure(409,'This case is already closed. Reopen it through an authorised supervisor workflow.');
   if(['RESOLVED','REJECTED'].includes(state)&&(!resolutionNote||resolutionNote.length<5))throw new BusinessFailure(422,'A clear resolution note of at least 5 characters is required');
   const terminal=['RESOLVED','REJECTED','CLOSED'].includes(state);
   const q=await tx.query('UPDATE support_cases SET state=$3,resolution_note=COALESCE($4,resolution_note),assigned_to=COALESCE(assigned_to,$5),resolved_by=CASE WHEN $6 THEN $5 ELSE resolved_by END,resolved_at=CASE WHEN $6 THEN now() ELSE resolved_at END,resolution_type=COALESCE($7,resolution_type),updated_at=now() WHERE id=$1 AND producer_organization_id=$2 RETURNING id,case_number,order_id,state,resolution_note,resolution_type,updated_at',[id.data,org,state,resolutionNote??null,c.get('userId'),terminal,resolutionType??null]);
   await recordEvent(tx,org,c.get('userId'),systemEvent('SUPPORT_CASE_'+state,'SUPPORT_CASE',id.data),'SUPPORT_CASE_'+state,'SUPPORT_CASE',id.data);
   await notifyOrganization(tx,current.rows[0].buyer_organization_id,['CUSTOMER_ADMIN','CUSTOMER_BUYER'],'SUPPORT','Support case updated','Your support case status is now '+state.replaceAll('_',' ').toLowerCase()+'. '+(resolutionNote??''),'SUPPORT_CASE',id.data,'SUPPORT_CASE_STATUS:'+id.data+':'+state,{state});
   return q.rows[0];
  });
  return c.json(result);
 });
 return app;
}
