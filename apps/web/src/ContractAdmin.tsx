import React,{useCallback,useEffect,useState} from 'react';
import {apiRequest,FriendlyApiError} from './api-errors';
type BuyerKitchen={organization_id:string;organization_name:string;kitchen_id:string;kitchen_name:string;address:string;zone_code:string};
type Variant={id:string;sku:string;vegetable:string;method_code:string;size_kind:string;size_number:string|null;size_unit:string|null;size_label:string|null;minimum_grams:number;increment_grams:number};
type Contract={id:string;contract_code:string;name:string;buyer_organization_id:string;buyer_name:string;kitchen_id:string|null;kitchen:string|null;status:string;valid_from:string;valid_to:string|null;minimum_order_value_paise:number;delivery_fee_paise:number;credit_limit_paise:number|null;payment_terms_days:number};
type PriceRule={id:string;variant_id:string;sku:string;vegetable:string;method_code:string;size_kind:string;size_number:string|null;size_unit:string|null;size_label:string|null;kitchen_id:string|null;price_paise_per_kg:number;minimum_grams:number;increment_grams:number;effective_from:string;effective_to:string|null;status:string;version:number};
type Props={base:string;token:string;canManage:boolean;onSessionExpired:()=>void};
const today=()=>{const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const v=Object.fromEntries(p.map(x=>[x.type,x.value]));return v.year+'-'+v.month+'-'+v.day;};
const money=(paise:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(Number(paise||0)/100);
export default function ContractAdmin({base,token,canManage,onSessionExpired}:Props){
 const [buyers,setBuyers]=useState<BuyerKitchen[]>([]),[variants,setVariants]=useState<Variant[]>([]),[contracts,setContracts]=useState<Contract[]>([]),[rules,setRules]=useState<PriceRule[]>([]);
 const [selectedBuyer,setSelectedBuyer]=useState(''),[selectedContract,setSelectedContract]=useState('');
 const [code,setCode]=useState(''),[name,setName]=useState(''),[validFrom,setValidFrom]=useState(today()),[validTo,setValidTo]=useState('');
 const [minimumOrder,setMinimumOrder]=useState('0'),[deliveryFee,setDeliveryFee]=useState('0'),[creditLimit,setCreditLimit]=useState(''),[paymentDays,setPaymentDays]=useState('0');
 const [variantId,setVariantId]=useState(''),[price,setPrice]=useState(''),[minGrams,setMinGrams]=useState('1000'),[stepGrams,setStepGrams]=useState('500'),[priceFrom,setPriceFrom]=useState(today()),[priceTo,setPriceTo]=useState('');
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const call=useCallback(async<T,>(path:string,method='GET',payload?:unknown):Promise<T>=>{
  try{return await apiRequest<T>(base,path,{token,method,payload});}
  catch(e){if(e instanceof FriendlyApiError&&e.status===401)onSessionExpired();throw e;}
 },[base,token,onSessionExpired]);
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const [b,v,c]=await Promise.all([
    call<BuyerKitchen[]>('/v1/admin/contracts/customers'),
    call<Variant[]>('/v1/admin/variants'),
    call<Contract[]>('/v1/admin/contracts')
   ]);
   setBuyers(b);setVariants(v);setContracts(c);
   setSelectedBuyer(old=>b.some(x=>x.kitchen_id===old)?old:b[0]?.kitchen_id||'');
   setSelectedContract(old=>c.some(x=>x.id===old)?old:c[0]?.id||'');
  }catch(e){setError(e instanceof Error?e.message:'Unable to load contract workspace');}
  finally{setLoading(false);}
 },[call]);
 useEffect(()=>{void load();},[load]);
 const loadRules=useCallback(async(id:string)=>{
  if(!id){setRules([]);return;}
  try{setRules(await call<PriceRule[]>('/v1/admin/contracts/'+id+'/prices'));}
  catch(e){setError(e instanceof Error?e.message:'Unable to load price rules');}
 },[call]);
 useEffect(()=>{void loadRules(selectedContract);},[selectedContract,loadRules]);
 async function createContract(e:React.FormEvent){
  e.preventDefault();const buyer=buyers.find(x=>x.kitchen_id===selectedBuyer);
  if(!buyer){setError('Choose a customer kitchen.');return;}
  setBusy(true);setError('');setNotice('');
  try{
   const created=await call<{id:string}>('/v1/admin/contracts','POST',{
    buyerOrganizationId:buyer.organization_id,kitchenId:buyer.kitchen_id,contractCode:code.trim(),name:name.trim(),
    validFrom,validTo:validTo||undefined,minimumOrderValuePaise:Math.round(Number(minimumOrder)*100),
    deliveryFeePaise:Math.round(Number(deliveryFee)*100),creditLimitPaise:creditLimit===''?null:Math.round(Number(creditLimit)*100),
    paymentTermsDays:Number(paymentDays)
   });
   setSelectedContract(created.id);setCode('');setName('');
   setNotice(canManage?'Contract created as draft. Add and approve its price rules, then activate it.':'Contract proposal created as draft for administrator review.');
   await load();
   setSelectedContract(created.id);
  }catch(e){setError(e instanceof Error?e.message:'Unable to create contract');}
  finally{setBusy(false);}
 }
 async function addPrice(e:React.FormEvent){
  e.preventDefault();if(!selectedContract){setError('Select a contract first.');return;}
  setBusy(true);setError('');setNotice('');
  try{
   const result=await call<{id:string;status:string}>('/v1/admin/contracts/'+selectedContract+'/prices','POST',{
    variantId,pricePaisePerKg:Math.round(Number(price)*100),minimumGrams:Number(minGrams),incrementGrams:Number(stepGrams),
    effectiveFrom:priceFrom,effectiveTo:priceTo||undefined
   });
   setNotice(result.status==='APPROVED'?'Price approved and available to the buyer after contract activation.':'Price proposed. An authorised administrator must approve it.');
   setPrice('');await loadRules(selectedContract);
  }catch(e){setError(e instanceof Error?e.message:'Unable to add price rule');}
  finally{setBusy(false);}
 }
 async function approveRule(ruleId:string){
  setBusy(true);setError('');setNotice('');
  try{await call('/v1/admin/contracts/'+selectedContract+'/prices/'+ruleId+'/approve','PATCH',{});setNotice('Contract price approved.');await loadRules(selectedContract);}
  catch(e){setError(e instanceof Error?e.message:'Unable to approve price');}
  finally{setBusy(false);}
 }
 async function activate(){
  setBusy(true);setError('');setNotice('');
  try{await call('/v1/admin/contracts/'+selectedContract+'/status','PATCH',{status:'ACTIVE'});setNotice('Contract activated. The customer catalogue now uses these approved prices.');await load();}
  catch(e){setError(e instanceof Error?e.message:'Unable to activate contract');}
  finally{setBusy(false);}
 }
 const current=contracts.find(c=>c.id===selectedContract);
 return <section className="fp-secure-card fp-contract-admin">
  <div className="fp-ops-heading"><div><span className="fp-secure-kicker">COMMERCIAL CONTROLS</span><h3>Buyer contracts & price books</h3><p>Effective-dated, kitchen-scoped prices. Sales proposals require administrator approval before checkout can use them.</p></div><button type="button" onClick={()=>void load()} disabled={loading||busy}>{loading?'Loading…':'Refresh'}</button></div>
  {error&&<p role="alert" className="fp-error">{error}</p>}{notice&&<p role="status" className="fp-notice">{notice}</p>}
  <div className="fp-secure-split">
   <section className="fp-secure-card"><h3>Create buyer contract</h3><form onSubmit={e=>void createContract(e)}>
    <label>Customer kitchen<select required value={selectedBuyer} onChange={e=>setSelectedBuyer(e.target.value)}><option value="">Select kitchen</option>{buyers.map(b=><option key={b.kitchen_id} value={b.kitchen_id}>{b.organization_name} · {b.kitchen_name}</option>)}</select></label>
    <label>Contract code<input required minLength={3} maxLength={40} value={code} onChange={e=>setCode(e.target.value)} placeholder="BLR-HOTEL-2026"/></label>
    <label>Contract name<input required minLength={3} value={name} onChange={e=>setName(e.target.value)} placeholder="Hotel monthly supply agreement"/></label>
    <div className="fp-secure-form-grid"><label>Valid from<input type="date" required value={validFrom} onChange={e=>setValidFrom(e.target.value)}/></label><label>Valid to<input type="date" value={validTo} onChange={e=>setValidTo(e.target.value)}/></label></div>
    <div className="fp-secure-form-grid"><label>Minimum order (₹)<input type="number" min="0" step="0.01" value={minimumOrder} onChange={e=>setMinimumOrder(e.target.value)}/></label><label>Delivery fee (₹)<input type="number" min="0" step="0.01" value={deliveryFee} onChange={e=>setDeliveryFee(e.target.value)}/></label></div>
    <div className="fp-secure-form-grid"><label>Credit limit (₹)<input type="number" min="0" step="0.01" value={creditLimit} onChange={e=>setCreditLimit(e.target.value)} placeholder="No credit limit"/></label><label>Payment terms (days)<input type="number" min="0" max="180" value={paymentDays} onChange={e=>setPaymentDays(e.target.value)}/></label></div>
    <button type="submit" disabled={busy||!selectedBuyer}>{busy?'Saving…':'Create contract draft'}</button>
   </form></section>
   <section className="fp-secure-card"><h3>Contract register</h3>
    <label>Select contract<select value={selectedContract} onChange={e=>setSelectedContract(e.target.value)}><option value="">Choose contract</option>{contracts.map(c=><option key={c.id} value={c.id}>{c.buyer_name} · {c.contract_code} · {c.status}</option>)}</select></label>
    {current&&<div className="fp-secure-line"><strong>{current.name}</strong><span>{current.buyer_name}{current.kitchen?' · '+current.kitchen:''}</span><span>{current.valid_from}{current.valid_to?' to '+current.valid_to:''} · {current.status}</span><span>Minimum {money(current.minimum_order_value_paise)} · Delivery {money(current.delivery_fee_paise)}</span></div>}
    {current?.status==='DRAFT'&&canManage&&<button type="button" disabled={busy||!rules.some(r=>r.status==='APPROVED')} onClick={()=>void activate()}>Activate contract</button>}
    <div className="fp-contract-rules"><h4>Approved and proposed price rules</h4>{rules.length?rules.map(r=><article key={r.id}><div><strong>{r.vegetable} · {r.method_code} · {r.size_kind==='numeric'?r.size_number+' '+r.size_unit:r.size_label}</strong><span>{money(r.price_paise_per_kg)} / kg · MOQ {(r.minimum_grams/1000).toFixed(2)} kg · step {(r.increment_grams/1000).toFixed(2)} kg</span><small>{r.effective_from}{r.effective_to?' to '+r.effective_to:''} · {r.status}</small></div>{canManage&&r.status==='PROPOSED'&&<button type="button" disabled={busy} onClick={()=>void approveRule(r.id)}>Approve</button>}</article>):<p>No price rules yet.</p>}</div>
   </section>
  </div>
  {selectedContract&&<section className="fp-secure-card"><h3>Add price rule</h3><form className="fp-contract-price-form" onSubmit={e=>void addPrice(e)}>
   <label>Prepared SKU<select required value={variantId} onChange={e=>{const v=variants.find(x=>x.id===e.target.value);setVariantId(e.target.value);if(v){setMinGrams(String(v.minimum_grams));setStepGrams(String(v.increment_grams));}}}><option value="">Select a prepared SKU</option>{variants.map(v=><option key={v.id} value={v.id}>{v.sku} · {v.vegetable} · {v.method_code} · {v.size_kind==='numeric'?v.size_number+' '+v.size_unit:v.size_label}</option>)}</select></label>
   <label>Price (₹ / kg)<input required type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)}/></label>
   <label>Minimum (grams)<input required type="number" min="1" step="1" value={minGrams} onChange={e=>setMinGrams(e.target.value)}/></label>
   <label>Increment (grams)<input required type="number" min="1" step="1" value={stepGrams} onChange={e=>setStepGrams(e.target.value)}/></label>
   <label>Effective from<input required type="date" value={priceFrom} onChange={e=>setPriceFrom(e.target.value)}/></label>
   <label>Effective to<input type="date" value={priceTo} onChange={e=>setPriceTo(e.target.value)}/></label>
   <button type="submit" disabled={busy||!variantId||price===''||Number(price)<0}>Save price rule</button>
  </form></section>}
 </section>;
}
