import React,{useCallback,useEffect,useState} from 'react';
import {apiRequest,FriendlyApiError} from './api-errors';
import './offer-admin.css';
type Offer={id:string;code:string;name:string;description:string|null;discount_type:'FIXED_PAISE'|'PERCENT_BPS';discount_value:number;minimum_subtotal_paise:number;max_discount_paise:number|null;starts_at:string;ends_at:string;max_redemptions:number|null;per_buyer_limit:number;status:string};
export default function OfferAdmin({base,token,onSessionExpired}:{base:string;token:string;onSessionExpired:()=>void}){
 const [offers,setOffers]=useState<Offer[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [code,setCode]=useState(''),[name,setName]=useState(''),[description,setDescription]=useState('');
 const [type,setType]=useState<'FIXED_PAISE'|'PERCENT_BPS'>('PERCENT_BPS'),[value,setValue]=useState(''),[cap,setCap]=useState('');
 const [minimum,setMinimum]=useState('0'),[starts,setStarts]=useState(''),[ends,setEnds]=useState(''),[quota,setQuota]=useState(''),[perBuyer,setPerBuyer]=useState('1');
 const call=useCallback(async<T,>(path:string,method='GET',payload?:unknown)=>apiRequest<T>(base,path,{token,method,payload}),[base,token]);
 const refresh=useCallback(async()=>setOffers(await call<Offer[]>('/v1/admin/offers')),[call]);
 useEffect(()=>{let live=true;void refresh().catch(e=>{if(live){if(e instanceof FriendlyApiError&&e.status===401)onSessionExpired();setError(e instanceof Error?e.message:'Unable to load offers');}});return()=>{live=false};},[refresh,onSessionExpired]);
 async function run(task:()=>Promise<unknown>,success:string){setBusy(true);setError('');setMessage('');try{await task();await refresh();setMessage(success);}catch(e){if(e instanceof FriendlyApiError&&e.status===401)onSessionExpired();setError(e instanceof Error?e.message:'Offer operation failed');}finally{setBusy(false);}}
 async function create(e:React.FormEvent){e.preventDefault();if(!starts||!ends||Number(value)<=0){setError('Enter valid discount value and offer dates.');return;}
  await run(()=>call('/v1/admin/offers','POST',{code,name,description:description||undefined,discountType:type,discountValue:type==='PERCENT_BPS'?Math.round(Number(value)*100):Math.round(Number(value)*100),maxDiscountPaise:type==='PERCENT_BPS'&&cap?Math.round(Number(cap)*100):undefined,minimumSubtotalPaise:Math.round(Number(minimum||0)*100),startsAt:new Date(starts).toISOString(),endsAt:new Date(ends).toISOString(),maxRedemptions:quota?Number(quota):undefined,perBuyerLimit:Number(perBuyer||1)}),'Offer saved as draft. Activate it only after checking its dates and limits.');
  setCode('');setName('');setDescription('');setValue('');setCap('');setMinimum('0');setStarts('');setEnds('');setQuota('');
 }
 async function status(id:string,next:'ACTIVE'|'PAUSED'|'EXPIRED'){await run(()=>call('/v1/admin/offers/'+id+'/status','PATCH',{status:next}),'Offer '+next.toLowerCase()+'.');}
 return <section className="fp-offers">
  <header className="fp-offers-head"><div><span>COMMERCIAL CAMPAIGNS</span><h2>Offers & coupon codes</h2><p>Configure eligibility, validity and redemption limits. Discounts are calculated and enforced by the order API.</p></div><button type="button" disabled={busy} onClick={()=>void run(refresh,'Offer list refreshed.')}>↻ Refresh</button></header>
  {error&&<p className="fp-offers-error" role="alert">{error}</p>}{message&&<p className="fp-offers-message" role="status">{message}</p>}
  <div className="fp-offers-grid">
   <form className="fp-offers-form" onSubmit={e=>void create(e)}>
    <h3>Create an offer</h3><p>New offers start as drafts and are not redeemable until activated.</p>
    <div className="fp-offers-row"><label>Coupon code<input required minLength={3} maxLength={32} value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="WELCOME10"/></label><label>Offer name<input required minLength={3} value={name} onChange={e=>setName(e.target.value)} placeholder="New customer offer"/></label></div>
    <label>Description (optional)<input value={description} onChange={e=>setDescription(e.target.value)} maxLength={500}/></label>
    <div className="fp-offers-row"><label>Discount type<select value={type} onChange={e=>setType(e.target.value as typeof type)}><option value="PERCENT_BPS">Percentage</option><option value="FIXED_PAISE">Fixed amount</option></select></label><label>{type==='PERCENT_BPS'?'Discount (%)':'Discount (₹)'}<input required type="number" min="0.01" step="0.01" value={value} onChange={e=>setValue(e.target.value)}/></label></div>
    <div className="fp-offers-row"><label>Minimum basket (₹)<input type="number" min="0" step="0.01" value={minimum} onChange={e=>setMinimum(e.target.value)}/></label>{type==='PERCENT_BPS'&&<label>Maximum discount (₹)<input type="number" min="0.01" step="0.01" value={cap} onChange={e=>setCap(e.target.value)}/></label>}</div>
    <div className="fp-offers-row"><label>Starts at<input required type="datetime-local" value={starts} onChange={e=>setStarts(e.target.value)}/></label><label>Ends at<input required type="datetime-local" value={ends} onChange={e=>setEnds(e.target.value)}/></label></div>
    <div className="fp-offers-row"><label>Total redemption limit<input type="number" min="1" value={quota} onChange={e=>setQuota(e.target.value)} placeholder="Unlimited"/></label><label>Uses per customer<input required type="number" min="1" max="100" value={perBuyer} onChange={e=>setPerBuyer(e.target.value)}/></label></div>
    <button type="submit" disabled={busy}>{busy?'Saving…':'Save offer draft'}</button>
   </form>
   <section className="fp-offers-list"><header><h3>Offer register</h3><span>{offers.length} offers</span></header>
    {offers.map(o=><article key={o.id}><div className="fp-offers-card-top"><strong>{o.code}</strong><span className={'fp-offers-state '+o.status.toLowerCase()}>{o.status}</span></div>
     <h4>{o.name}</h4><p>{o.discount_type==='PERCENT_BPS'?(Number(o.discount_value)/100)+'% off':'₹'+(Number(o.discount_value)/100).toFixed(2)+' off'}{o.max_discount_paise?' · cap ₹'+(Number(o.max_discount_paise)/100).toFixed(2):''}</p>
     <small>Valid {new Date(o.starts_at).toLocaleString('en-IN')} – {new Date(o.ends_at).toLocaleString('en-IN')}</small>
     <small>Minimum ₹{(Number(o.minimum_subtotal_paise)/100).toFixed(2)} · {o.max_redemptions??'Unlimited'} total uses · {o.per_buyer_limit} per customer</small>
     <div className="fp-offers-actions">{o.status==='DRAFT'&&<button disabled={busy} onClick={()=>void status(o.id,'ACTIVE')}>Activate</button>}{o.status==='ACTIVE'&&<button disabled={busy} onClick={()=>void status(o.id,'PAUSED')}>Pause</button>}{o.status==='PAUSED'&&<button disabled={busy} onClick={()=>void status(o.id,'ACTIVE')}>Reactivate</button>}</div>
    </article>)}
    {!offers.length&&<p className="fp-offers-empty">No offers configured. Create a draft when commercial terms are approved.</p>}
   </section>
  </div>
 </section>;
}
