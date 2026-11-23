import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {apiRequest,FriendlyApiError} from './api-errors';
import './finance-admin.css';
type Invoice={id:string;invoice_number:number;order_id:string;buyer_organization_id:string;buyer_name?:string;status:string;subtotal_paise:number;delivery_fee_paise:number;discount_paise:number;tax_paise:number;total_paise:number;tax_policy_status:string;created_at:string;paid_paise:number;credited_paise:number};
type ReadyOrder={id:string;delivery_date:string;total_paise:number;buyer_name:string;kitchen_name:string};
type LoyaltyProgram={id:string;points_per_100_rupees:number;paise_per_point:number;minimum_redeem_points:number;maximum_discount_bps:number;status:string;approved_at:string|null};
type LoyaltyAccount={id:string;buyer_organization_id:string;buyer_name:string;balance_points:number};
type RefundCandidate={support_case_id:string;case_number:number;order_id:string;invoice_id:string;invoice_number:number;buyer_name:string;available_paise:number};
type Refund={id:string;refund_number:number;invoice_id:string;support_case_id:string;buyer_name:string;amount_paise:number;method:string;status:string;reason:string;external_reference:string|null;created_at:string};
type Summary={invoices:{invoice_count:number;invoiced_paise:number;outstanding_paise:number};receipts:{received_paise:number;receipt_count:number};credits:{approved_credit_paise:number};taxInvoiceIssuingEnabled:boolean};
const money=(paise:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(Number(paise||0)/100);
export default function FinanceAdmin({base,token,onSessionExpired}:{base:string;token:string;onSessionExpired:()=>void}){
 const [invoices,setInvoices]=useState<Invoice[]>([]),[ready,setReady]=useState<ReadyOrder[]>([]),[summary,setSummary]=useState<Summary|null>(null);
 const [loyaltyProgram,setLoyaltyProgram]=useState<LoyaltyProgram|null>(null),[loyaltyAccounts,setLoyaltyAccounts]=useState<LoyaltyAccount[]>([]);
 const [earnRate,setEarnRate]=useState(''),[pointValue,setPointValue]=useState(''),[minimumPoints,setMinimumPoints]=useState(''),[maxRedeem,setMaxRedeem]=useState('');
 const [adjustBuyer,setAdjustBuyer]=useState(''),[adjustDelta,setAdjustDelta]=useState(''),[adjustReason,setAdjustReason]=useState('');
 const [refunds,setRefunds]=useState<Refund[]>([]),[refundCandidates,setRefundCandidates]=useState<RefundCandidate[]>([]);
 const [refundCaseId,setRefundCaseId]=useState(''),[refundAmount,setRefundAmount]=useState(''),[refundMethod,setRefundMethod]=useState('MANUAL'),[refundReason,setRefundReason]=useState(''),[refundReference,setRefundReference]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [buyerId,setBuyerId]=useState(''),[amount,setAmount]=useState(''),[method,setMethod]=useState('UPI'),[reference,setReference]=useState(''),[receivedOn,setReceivedOn]=useState(new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}));
 const [selectedInvoice,setSelectedInvoice]=useState(''),[creditAmount,setCreditAmount]=useState(''),[creditReason,setCreditReason]=useState('');
 const call=useCallback(async<T,>(path:string,method='GET',payload?:unknown)=>apiRequest<T>(base,path,{token,method,payload}),[base,token]);
 const refresh=useCallback(async()=>{
  const [i,r,s,program,accounts,refundRows,candidates]=await Promise.all([call<Invoice[]>('/v1/finance/invoices'),call<ReadyOrder[]>('/v1/finance/ready-orders'),call<Summary>('/v1/finance/summary'),call<LoyaltyProgram|null>('/v1/admin/loyalty/program'),call<LoyaltyAccount[]>('/v1/admin/loyalty/accounts'),call<Refund[]>('/v1/finance/refunds'),call<RefundCandidate[]>('/v1/finance/refunds/candidates')]);
  setInvoices(i);setReady(r);setSummary(s);setLoyaltyProgram(program);setLoyaltyAccounts(accounts);setRefunds(refundRows);setRefundCandidates(candidates);
  if(!refundCaseId&&candidates[0]?.support_case_id)setRefundCaseId(candidates[0].support_case_id);
  if(program){setEarnRate(String(program.points_per_100_rupees));setPointValue(String(program.paise_per_point));setMinimumPoints(String(program.minimum_redeem_points));setMaxRedeem(String(Number(program.maximum_discount_bps)/100));}
  if(!adjustBuyer&&accounts[0]?.buyer_organization_id)setAdjustBuyer(accounts[0].buyer_organization_id);
  if(!buyerId&&i[0]?.buyer_organization_id)setBuyerId(i[0].buyer_organization_id);
  if(!selectedInvoice&&i[0]?.id)setSelectedInvoice(i[0].id);
 },[call,buyerId,selectedInvoice,refundCaseId]);
 useEffect(()=>{let live=true;setBusy(true);void refresh().catch(e=>{if(!live)return;if(e instanceof FriendlyApiError&&e.status===401)onSessionExpired();setError(e instanceof Error?e.message:'Unable to load finance workspace');}).finally(()=>{if(live)setBusy(false);});return()=>{live=false};},[refresh,onSessionExpired]);
 const buyers=useMemo(()=>Array.from(new Map(invoices.map(i=>[i.buyer_organization_id,{id:i.buyer_organization_id,name:i.buyer_name||i.buyer_organization_id.slice(0,8)}])).values()),[invoices]);
 async function action(task:()=>Promise<unknown>,success:string){setBusy(true);setError('');setMessage('');try{await task();await refresh();setMessage(success);}catch(e){if(e instanceof FriendlyApiError&&e.status===401)onSessionExpired();setError(e instanceof Error?e.message:'Finance operation failed');}finally{setBusy(false);}}
 async function createInvoice(id:string){await action(()=>call('/v1/finance/invoices/from-order/'+id,'POST',{}),'Provisional invoice created. It is not a GST tax invoice.');}
 async function recordReceipt(e:React.FormEvent){e.preventDefault();if(!buyerId||!amount||Number(amount)<=0){setError('Select a customer and enter a valid amount.');return;}await action(()=>call('/v1/finance/receipts','POST',{buyerOrganizationId:buyerId,amountPaise:Math.round(Number(amount)*100),paymentMethod:method,reference:reference.trim()||undefined,receivedOn,allocations:selectedInvoice?[{invoiceId:selectedInvoice,amountPaise:Math.round(Number(amount)*100)}]:[]}),'Payment receipt recorded. Review any unallocated amount before closing the day.');setAmount('');setReference('');}
 async function saveLoyalty(e:React.FormEvent){e.preventDefault();if(!earnRate||!pointValue||!minimumPoints||!maxRedeem){setError('Complete all loyalty programme values.');return;}await action(()=>call('/v1/admin/loyalty/program','PUT',{pointsPer100Rupees:Number(earnRate),paisePerPoint:Math.round(Number(pointValue)*100),minimumRedeemPoints:Number(minimumPoints),maximumDiscountBps:Math.round(Number(maxRedeem)*100)}),'Loyalty programme saved as a draft. Approval is required before points can be earned.');
 }
 async function approveLoyalty(){await action(()=>call('/v1/admin/loyalty/program/approve','PATCH',{}),'Loyalty programme approved and activated.');}
 async function adjustLoyalty(e:React.FormEvent){e.preventDefault();if(!adjustBuyer||!adjustDelta||!adjustReason.trim()){setError('Select a customer and provide a points adjustment reason.');return;}await action(()=>call('/v1/admin/loyalty/adjustments','POST',{buyerOrganizationId:adjustBuyer,pointsDelta:Number(adjustDelta),idempotencyKey:'manual-'+Date.now()+'-'+Math.random().toString(36).slice(2),note:adjustReason.trim()}),'Loyalty adjustment recorded in the immutable ledger.');setAdjustDelta('');setAdjustReason('');}
 async function createRefund(e:React.FormEvent){e.preventDefault();const candidate=refundCandidates.find(x=>x.support_case_id===refundCaseId);if(!candidate||!refundAmount||Number(refundAmount)<=0||refundReason.trim().length<5){setError('Select a resolved refund case, amount and reason.');return;}await action(()=>call('/v1/finance/refunds','POST',{invoiceId:candidate.invoice_id,supportCaseId:candidate.support_case_id,amountPaise:Math.round(Number(refundAmount)*100),method:refundMethod,reason:refundReason.trim(),idempotencyKey:'refund-'+Date.now()+'-'+Math.random().toString(36).slice(2)}),'Refund request created. Finance approval and external settlement reference are still required.');setRefundAmount('');setRefundReason('');}
 async function updateRefund(id:string,status:'APPROVED'|'PROCESSING'|'REFUNDED'){if(status==='REFUNDED'&&refundReference.trim().length<4){setError('Enter the external bank or gateway reference first.');return;}await action(()=>call('/v1/finance/refunds/'+id,'PATCH',{status,externalReference:status==='REFUNDED'?refundReference.trim():undefined}),'Refund status updated.');if(status==='REFUNDED')setRefundReference('');}
 async function createCredit(e:React.FormEvent){e.preventDefault();if(!selectedInvoice||!creditAmount||creditReason.trim().length<5){setError('Choose an invoice, amount and reason (at least 5 characters).');return;}await action(async()=>{const note=await call<{id:string}>('/v1/finance/invoices/'+selectedInvoice+'/credit-notes','POST',{amountPaise:Math.round(Number(creditAmount)*100),reason:creditReason.trim()});await call('/v1/finance/credit-notes/'+note.id+'/approve','PATCH',{});},'Credit note approved and recorded in the audit ledger.');setCreditAmount('');setCreditReason('');}
 return <section className="fp-finance">
  <div className="fp-finance-heading"><div><span className="fp-finance-kicker">FINANCE CONTROL</span><h2>Invoices, collections & credits</h2><p>Reconcile delivered orders, record receipts and track outstanding balances.</p></div><button type="button" onClick={()=>void action(refresh,'Finance data refreshed.')} disabled={busy}>↻ Refresh</button></div>
  {error&&<p className="fp-finance-error" role="alert">{error}</p>}{message&&<p className="fp-finance-notice" role="status">{message}</p>}
  <div className="fp-finance-metrics">
   <article><span>Invoiced value</span><strong>{money(Number(summary?.invoices.invoiced_paise||0))}</strong><small>{summary?.invoices.invoice_count||0} provisional / issued documents</small></article>
   <article><span>Outstanding</span><strong>{money(Number(summary?.invoices.outstanding_paise||0))}</strong><small>Before approved credit adjustments</small></article>
   <article><span>Receipts recorded</span><strong>{money(Number(summary?.receipts.received_paise||0))}</strong><small>{summary?.receipts.receipt_count||0} receipts</small></article>
   <article><span>Approved credits</span><strong>{money(Number(summary?.credits.approved_credit_paise||0))}</strong><small>Credit-note ledger</small></article>
  </div>
  <div className="fp-finance-alert"><strong>Tax control:</strong> GST tax-invoice issuing is disabled until the business tax profile and accounting policy are formally approved. Documents created here are clearly marked provisional; no tax rate is assumed.</div>
  <div className="fp-finance-columns">
   <section className="fp-finance-panel"><header><div><h3>Delivered orders to invoice</h3><p>Only completed deliveries can be invoiced.</p></div><span>{ready.length} ready</span></header>
    {ready.length?ready.map(o=><div className="fp-finance-order" key={o.id}><div><strong>{o.buyer_name}</strong><small>{o.kitchen_name} · {o.delivery_date} · {o.id.slice(0,8)}</small></div><b>{money(o.total_paise)}</b><button type="button" disabled={busy} onClick={()=>void createInvoice(o.id)}>Prepare</button></div>):<p className="fp-finance-empty">{busy?'Loading delivered orders…':'No delivered orders are waiting for an invoice.'}</p>}
   </section>
   <section className="fp-finance-panel"><header><div><h3>Record customer receipt</h3><p>Enter the actual bank / UPI / cash receipt reference.</p></div></header>
    <form className="fp-finance-form" onSubmit={e=>void recordReceipt(e)}>
     <label>Customer<select required value={buyerId} onChange={e=>setBuyerId(e.target.value)}><option value="">Select customer</option>{buyers.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
     <label>Allocate to invoice<select value={selectedInvoice} onChange={e=>setSelectedInvoice(e.target.value)}><option value="">Leave unallocated</option>{invoices.filter(i=>i.buyer_organization_id===buyerId).map(i=><option key={i.id} value={i.id}>#{i.invoice_number} · {money(i.total_paise)}</option>)}</select></label>
     <div className="fp-finance-form-row"><label>Amount (₹)<input required type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>Method<select value={method} onChange={e=>setMethod(e.target.value)}>{['UPI','BANK_TRANSFER','CASH','CHEQUE','CARD','OTHER'].map(x=><option key={x}>{x}</option>)}</select></label></div>
     <label>Payment reference<input required minLength={4} value={reference} onChange={e=>setReference(e.target.value)} placeholder="UPI / bank transaction ID or cash receipt number"/></label>
     <label>Received on<input required type="date" value={receivedOn} onChange={e=>setReceivedOn(e.target.value)}/></label>
     <button type="submit" disabled={busy||!buyerId||!amount}>Record receipt</button>
    </form>
   </section>
  </div>
  <section className="fp-finance-panel fp-finance-wide"><header><div><h3>Invoice register</h3><p>Order-linked provisional documents and collection status.</p></div><span>{invoices.length} records</span></header>
   <div className="fp-finance-table-wrap"><table><thead><tr><th>Document</th><th>Customer</th><th>Order</th><th>Status</th><th>Total</th><th>Paid</th><th>Credits</th><th>Balance</th></tr></thead><tbody>
    {invoices.map(i=><tr key={i.id}><td>#{i.invoice_number}<small>{new Date(i.created_at).toLocaleDateString('en-IN')}</small></td><td>{i.buyer_name||i.buyer_organization_id.slice(0,8)}</td><td>{i.order_id.slice(0,8)}</td><td><span className="fp-finance-status">{i.status}</span><small>{i.tax_policy_status.replaceAll('_',' ')}</small></td><td>{money(i.total_paise)}</td><td>{money(i.paid_paise)}</td><td>{money(i.credited_paise)}</td><td>{money(Number(i.total_paise)-Number(i.paid_paise)-Number(i.credited_paise))}</td></tr>)}
    {!invoices.length&&<tr><td colSpan={8}>No invoices recorded yet.</td></tr>}
   </tbody></table></div>
  </section>
  <section className="fp-finance-panel fp-finance-credit"><header><div><h3>Credit note</h3><p>Prepare and approve a traceable credit against an invoice.</p></div></header>
   <form className="fp-finance-form" onSubmit={e=>void createCredit(e)}>
    <label>Invoice<select required value={selectedInvoice} onChange={e=>setSelectedInvoice(e.target.value)}><option value="">Select invoice</option>{invoices.map(i=><option key={i.id} value={i.id}>#{i.invoice_number} · {i.buyer_name||'Customer'} · {money(i.total_paise)}</option>)}</select></label>
    <div className="fp-finance-form-row"><label>Credit amount (₹)<input required type="number" min="0.01" step="0.01" value={creditAmount} onChange={e=>setCreditAmount(e.target.value)}/></label><label>Reason<input required minLength={5} value={creditReason} onChange={e=>setCreditReason(e.target.value)}/></label></div>
    <button type="submit" disabled={busy||!selectedInvoice||!creditAmount||creditReason.trim().length<5}>Approve credit note</button>
   </form>
  </section>
  <section className="fp-finance-panel fp-finance-wide"><header><div><h3>Refund requests</h3><p>Only resolved support cases marked REFUND and paid invoice balances are eligible. Settlement is recorded after the external transfer.</p></div><span>{refunds.length} requests</span></header>
   <form className="fp-finance-form" onSubmit={e=>void createRefund(e)}>
    <label>Resolved refund case<select required value={refundCaseId} onChange={e=>setRefundCaseId(e.target.value)}><option value="">Select eligible case</option>{refundCandidates.map(item=><option key={item.support_case_id} value={item.support_case_id}>Case #{item.case_number} · {item.buyer_name} · invoice #{item.invoice_number} · available {money(item.available_paise)}</option>)}</select></label>
    <div className="fp-finance-form-row"><label>Refund amount (₹)<input required type="number" min="0.01" step="0.01" value={refundAmount} onChange={e=>setRefundAmount(e.target.value)}/></label><label>Refund method<select value={refundMethod} onChange={e=>setRefundMethod(e.target.value)}><option value="MANUAL">Manual / bank</option><option value="BANK_TRANSFER">Bank transfer</option><option value="RAZORPAY">Razorpay (record external reference)</option></select></label></div>
    <label>Reason<input required minLength={5} value={refundReason} onChange={e=>setRefundReason(e.target.value)}/></label>
    <button type="submit" disabled={busy||!refundCaseId||!refundAmount||refundReason.trim().length<5}>Create refund request</button>
   </form>
   {refunds.map(item=><div className="fp-finance-order" key={item.id}><div><strong>Refund #{item.refund_number} · {item.buyer_name}</strong><small>{money(item.amount_paise)} · {item.method} · {item.reason}</small><small>{item.status}{item.external_reference?' · '+item.external_reference:''}</small></div>
    <div className="fp-finance-refund-actions">{item.status==='REQUESTED'&&<button type="button" disabled={busy} onClick={()=>void updateRefund(item.id,'APPROVED')}>Approve</button>}{item.status==='APPROVED'&&<button type="button" disabled={busy} onClick={()=>void updateRefund(item.id,'PROCESSING')}>Start processing</button>}{item.status==='PROCESSING'&&<><input aria-label="External refund reference" value={refundReference} onChange={e=>setRefundReference(e.target.value)} placeholder="Bank / gateway reference"/><button type="button" disabled={busy||refundReference.trim().length<4} onClick={()=>void updateRefund(item.id,'REFUNDED')}>Mark refunded</button></>}</div>
   </div>)}
   {!refunds.length&&<p className="fp-finance-empty">No refund requests have been created.</p>}
  </section>
  <div className="fp-finance-columns">
   <section className="fp-finance-panel"><header><div><h3>Loyalty programme</h3><p>Rates remain inactive until approved. No default earning or redemption values are assumed.</p></div><span>{loyaltyProgram?.status||'NOT CONFIGURED'}</span></header>
    <form className="fp-finance-form" onSubmit={e=>void saveLoyalty(e)}>
     <div className="fp-finance-form-row"><label>Points per ₹100 spent<input required type="number" min="1" value={earnRate} onChange={e=>setEarnRate(e.target.value)}/></label><label>Value per point (₹)<input required type="number" min="0.01" step="0.01" value={pointValue} onChange={e=>setPointValue(e.target.value)}/></label></div>
     <div className="fp-finance-form-row"><label>Minimum redemption points<input required type="number" min="1" value={minimumPoints} onChange={e=>setMinimumPoints(e.target.value)}/></label><label>Maximum discount per order (%)<input required type="number" min="0.01" max="100" step="0.01" value={maxRedeem} onChange={e=>setMaxRedeem(e.target.value)}/></label></div>
     <button type="submit" disabled={busy}>Save programme draft</button>
     {loyaltyProgram?.status==='DRAFT'&&<button type="button" disabled={busy} onClick={()=>void approveLoyalty()}>Approve and activate</button>}
    </form>
   </section>
   <section className="fp-finance-panel"><header><div><h3>Customer points accounts</h3><p>Balances are earned after verified delivery. Adjustments are audited.</p></div><span>{loyaltyAccounts.length} accounts</span></header>
    {loyaltyAccounts.map(account=><div className="fp-finance-order" key={account.id}><div><strong>{account.buyer_name}</strong><small>{account.buyer_organization_id.slice(0,8)}</small></div><b>{account.balance_points} pts</b></div>)}
    {!loyaltyAccounts.length&&<p className="fp-finance-empty">No customer points accounts yet.</p>}
    <form className="fp-finance-form" onSubmit={e=>void adjustLoyalty(e)}>
     <label>Customer<select required value={adjustBuyer} onChange={e=>setAdjustBuyer(e.target.value)}><option value="">Select customer</option>{loyaltyAccounts.map(account=><option key={account.id} value={account.buyer_organization_id}>{account.buyer_name}</option>)}</select></label>
     <div className="fp-finance-form-row"><label>Points adjustment (+ / −)<input required type="number" step="1" value={adjustDelta} onChange={e=>setAdjustDelta(e.target.value)}/></label><label>Reason<input required minLength={5} value={adjustReason} onChange={e=>setAdjustReason(e.target.value)}/></label></div>
     <button type="submit" disabled={busy||!adjustBuyer||!adjustDelta||adjustReason.trim().length<5}>Record adjustment</button>
    </form>
   </section>
  </div>
 </section>;
}
