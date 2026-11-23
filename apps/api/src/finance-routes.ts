import {Hono} from 'hono';
import {z} from 'zod';
import type {Pool} from 'pg';
import {canAny,type Role} from './authorization.js';
import {BusinessFailure,inTransaction,recordEvent,systemEvent,respondError} from './ops-db.js';
import {localDate} from './scheduling.js';
type Env={Variables:{userId:string;organizationId:string;roles:Role[]}};
const uuid=z.string().uuid();
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{try{localDate(v);return true;}catch{return false;}});
const receiptInput=z.object({
 buyerOrganizationId:uuid,amountPaise:z.number().int().positive().max(100_000_000_000),
 paymentMethod:z.enum(['UPI','BANK_TRANSFER','CASH','CHEQUE','CARD','OTHER']),
 reference:z.string().trim().max(120).optional(),receivedOn:date,note:z.string().trim().max(500).optional(),
 allocations:z.array(z.object({invoiceId:uuid,amountPaise:z.number().int().positive()})).max(100).default([])
});
const creditInput=z.object({amountPaise:z.number().int().positive(),reason:z.string().trim().min(5).max(500)});
function requirePermission(roles:Role[],permission:string){if(!canAny(roles,permission))throw new BusinessFailure(403,'You do not have permission to perform this finance action');}
function parse<T extends z.ZodTypeAny>(value:unknown,schema:T):z.infer<T>{const r=schema.safeParse(value);if(!r.success)throw new BusinessFailure(400,'Invalid request: '+r.error.issues.map(i=>i.path.join('.')).join(', '));return r.data;}
function idParam(c:{req:{param:(key:string)=>string}},key:string){const r=uuid.safeParse(c.req.param(key));if(!r.success)throw new BusinessFailure(400,'Invalid resource ID');return r.data;}
export function createFinanceRoutes(pool:Pool){
 const app=new Hono<Env>();
 app.onError((err,c)=>{const e=respondError(err);if(e.status===500)console.error('Finance API failed',err);return c.json({error:e.message},e.status);});
 app.get('/finance/summary',async c=>{
  requirePermission(c.get('roles'),'finance:read');const org=c.get('organizationId');
  const [invoices,receipts,credits]=await Promise.all([
   pool.query('SELECT count(*)::int AS invoice_count,COALESCE(sum(total_paise),0)::bigint AS invoiced_paise,COALESCE(sum(total_paise-COALESCE(paid.paid_paise,0)),0)::bigint AS outstanding_paise FROM finance_invoices i LEFT JOIN LATERAL(SELECT sum(a.amount_paise) AS paid_paise FROM finance_allocations a WHERE a.invoice_id=i.id) paid ON true WHERE i.producer_organization_id=$1 AND i.status<>\\'VOID\\'',[org]),
   pool.query('SELECT COALESCE(sum(amount_paise),0)::bigint AS received_paise,count(*)::int AS receipt_count FROM finance_receipts WHERE producer_organization_id=$1',[org]),
   pool.query('SELECT COALESCE(sum(cn.amount_paise),0)::bigint AS approved_credit_paise FROM finance_credit_notes cn JOIN finance_invoices i ON i.id=cn.invoice_id WHERE i.producer_organization_id=$1 AND cn.status=\\'APPROVED\\'',[org])
  ]);
  return c.json({invoices:invoices.rows[0],receipts:receipts.rows[0],credits:credits.rows[0],currency:'INR',taxInvoiceIssuingEnabled:false});
 });
 app.get('/finance/invoices',async c=>{
  const roles=c.get('roles'),org=c.get('organizationId'),producer=canAny(roles,'finance:read');
  if(!producer&&!canAny(roles,'invoices:read'))throw new BusinessFailure(403,'Permission denied');
  const q=producer?
   await pool.query('SELECT i.id,i.invoice_number,i.order_id,i.buyer_organization_id,b.name AS buyer_name,i.status,i.currency,i.subtotal_paise,i.delivery_fee_paise,i.discount_paise,i.tax_paise,i.total_paise,i.tax_policy_status,i.created_at,COALESCE(p.paid_paise,0)::bigint AS paid_paise FROM finance_invoices i JOIN organizations b ON b.id=i.buyer_organization_id LEFT JOIN LATERAL(SELECT sum(a.amount_paise) AS paid_paise FROM finance_allocations a WHERE a.invoice_id=i.id) p ON true WHERE i.producer_organization_id=$1 ORDER BY i.created_at DESC LIMIT 500',[org]):
   await pool.query('SELECT i.id,i.invoice_number,i.order_id,i.status,i.currency,i.subtotal_paise,i.delivery_fee_paise,i.discount_paise,i.tax_paise,i.total_paise,i.tax_policy_status,i.created_at,COALESCE(p.paid_paise,0)::bigint AS paid_paise FROM finance_invoices i LEFT JOIN LATERAL(SELECT sum(a.amount_paise) AS paid_paise FROM finance_allocations a WHERE a.invoice_id=i.id) p ON true WHERE i.buyer_organization_id=$1 ORDER BY i.created_at DESC LIMIT 200',[org]);
  return c.json(q.rows);
 });
 app.post('/finance/invoices/from-order/:orderId',async c=>{
  requirePermission(c.get('roles'),'finance:write');const orderId=idParam(c,'orderId');
  const result=await inTransaction(pool,async tx=>{
   const order=await tx.query('SELECT id,organization_id,producer_organization_id,state,subtotal_paise,delivery_fee_paise,discount_paise,total_paise,pricing_snapshot FROM orders WHERE id=$1 AND producer_organization_id=$2 FOR UPDATE',[orderId,c.get('organizationId')]);
   if(!order.rowCount)throw new BusinessFailure(404,'Order not found for this supplier account');
   const o=order.rows[0];if(o.state!=='DELIVERED')throw new BusinessFailure(409,'An invoice can only be prepared after the order is marked delivered');
   const existing=await tx.query('SELECT id,invoice_number,status FROM finance_invoices WHERE order_id=$1',[orderId]);
   if(existing.rowCount)return {...existing.rows[0],replayed:true};
   const inserted=await tx.query('INSERT INTO finance_invoices(producer_organization_id,buyer_organization_id,order_id,status,subtotal_paise,delivery_fee_paise,discount_paise,tax_paise,total_paise,tax_policy_status,snapshot,created_by) VALUES($1,$2,$3,\\'PROVISIONAL\\',$4,$5,$6,0,$7,\\'PENDING_APPROVAL\\',$8::jsonb,$9) RETURNING id,invoice_number,status,total_paise,tax_policy_status',
    [c.get('organizationId'),o.organization_id,orderId,o.subtotal_paise,o.delivery_fee_paise,o.discount_paise??0,o.total_paise,JSON.stringify({source:'DELIVERED_ORDER',pricing:o.pricing_snapshot,documentNotice:'PROVISIONAL — NOT A GST TAX INVOICE; tax policy approval required'}),c.get('userId')]);
   const invoice=inserted.rows[0];
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),systemEvent('PROVISIONAL_INVOICE_CREATED','INVOICE',invoice.id),'PROVISIONAL_INVOICE_CREATED','INVOICE',invoice.id);
   return {...invoice,replayed:false};
  });
  return c.json(result,result.replayed?200:201);
 });
 app.post('/finance/receipts',async c=>{
  requirePermission(c.get('roles'),'finance:write');const d=parse(await c.req.json().catch(()=>null),receiptInput);
  if(d.allocations.reduce((s,a)=>s+a.amountPaise,0)>d.amountPaise)throw new BusinessFailure(422,'Allocations cannot exceed the receipt amount');
  if(new Set(d.allocations.map(a=>a.invoiceId)).size!==d.allocations.length)throw new BusinessFailure(422,'An invoice may appear only once per receipt');
  const result=await inTransaction(pool,async tx=>{
   const buyer=await tx.query('SELECT id FROM organizations WHERE id=$1 AND kind=\\'CUSTOMER\\'',[d.buyerOrganizationId]);
   if(!buyer.rowCount)throw new BusinessFailure(422,'Select a valid customer organisation');
   if(d.reference){const duplicate=await tx.query('SELECT id FROM finance_receipts WHERE producer_organization_id=$1 AND reference=$2',[c.get('organizationId'),d.reference]);if(duplicate.rowCount)throw new BusinessFailure(409,'This payment reference has already been recorded');}
   const receipt=await tx.query('INSERT INTO finance_receipts(producer_organization_id,buyer_organization_id,amount_paise,payment_method,reference,received_on,note,created_by) VALUES($1,$2,$3,$4,$5,$6::date,$7,$8) RETURNING id,receipt_number,amount_paise',[c.get('organizationId'),d.buyerOrganizationId,d.amountPaise,d.paymentMethod,d.reference??null,d.receivedOn,d.note??null,c.get('userId')]);
   let allocated=0;
   for(const a of d.allocations){
    const invoice=await tx.query('SELECT id,total_paise,buyer_organization_id FROM finance_invoices WHERE id=$1 AND producer_organization_id=$2 AND status IN (\\'PROVISIONAL\\',\\'ISSUED\\') FOR UPDATE',[a.invoiceId,c.get('organizationId')]);
    if(!invoice.rowCount||invoice.rows[0].buyer_organization_id!==d.buyerOrganizationId)throw new BusinessFailure(422,'Every allocated invoice must belong to the selected customer and supplier');
    const paid=await tx.query('SELECT COALESCE(sum(amount_paise),0)::bigint AS n FROM finance_allocations WHERE invoice_id=$1',[a.invoiceId]);
    const credits=await tx.query('SELECT COALESCE(sum(amount_paise),0)::bigint AS n FROM finance_credit_notes WHERE invoice_id=$1 AND status=\\'APPROVED\\'',[a.invoiceId]);
    const outstanding=Number(invoice.rows[0].total_paise)-Number(paid.rows[0].n)-Number(credits.rows[0].n);
    if(a.amountPaise>outstanding)throw new BusinessFailure(409,'Allocation exceeds the invoice outstanding balance');
    await tx.query('INSERT INTO finance_allocations(receipt_id,invoice_id,amount_paise,created_by) VALUES($1,$2,$3,$4)',[receipt.rows[0].id,a.invoiceId,a.amountPaise,c.get('userId')]);allocated+=a.amountPaise;
   }
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),systemEvent('PAYMENT_RECEIPT_RECORDED','RECEIPT',receipt.rows[0].id),'PAYMENT_RECEIPT_RECORDED','RECEIPT',receipt.rows[0].id);
   return {...receipt.rows[0],allocatedPaise:allocated,unallocatedPaise:d.amountPaise-allocated};
  });
  return c.json(result,201);
 });
 app.post('/finance/invoices/:invoiceId/credit-notes',async c=>{
  requirePermission(c.get('roles'),'finance:write');const invoiceId=idParam(c,'invoiceId'),d=parse(await c.req.json().catch(()=>null),creditInput);
  const result=await inTransaction(pool,async tx=>{
   const invoice=await tx.query('SELECT id,total_paise FROM finance_invoices WHERE id=$1 AND producer_organization_id=$2 FOR UPDATE',[invoiceId,c.get('organizationId')]);
   if(!invoice.rowCount)throw new BusinessFailure(404,'Invoice not found');
   const [paid,credits]=await Promise.all([tx.query('SELECT COALESCE(sum(amount_paise),0)::bigint AS n FROM finance_allocations WHERE invoice_id=$1',[invoiceId]),tx.query('SELECT COALESCE(sum(amount_paise),0)::bigint AS n FROM finance_credit_notes WHERE invoice_id=$1 AND status<>\\'VOID\\'',[invoiceId])]);
   if(d.amountPaise>Number(invoice.rows[0].total_paise)-Number(paid.rows[0].n)-Number(credits.rows[0].n))throw new BusinessFailure(409,'Credit note exceeds the remaining invoice balance');
   const row=await tx.query('INSERT INTO finance_credit_notes(invoice_id,amount_paise,reason,created_by) VALUES($1,$2,$3,$4) RETURNING id,credit_number,status,amount_paise',[invoiceId,d.amountPaise,d.reason,c.get('userId')]);
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),systemEvent('CREDIT_NOTE_DRAFTED','CREDIT_NOTE',row.rows[0].id),'CREDIT_NOTE_DRAFTED','CREDIT_NOTE',row.rows[0].id);return row.rows[0];
  });return c.json(result,201);
 });
 app.patch('/finance/credit-notes/:creditId/approve',async c=>{
  requirePermission(c.get('roles'),'finance:write');const creditId=idParam(c,'creditId');
  const result=await inTransaction(pool,async tx=>{
   const note=await tx.query('SELECT cn.id,cn.invoice_id,cn.status FROM finance_credit_notes cn JOIN finance_invoices i ON i.id=cn.invoice_id WHERE cn.id=$1 AND i.producer_organization_id=$2 FOR UPDATE OF cn',[creditId,c.get('organizationId')]);
   if(!note.rowCount)throw new BusinessFailure(404,'Credit note not found');
   if(note.rows[0].status!=='DRAFT')throw new BusinessFailure(409,'Only draft credit notes can be approved');
   await tx.query('UPDATE finance_credit_notes SET status=\\'APPROVED\\',approved_by=$2,approved_at=now() WHERE id=$1',[creditId,c.get('userId')]);
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),systemEvent('CREDIT_NOTE_APPROVED','CREDIT_NOTE',creditId),'CREDIT_NOTE_APPROVED','CREDIT_NOTE',creditId);return {id:creditId,status:'APPROVED'};
  });return c.json(result);
 });
 return app;
}
