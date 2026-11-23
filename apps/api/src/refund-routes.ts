import {Hono} from 'hono';
import {z} from 'zod';
import type {Pool} from 'pg';
import {canAny,type Role} from './authorization.js';
import {BusinessFailure,inTransaction,recordEvent,systemEvent,respondError} from './ops-db.js';
import {notifyOrganization} from './notification-service.js';
type Env={Variables:{userId:string;organizationId:string;roles:Role[]}};
function permission(roles:Role[],name:string){if(!canAny(roles,name))throw new BusinessFailure(403,'Permission denied');}
function parse<T extends z.ZodTypeAny>(v:unknown,s:T):z.infer<T>{const r=s.safeParse(v);if(!r.success)throw new BusinessFailure(400,'Invalid refund request');return r.data;}
const createSchema=z.object({invoiceId:z.string().uuid(),supportCaseId:z.string().uuid(),amountPaise:z.number().int().positive().max(10000000000),method:z.enum(['MANUAL','RAZORPAY','BANK_TRANSFER']),reason:z.string().trim().min(5).max(500),idempotencyKey:z.string().min(8).max(120)});
const transitionSchema=z.object({status:z.enum(['APPROVED','PROCESSING','REFUNDED','REJECTED','FAILED']),externalReference:z.string().trim().min(4).max(160).optional(),failureNote:z.string().trim().min(5).max(500).optional()});
export function createRefundRoutes(pool:Pool){
 const app=new Hono<Env>();
 app.onError((err,c)=>{const e=respondError(err);if(e.status===500)console.error('Refund API failed',err);return c.json({error:e.message},e.status);});
 app.get('/finance/refunds',async c=>{
  permission(c.get('roles'),'finance:read');
  const q=await pool.query('SELECT r.id,r.refund_number,r.invoice_id,r.support_case_id,r.buyer_organization_id,o.name AS buyer_name,r.amount_paise,r.method,r.status,r.reason,r.external_reference,r.failure_note,r.created_at,r.refunded_at FROM refund_requests r JOIN organizations o ON o.id=r.buyer_organization_id WHERE r.producer_organization_id=$1 ORDER BY r.created_at DESC LIMIT 500',[c.get('organizationId')]);
  return c.json(q.rows);
 });
 app.get('/finance/refunds/candidates',async c=>{
  permission(c.get('roles'),'finance:read');
  const q=await pool.query("SELECT sc.id AS support_case_id,sc.case_number,sc.order_id,fi.id AS invoice_id,fi.invoice_number,b.name AS buyer_name,COALESCE(paid.paid_paise,0)::bigint-COALESCE(reserved.reserved_paise,0)::bigint-COALESCE(credits.credited_paise,0)::bigint AS available_paise FROM support_cases sc JOIN finance_invoices fi ON fi.order_id=sc.order_id AND fi.producer_organization_id=sc.producer_organization_id AND fi.buyer_organization_id=sc.buyer_organization_id JOIN organizations b ON b.id=sc.buyer_organization_id LEFT JOIN LATERAL(SELECT sum(a.amount_paise) AS paid_paise FROM finance_allocations a JOIN finance_receipts r ON r.id=a.receipt_id WHERE a.invoice_id=fi.id) paid ON true LEFT JOIN LATERAL(SELECT sum(amount_paise) AS reserved_paise FROM refund_requests WHERE invoice_id=fi.id AND status IN ('REQUESTED','APPROVED','PROCESSING','REFUNDED')) reserved ON true LEFT JOIN LATERAL(SELECT sum(amount_paise) AS credited_paise FROM finance_credit_notes WHERE invoice_id=fi.id AND status='APPROVED') credits ON true WHERE sc.producer_organization_id=$1 AND sc.state='RESOLVED' AND sc.resolution_type='REFUND' AND COALESCE(paid.paid_paise,0)>COALESCE(reserved.reserved_paise,0)+COALESCE(credits.credited_paise,0) ORDER BY sc.updated_at DESC LIMIT 200",[c.get('organizationId')]);
  return c.json(q.rows);
 });
 app.get('/finance/refunds/me',async c=>{
  permission(c.get('roles'),'invoices:read');
  const q=await pool.query('SELECT r.id,r.refund_number,r.invoice_id,r.support_case_id,r.amount_paise,r.method,r.status,r.reason,r.external_reference,r.failure_note,r.created_at,r.refunded_at FROM refund_requests r WHERE r.buyer_organization_id=$1 ORDER BY r.created_at DESC LIMIT 200',[c.get('organizationId')]);
  return c.json(q.rows);
 });
 app.post('/finance/refunds',async c=>{
  permission(c.get('roles'),'finance:write');
  const d=parse(await c.req.json().catch(()=>null),createSchema),org=c.get('organizationId');
  const result=await inTransaction(pool,async tx=>{
   const prior=await tx.query('SELECT id,refund_number,status FROM refund_requests WHERE producer_organization_id=$1 AND idempotency_key=$2',[org,d.idempotencyKey]);
   if(prior.rowCount)return {...prior.rows[0],replayed:true};
   const support=await tx.query('SELECT id,order_id,buyer_organization_id,state,resolution_type FROM support_cases WHERE id=$1 AND producer_organization_id=$2 FOR UPDATE',[d.supportCaseId,org]);
   if(!support.rowCount)throw new BusinessFailure(404,'Support case not found');
   if(support.rows[0].state!=='RESOLVED'||support.rows[0].resolution_type!=='REFUND')throw new BusinessFailure(409,'Resolve the support case with a REFUND outcome before requesting a refund');
   const invoice=await tx.query('SELECT id,order_id,buyer_organization_id FROM finance_invoices WHERE id=$1 AND producer_organization_id=$2 FOR UPDATE',[d.invoiceId,org]);
   if(!invoice.rowCount)throw new BusinessFailure(404,'Invoice not found');
   if(invoice.rows[0].order_id!==support.rows[0].order_id||invoice.rows[0].buyer_organization_id!==support.rows[0].buyer_organization_id)throw new BusinessFailure(422,'The invoice must belong to the same customer order as the support case');
   const paid=await tx.query('SELECT COALESCE(sum(a.amount_paise),0)::bigint AS paid_paise FROM finance_allocations a JOIN finance_receipts r ON r.id=a.receipt_id WHERE a.invoice_id=$1 AND r.producer_organization_id=$2',[d.invoiceId,org]);
   const reserved=await tx.query("SELECT COALESCE(sum(amount_paise),0)::bigint AS reserved_paise FROM refund_requests WHERE invoice_id=$1 AND status IN ('REQUESTED','APPROVED','PROCESSING','REFUNDED')",[d.invoiceId]);
   const credits=await tx.query("SELECT COALESCE(sum(amount_paise),0)::bigint AS credited_paise FROM finance_credit_notes WHERE invoice_id=$1 AND status='APPROVED'",[d.invoiceId]);
   const available=Number(paid.rows[0].paid_paise)-Number(reserved.rows[0].reserved_paise)-Number(credits.rows[0].credited_paise);
   if(d.amountPaise>available)throw new BusinessFailure(422,'Refund amount exceeds the paid, unrefunded invoice balance');
   const inserted=await tx.query("INSERT INTO refund_requests(producer_organization_id,buyer_organization_id,invoice_id,support_case_id,amount_paise,method,reason,idempotency_key,requested_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,refund_number,status,amount_paise",[org,support.rows[0].buyer_organization_id,d.invoiceId,d.supportCaseId,d.amountPaise,d.method,d.reason,d.idempotencyKey,c.get('userId')]);
   const row=inserted.rows[0];
   await recordEvent(tx,org,c.get('userId'),systemEvent('REFUND_REQUESTED','REFUND',row.id),'REFUND_REQUESTED','REFUND',row.id);
   await notifyOrganization(tx,support.rows[0].buyer_organization_id,['CUSTOMER_ADMIN','CUSTOMER_BUYER'],'FINANCE','Refund requested','A refund request has been raised for your support case.','REFUND',row.id,'REFUND_REQUESTED:'+row.id,{refundNumber:row.refund_number,amountPaise:d.amountPaise});
   return {...row,replayed:false};
  });
  return c.json(result,result.replayed?200:201);
 });
 app.patch('/finance/refunds/:id',async c=>{
  permission(c.get('roles'),'finance:write');
  const id=z.string().uuid().safeParse(c.req.param('id'));if(!id.success)throw new BusinessFailure(400,'Invalid refund ID');
  const d=parse(await c.req.json().catch(()=>null),transitionSchema),org=c.get('organizationId');
  const result=await inTransaction(pool,async tx=>{
   const current=await tx.query('SELECT id,status,buyer_organization_id,refund_number FROM refund_requests WHERE id=$1 AND producer_organization_id=$2 FOR UPDATE',[id.data,org]);
   if(!current.rowCount)throw new BusinessFailure(404,'Refund request not found');
   const from=current.rows[0].status,allowed:Record<string,string[]>={REQUESTED:['APPROVED','REJECTED'],APPROVED:['PROCESSING','REJECTED'],PROCESSING:['REFUNDED','FAILED']};
   if(!allowed[from]?.includes(d.status))throw new BusinessFailure(409,'Invalid refund status transition from '+from+' to '+d.status);
   if(d.status==='REFUNDED'&&!d.externalReference)throw new BusinessFailure(422,'External bank or gateway reference is required before marking a refund complete');
   if(d.status==='FAILED'&&!d.failureNote)throw new BusinessFailure(422,'Failure reason is required');
   const updated=await tx.query('UPDATE refund_requests SET status=$3,approved_by=CASE WHEN $3=$4 THEN $5 ELSE approved_by END,processed_by=CASE WHEN $3 IN ($6,$7) THEN $5 ELSE processed_by END,external_reference=COALESCE($8,external_reference),failure_note=COALESCE($9,failure_note),refunded_at=CASE WHEN $3=$6 THEN now() ELSE refunded_at END,updated_at=now() WHERE id=$1 AND producer_organization_id=$2 RETURNING id,refund_number,status,amount_paise,external_reference,failure_note,refunded_at',[id.data,org,d.status,'APPROVED',c.get('userId'),'REFUNDED','FAILED',d.externalReference??null,d.failureNote??null]);
   await recordEvent(tx,org,c.get('userId'),systemEvent('REFUND_'+d.status,'REFUND',id.data),'REFUND_'+d.status,'REFUND',id.data);
   await notifyOrganization(tx,current.rows[0].buyer_organization_id,['CUSTOMER_ADMIN','CUSTOMER_BUYER'],'FINANCE','Refund status updated','Your refund request is now '+d.status.toLowerCase().replaceAll('_',' ')+'.','REFUND',id.data,'REFUND_STATUS:'+id.data+':'+d.status,{status:d.status});
   return updated.rows[0];
  });
  return c.json(result);
 });
 return app;
}
