import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import './secure-orders.css';
import {apiRequest,FriendlyApiError} from './api-errors';
import {nextQuantity} from './quantity';
type Role={roles:string[]};
type Kitchen={id:string;name:string;zone_code:string;address:string};
type Slot={id:string;zone_code:string;label:string;start_minute:number;
 cutoff_day_offset:number;cutoff_minute:number;capacity_orders:number};
type Product={id:string;vegetable:string;preparation:string;sku:string;
 size_kind:string;size_number:string|null;size_unit:string|null;size_label:string|null;
 price_paise_per_kg:number;minimum_grams:number;increment_grams:number;image_url:string;delivery_fee_paise?:number};
type Order={id:string;kitchen_id:string;slot_id:string;delivery_date:string;state:string;created_at:string};
type Quote={id:string;quote_number:number|string;state:string;delivery_date:string;valid_until:string;subtotal_paise:number|string;delivery_fee_paise:number|string;discount_paise:number|string;total_paise:number|string;note:string|null;accepted_order_id:string|null};
type Schedule={id:string;kitchen_id:string;slot_id:string;frequency:string;weekdays:number[];start_date:string;end_date:string|null;state:string};
type SupportCase={id:string;case_number:number|string;order_id:string;category:string;description:string;requested_resolution?:string|null;state:string;resolution_note?:string|null;created_at:string};
type Props={token:string;base:string;roles:string[];onLogout:()=>void};
const money=(p:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(p/100);
const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
async function capture(eventType:string,subjectType:string){
 const base={eventType,subjectType,subjectId:'pending',details:{client:'freshprep-web',at:new Date().toISOString()}};
 if(typeof navigator==='undefined'||!navigator.geolocation)
  return {...base,location:{source:'UNAVAILABLE',unavailableReason:'Browser location unavailable',consentStatus:'NOT_REQUESTED'}};
 return new Promise<any>(resolve=>navigator.geolocation.getCurrentPosition(
  pos=>resolve({...base,location:{source:'DEVICE_GPS',latitude:pos.coords.latitude,longitude:pos.coords.longitude,
   accuracyMeters:Math.max(0,pos.coords.accuracy),capturedAt:new Date(pos.timestamp).toISOString(),consentStatus:'GRANTED'}}),
  error=>resolve({...base,location:{source:'UNAVAILABLE',unavailableReason:'Browser location denied or unavailable: '+error.code,
   consentStatus:error.code===1?'DENIED':'NOT_REQUESTED'}}),
  {enableHighAccuracy:false,timeout:6000,maximumAge:0}
 ));
}
function ProductPhoto({item}:{item:Product}){
 const [failed,setFailed]=useState(false);
 return <div className="fp-product-photo">
  {!failed&&item.image_url?<img src={item.image_url} alt={item.vegetable+' prepared '+item.preparation.toLowerCase()} loading="lazy"
    onError={()=>setFailed(true)}/>:<div className="fp-product-photo-fallback" role="img" aria-label={item.vegetable+' photo unavailable'}>{item.vegetable.slice(0,1).toUpperCase()}</div>}
 {item.image_url.includes('/prepared-cut/')&&<span className="fp-generated-photo-tag">AI-generated demo image</span>}
 </div>;
}
export default function CustomerOrderPortal({token,base,roles,onLogout}:Props){
 const canWrite=roles.includes('SUPERADMIN')||roles.includes('CUSTOMER_BUYER')||roles.includes('CUSTOMER_ADMIN');
 const canRequestQuote=canWrite;
 const [products,setProducts]=useState<Product[]>([]),[kitchens,setKitchens]=useState<Kitchen[]>([]),[slots,setSlots]=useState<Slot[]>([]);
 const [orders,setOrders]=useState<Order[]>([]),[schedules,setSchedules]=useState<Schedule[]>([]),[quotes,setQuotes]=useState<Quote[]>([]),[supportCases,setSupportCases]=useState<SupportCase[]>([]);
 const [supportOrder,setSupportOrder]=useState(''),[supportCategory,setSupportCategory]=useState('QUALITY'),[supportDescription,setSupportDescription]=useState(''),[supportResolution,setSupportResolution]=useState('');
 const [wallet,setWallet]=useState<{balancePoints:number;programActive:boolean;paisePerPoint:number|null;minimumRedeemPoints:number|null;maximumDiscountBps:number|null;entries:{entry_type:string;points_delta:number;note:string|null;created_at:string}[]}|null>(null);
 const [view,setView]=useState<'Order'|'Recurring'|'History'>('Order');
 const [search,setSearch]=useState(''),[basket,setBasket]=useState<Record<string,number>>({});
 const [promotionCode,setPromotionCode]=useState(''),[promotion,setPromotion]=useState<{code:string;name:string;discountType:'FIXED_PAISE'|'PERCENT_BPS';discountValue:number;maxDiscountPaise:number|null;minimumSubtotalPaise:number}|null>(null),[promotionMessage,setPromotionMessage]=useState('');
 const [kitchen,setKitchen]=useState(''),[slot,setSlot]=useState(''),[date,setDate]=useState(new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}));
 const [frequency,setFrequency]=useState<'DAILY'|'WEEKLY'>('WEEKLY'),[weekdays,setWeekdays]=useState<number[]>([1,2,3,4,5,6]);
 const [status,setStatus]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [loyaltyPointsToRedeem,setLoyaltyPointsToRedeem]=useState('');
 const onLogoutRef=useRef(onLogout);
 const pendingOrderRef=useRef<{fingerprint:string;key:string}|null>(null);
  const pendingQuoteRef=useRef<{fingerprint:string;key:string}|null>(null);
 const previousKitchen=useRef('');
 useEffect(()=>{onLogoutRef.current=onLogout;},[onLogout]);
 const call=useCallback(async<T,>(path:string,method='GET',data?:unknown):Promise<T>=>{
  try{return await apiRequest<T>(base,path,{token,method,payload:data});}
  catch(error){
   if(error instanceof FriendlyApiError&&error.status===401)onLogoutRef.current();
   throw error;
  }
 },[base,token]);
 const refresh=useCallback(async()=>{
  setBusy(true);setError('');
  try{
   const [k,s,o,r,q,sc]=await Promise.all([
    call<Kitchen[]>('/v1/kitchens'),call<Slot[]>('/v1/delivery-slots'),
    call<Order[]>('/v1/orders'),call<Schedule[]>('/v1/recurrences'),call<Quote[]>('/v1/quotes'),call<SupportCase[]>('/v1/support/cases')
   ]);
   setKitchens(k);setSlots(s);setOrders(o);setSchedules(r);setQuotes(q);setSupportCases(sc);
   setSupportOrder(old=>o.some(x=>x.id===old)?old:(o.find(x=>x.state==='DELIVERED')?.id||o[0]?.id||''));
   setKitchen(old=>k.some(x=>x.id===old)?old:k[0]?.id||'');
   if(!k.length)setProducts([]);
  }catch(e){setError(e instanceof Error?e.message:'Unable to load ordering');}
  finally{setBusy(false);}
 },[call]);
 useEffect(()=>{if(!kitchen){setWallet(null);return;}let active=true;void call<{balancePoints:number;programActive:boolean;paisePerPoint:number|null;minimumRedeemPoints:number|null;maximumDiscountBps:number|null;entries:{entry_type:string;points_delta:number;note:string|null;created_at:string}[]}>('/v1/loyalty/me?kitchenId='+encodeURIComponent(kitchen)).then(value=>{if(active)setWallet(value);}).catch(()=>{if(active)setWallet(null);});return()=>{active=false;};},[kitchen,call]);
 useEffect(()=>{void refresh();},[refresh]);
 useEffect(()=>{if(previousKitchen.current&&previousKitchen.current!==kitchen)setBasket({});previousKitchen.current=kitchen;},[kitchen]);
 useEffect(()=>{
  if(!kitchen){setProducts([]);return;}
  let active=true;
  setProducts([]);
  const query='/v1/catalog?kitchenId='+encodeURIComponent(kitchen)+'&deliveryDate='+encodeURIComponent(date);
  void call<Product[]>(query).then(rows=>{if(active){setProducts(rows);setError('');}})
   .catch(e=>{if(active){setProducts([]);setError(e instanceof Error?e.message:'Unable to load contracted catalogue');}});
  return()=>{active=false;};
 },[kitchen,date,call]);
 const visible=useMemo(()=>products.filter(p=>[p.vegetable,p.preparation,p.sku,String(p.size_number||p.size_label)].join(' ').toLowerCase().includes(search.toLowerCase())),[products,search]);
 const selected=useMemo(()=>Object.entries(basket).filter(([,grams])=>grams>0).map(([variantId,grams])=>({variantId,grams})),[basket]);
 const subtotal=selected.reduce((sum,item)=>sum+Math.round((products.find(p=>p.id===item.variantId)?.price_paise_per_kg||0)*item.grams/1000),0);
  const deliveryFee=selected.length?Number(products.find(p=>p.id===selected[0].variantId)?.delivery_fee_paise||0):0;
  const promotionDiscount=promotion&&view==='Order'&&subtotal>=promotion.minimumSubtotalPaise?Math.min(subtotal,promotion.discountType==='FIXED_PAISE'?promotion.discountValue:Math.floor(subtotal*promotion.discountValue/10000),promotion.maxDiscountPaise??Number.MAX_SAFE_INTEGER):0;
  const requestedLoyaltyPoints=Math.max(0,Number(loyaltyPointsToRedeem)||0);
  const loyaltyDiscountPaise=view==='Order'&&wallet?.programActive&&requestedLoyaltyPoints>=(wallet.minimumRedeemPoints||1)&&requestedLoyaltyPoints<=wallet.balancePoints?Math.min(requestedLoyaltyPoints*(wallet.paisePerPoint||0),Math.floor(subtotal*(wallet.maximumDiscountBps||0)/10000),subtotal-promotionDiscount):0;
  const total=subtotal-promotionDiscount-loyaltyDiscountPaise+deliveryFee;
 const selectedKitchen=kitchens.find(k=>k.id===kitchen);
 const suitable=slots.filter(s=>s.zone_code===selectedKitchen?.zone_code);
 function change(v:Product,delta:1|-1){
  setBasket(old=>{const current=old[v.id]||0;const next=nextQuantity(current,v.minimum_grams,v.increment_grams,delta);return {...old,[v.id]:next};});
 }
 async function applyPromotion(){
  if(!kitchen||!promotionCode.trim()){setPromotionMessage('Choose a kitchen and enter an offer code.');return;}
  setBusy(true);setError('');setPromotionMessage('');
  try{
   const result=await call<{code:string;name:string;discountType:'FIXED_PAISE'|'PERCENT_BPS';discountValue:number;maxDiscountPaise:number|null;minimumSubtotalPaise:number}>('/v1/promotions/validate?code='+encodeURIComponent(promotionCode.trim())+'&kitchenId='+encodeURIComponent(kitchen));
   setPromotion(result);
   if(subtotal<result.minimumSubtotalPaise)setPromotionMessage('Offer saved. Add '+money(result.minimumSubtotalPaise-subtotal)+' more to meet its minimum order value.');
   else setPromotionMessage('Offer '+result.code+' applied. Discount will be rechecked when you confirm the order.');
  }catch(e){setPromotion(null);setPromotionMessage(e instanceof Error?e.message:'Unable to validate offer code.');}
  finally{setBusy(false);}
 }
 async function submit(recurring:boolean){
  if(!canWrite)return;
  if(!kitchen||!slot||!selected.length){setError('Choose your kitchen, delivery slot and at least one product.');return;}
  if(!suitable.some(s=>s.id===slot)){setError('Delivery slot does not serve selected kitchen.');return;}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(new Date(date+'T00:00:00Z').getTime())||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date){setError('Select a valid delivery date.');return;}
  if(recurring&&frequency==='WEEKLY'&&!weekdays.length){setError('Select one or more delivery weekdays.');return;}
  setBusy(true);setError('');setStatus('');
  try{
   const event=await capture(recurring?'RECURRING_SCHEDULE_CREATED':'ORDER_CREATED',recurring?'SCHEDULE':'ORDER');
   if(recurring){
    const saved=await call<{id:string}>('/v1/recurrences','POST',{
     kitchenId:kitchen,slotId:slot,startDate:date,frequency,weekdays:frequency==='WEEKLY'?weekdays:[],items:selected,event
    });
    setStatus('Recurring schedule created: '+saved.id+'. Operations must run the generation job before cutoff.');
   }else{
    const fingerprint=JSON.stringify({kitchen,slot,date,items:[...selected].sort((a,b)=>a.variantId.localeCompare(b.variantId)),promotionCode:promotionDiscount>0?promotion?.code??null:null,loyaltyPoints:requestedLoyaltyPoints});
    if(!pendingOrderRef.current||pendingOrderRef.current.fingerprint!==fingerprint){
     pendingOrderRef.current={fingerprint,key:crypto.randomUUID()};
    }
    const key=pendingOrderRef.current.key;
    const saved=await call<{id:string;replayed?:boolean}>('/v1/orders','POST',{
     kitchenId:kitchen,slotId:slot,deliveryDate:date,idempotencyKey:key,items:selected,promotionCode:promotionDiscount>0?promotion?.code:undefined,loyaltyPoints:requestedLoyaltyPoints||undefined,event
    });
    pendingOrderRef.current=null;
    setStatus((saved.replayed?'Existing order confirmed: ':'Order confirmed: ')+saved.id);setBasket({});setPromotion(null);setPromotionCode('');setPromotionMessage('');setLoyaltyPointsToRedeem('');
    const updatedWallet=await call<{balancePoints:number;programActive:boolean;paisePerPoint:number|null;minimumRedeemPoints:number|null;maximumDiscountBps:number|null;entries:{entry_type:string;points_delta:number;note:string|null;created_at:string}[]}>('/v1/loyalty/me?kitchenId='+encodeURIComponent(kitchen));setWallet(updatedWallet);
   }
   await refresh();setView('History');
  }catch(e){setError(e instanceof Error?e.message:'Unable to save');}
  finally{setBusy(false);}
 }
   async function requestQuote(){
   if(!canRequestQuote)return;
   if(!kitchen||!slot||!selected.length){setError('Choose your kitchen, delivery slot and at least one product before requesting a quote.');return;}
   if(!suitable.some(s=>s.id===slot)){setError('Delivery slot does not serve selected kitchen.');return;}
   setBusy(true);setError('');setStatus('');
   try{
    const fingerprint=JSON.stringify({kitchen,slot,date,items:[...selected].sort((a,b)=>a.variantId.localeCompare(b.variantId))});
    if(!pendingQuoteRef.current||pendingQuoteRef.current.fingerprint!==fingerprint)pendingQuoteRef.current={fingerprint,key:crypto.randomUUID()};
    const saved=await call<{id:string;quoteNumber:number|string;replayed?:boolean}>('/v1/quotes','POST',{
     kitchenId:kitchen,slotId:slot,deliveryDate:date,idempotencyKey:pendingQuoteRef.current.key,items:selected
    });
    pendingQuoteRef.current=null;
    setStatus((saved.replayed?'Existing quote request: ':'Quote request submitted: ')+'#'+saved.quoteNumber+'. FreshPrep will review it and send a proposal.');
    setBasket({});await refresh();setView('History');
   }catch(e){setError(e instanceof Error?e.message:'Unable to request a quote');}
   finally{setBusy(false);}
  }
  async function createSupportCase(){
  if(!canWrite||!supportOrder||supportDescription.trim().length<10){setError('Select an order and describe the issue in at least 10 characters.');return;}
  setBusy(true);setError('');setStatus('');
  try{
   const event=await capture('SUPPORT_CASE_CREATED','SUPPORT_CASE');
   const saved=await call<{case_number:number|string;state:string}>('/v1/support/cases','POST',{
    orderId:supportOrder,category:supportCategory,description:supportDescription.trim(),
    requestedResolution:supportResolution.trim()||undefined,event
   });
   setSupportDescription('');setSupportResolution('');
   setStatus('Support case #'+saved.case_number+' opened. Our team will review it.');
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Unable to open support case');}
  finally{setBusy(false);}
 }
 async function acceptQuote(q:Quote){
   setBusy(true);setError('');setStatus('');
   try{
    const result=await call<{id:string;replayed:boolean}>('/v1/quotes/'+q.id+'/accept','POST',{});
    setStatus((result.replayed?'Previously accepted quote. ':'Quote accepted; order created: ')+result.id);
    await refresh();
   }catch(e){setError(e instanceof Error?e.message:'Unable to accept quote');}
   finally{setBusy(false);}
  }
  async function cancelOrder(order:Order){
  if(!canWrite||order.state!=='CONFIRMED')return;
  if(typeof window!=='undefined'&&!window.confirm('Cancel this order? The delivery slot will be released.'))return;
  setBusy(true);setError('');setStatus('');
  try{
   const event=await capture('ORDER_CANCELLED','ORDER');
   await call('/v1/orders/'+encodeURIComponent(order.id)+'/cancel','POST',{event});
   setStatus('Order '+order.id.slice(0,12)+' cancelled. Its delivery slot has been released.');
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Unable to cancel order');}
  finally{setBusy(false);}
 }
 async function rejectQuote(q:Quote){
   setBusy(true);setError('');setStatus('');
   try{await call('/v1/quotes/'+q.id+'/reject','POST',{});setStatus('Quote #'+q.quote_number+' declined.');await refresh();}
   catch(e){setError(e instanceof Error?e.message:'Unable to decline quote');}
   finally{setBusy(false);}
  }
async function setScheduleState(s:Schedule,state:'ACTIVE'|'PAUSED'|'CANCELLED'){
  setBusy(true);setError('');
  try{
   await call('/v1/recurrences/'+s.id,'PATCH',{state});
   setStatus('Schedule updated to '+state);await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Unable to update schedule');}finally{setBusy(false);}
 }
 async function skipDate(s:Schedule){
  setBusy(true);setError('');
  try{
   await call('/v1/recurrences/'+s.id+'/skips','POST',{deliveryDate:date,reason:'Customer requested a skipped delivery'});
   setStatus('Delivery skipped for '+date);await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Unable to skip delivery');}finally{setBusy(false);}
 }
 return <div className="fp-customer"><header className="fp-customer-title"><div><span>THE FRESHPREP PROMISE</span><h2>Fresh preparation, on your schedule.</h2><p>Precisely cut vegetables for professional kitchens. Order today or plan recurring deliveries.</p><div className="fp-customer-trust"><span>Hygiene-focused preparation</span><span>Cut sizes in millimetres</span><span>Time-slot delivery</span></div></div><button type="button" disabled={busy} onClick={()=>void refresh()}>{busy?'Refreshing…':'↻ Refresh supply'}</button></header>
 <section className="fp-customer-metrics" aria-label="Your supply summary"><article><span>PREPARATIONS AVAILABLE</span><strong>{products.length}</strong><small>Active cut variants</small></article><article><span>YOUR ORDERS</span><strong>{orders.length}</strong><small>Recent purchases</small></article><article><span>RECURRING PLANS</span><strong>{schedules.filter(s=>s.state==='ACTIVE').length}</strong><small>Active schedules</small></article></section>
 {error&&<div role="alert" className="fp-customer-error">{error}</div>}
 {status&&<div role="status" className="fp-customer-ok">{status}</div>}
 <nav className="fp-customer-tabs"><button className={view==='Order'?'active':''} onClick={()=>setView('Order')}>One-time order</button><button className={view==='Recurring'?'active':''} onClick={()=>setView('Recurring')}>Recurring supply</button><button className={view==='History'?'active':''} onClick={()=>setView('History')}>Orders & schedules</button></nav>
 {!canWrite&&<p className="fp-customer-info">Your role permits viewing orders but not creating or changing them.</p>}
 {view==='History'?<div className="fp-customer-history"><section><h3>Recent orders</h3>{orders.length?orders.map(o=><article key={o.id}><b>{o.id.slice(0,12)}</b><span>{o.delivery_date}</span><span>{o.state}</span>{canWrite&&o.state==='CONFIRMED'&&<button type="button" disabled={busy} onClick={()=>void cancelOrder(o)}>Cancel order</button>}</article>):<p>No orders yet.</p>}</section>
 <section><h3>Recurring schedules</h3>{schedules.length?schedules.map(s=><article key={s.id}><div><b>{s.frequency} · {s.state}</b><p>{s.start_date}{s.end_date?' – '+s.end_date:''}</p><small>{s.id}</small></div>{canWrite&&<div className="fp-customer-actions"><button disabled={busy||s.state==='CANCELLED'} onClick={()=>void setScheduleState(s,s.state==='ACTIVE'?'PAUSED':'ACTIVE')}>{s.state==='ACTIVE'?'Pause':'Resume'}</button><button disabled={busy||s.state==='CANCELLED'} onClick={()=>void skipDate(s)}>Skip selected date</button><button disabled={busy||s.state==='CANCELLED'} onClick={()=>void setScheduleState(s,'CANCELLED')}>Cancel</button></div>}</article>):<p>No recurring schedules.</p>}</section><section className="fp-customer-quotes"><h3>Quote requests</h3>{quotes.length?quotes.map(q=><article key={q.id}><div><b>Quote #{q.quote_number} · {q.state}</b><p>Delivery {q.delivery_date} · Total {money(Number(q.total_paise))}</p>{q.note&&<small>{q.note}</small>}{q.valid_until&&<small>Valid until {new Date(q.valid_until).toLocaleString('en-IN')}</small>}{q.accepted_order_id&&<small>Order {q.accepted_order_id.slice(0,12)}</small>}</div>{q.state==='PROPOSED'&&canWrite&&<div className="fp-customer-actions"><button disabled={busy} onClick={()=>void acceptQuote(q)}>Accept quote</button><button disabled={busy} onClick={()=>void rejectQuote(q)}>Decline</button></div>}</article>):<p>No quote requests yet.</p>}</section><section className="fp-customer-wallet"><div><span>LOYALTY WALLET</span><h3>Rewards balance</h3><strong>{wallet?.programActive?wallet.balancePoints.toLocaleString('en-IN')+' points':'Not enrolled yet'}</strong><p>{wallet?.programActive?'Points are earned after successful delivery. Programme redemption rules are controlled by FreshPrep.':'A rewards programme has not been activated for this supplier.'}</p></div>{wallet?.entries?.length>0&&<div className="fp-customer-wallet-ledger">{wallet.entries.slice(0,4).map((entry,index)=><article key={index}><b>{entry.entry_type.replaceAll('_',' ')}</b><span>{entry.points_delta>0?'+':''}{entry.points_delta} pts</span><small>{entry.note||new Date(entry.created_at).toLocaleDateString('en-IN')}</small></article>)}</div>}</section>
 <section className="fp-customer-support"><h3>Support, complaints & returns</h3>
 {canWrite&&<div className="fp-customer-support-form">
  <label>Order<select value={supportOrder} onChange={e=>setSupportOrder(e.target.value)}><option value="">Choose an order</option>{orders.map(o=><option key={o.id} value={o.id}>{o.id.slice(0,12)} · {o.delivery_date} · {o.state}</option>)}</select></label>
  <label>Issue type<select value={supportCategory} onChange={e=>setSupportCategory(e.target.value)}>{[['QUALITY','Quality concern'],['SHORTAGE','Missing / short quantity'],['WRONG_ITEM','Wrong item'],['LATE_DELIVERY','Late delivery'],['PACKAGING','Packaging issue'],['BILLING','Billing query'],['RETURN_REQUEST','Return request'],['OTHER','Other']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
  <label>Describe the issue<textarea rows={3} maxLength={4000} value={supportDescription} onChange={e=>setSupportDescription(e.target.value)} placeholder="Please include the item, quantity and what went wrong…"/></label>
  <label>Requested resolution (optional)<input value={supportResolution} maxLength={1000} onChange={e=>setSupportResolution(e.target.value)} placeholder="Replacement, account credit, clarification…"/></label>
  <button type="button" disabled={busy||!supportOrder||supportDescription.trim().length<10} onClick={()=>void createSupportCase()}>{busy?'Submitting…':'Submit support request'}</button>
 </div>}
 <div className="fp-customer-support-list">{supportCases.length?supportCases.map(sc=><article key={sc.id}><div><b>Case #{sc.case_number} · {sc.category.replaceAll('_',' ')}</b><span>{sc.state.replaceAll('_',' ')}</span><p>{sc.description}</p>{sc.resolution_note&&<small>Resolution: {sc.resolution_note}</small>}<small>Order {sc.order_id.slice(0,12)} · {new Date(sc.created_at).toLocaleString('en-IN')}</small></div></article>):<p>No support cases yet.</p>}</div>
 </section></div>:
 <div className="fp-customer-order"><section className="fp-customer-products"><div className="fp-customer-filter"><div><h3>Prepared vegetables</h3><p>{visible.length} fresh-cut options · prices shown per kilogram</p></div><input type="search" aria-label="Search the catalogue" placeholder="Search vegetable, cut or size…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
 <div className="fp-customer-grid">{visible.map(p=><article key={p.id}><ProductPhoto item={p}/><div className="fp-product-info"><strong>{p.vegetable}</strong><small>{p.preparation.toLowerCase()} · {p.size_kind==='numeric'?p.size_number+' '+p.size_unit:p.size_label}</small><b>{money(p.price_paise_per_kg)}<em>/kg</em></b></div>{canWrite&&<div className="fp-customer-qty"><button onClick={()=>change(p,-1)} aria-label={'Reduce '+p.vegetable}>−</button><span>{((basket[p.id]||0)/1000).toFixed(2)} kg</span><button onClick={()=>change(p,1)} aria-label={'Increase '+p.vegetable}>+</button></div>}</article>)}{visible.length===0&&<div className="fp-emptystate"><strong>{products.length===0?'Your catalogue is being prepared':'No matching preparations'}</strong><p>{products.length===0?'The kitchen catalogue is empty. Ask your account manager to publish products.':'Try a different vegetable, cut or size.'}</p></div>}</div>
 </section><aside className="fp-customer-checkout"><div className="fp-checkout-heading"><span>YOUR ORDER</span><h3>{view==='Recurring'?'Schedule deliveries':'Delivery details'}</h3></div><label>Kitchen<select value={kitchen} onChange={e=>{setKitchen(e.target.value);setSlot('');setPromotion(null);setPromotionMessage('');setLoyaltyPointsToRedeem('')}}><option value="">Choose kitchen</option>{kitchens.map(k=><option key={k.id} value={k.id}>{k.name}</option>)}</select></label>
 <label>{view==='Recurring'?'Start date':'Delivery date'}<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Delivery window<select value={slot} onChange={e=>setSlot(e.target.value)}><option value="">Select a slot</option>{suitable.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
 {view==='Recurring'&&<><label>Frequency<select value={frequency} onChange={e=>setFrequency(e.target.value as 'DAILY'|'WEEKLY')}><option value="DAILY">Daily</option><option value="WEEKLY">Selected weekdays</option></select></label>
 {frequency==='WEEKLY'&&<div className="fp-customer-days">{dayNames.map((n,i)=><button className={weekdays.includes(i)?'selected':''} key={n} onClick={()=>setWeekdays(old=>old.includes(i)?old.filter(x=>x!==i):[...old,i])}>{n}</button>)}</div>}</>}
 {view==='Order'&&canWrite&&wallet?.programActive&&<div className="fp-customer-promotion">
  <label>Redeem loyalty points <input type="number" min={wallet.minimumRedeemPoints||1} max={wallet.balancePoints} step="1" value={loyaltyPointsToRedeem} onChange={e=>setLoyaltyPointsToRedeem(e.target.value)} placeholder={'Available '+wallet.balancePoints+' points'}/></label>
  <small>{wallet.balancePoints} points available · {wallet.paisePerPoint?money(wallet.paisePerPoint)+' value per point':''}. Redemption limits are checked again by the order service.</small>
 </div>}
 {view==='Order'&&canWrite&&<div className="fp-customer-promotion">
  <label>Offer code<input value={promotionCode} onChange={e=>{setPromotionCode(e.target.value.toUpperCase());setPromotion(null);setPromotionMessage('')}} placeholder="Enter coupon code" maxLength={32}/></label>
  <button type="button" disabled={busy||!promotionCode.trim()||!kitchen} onClick={()=>void applyPromotion()}>{busy?'Checking…':'Apply offer'}</button>
  {promotionMessage&&<small role="status">{promotionMessage}</small>}
 </div>}
 <div className="fp-customer-total"><span>Selected products</span><b>{selected.length}</b></div><div className="fp-customer-total"><span>Product subtotal</span><b>{money(subtotal)}</b></div><div className="fp-customer-total"><span>Contract delivery fee</span><b>{money(deliveryFee)}</b></div>{promotionDiscount>0&&<div className="fp-customer-total"><span>Offer discount</span><b>−{money(promotionDiscount)}</b></div>}{loyaltyDiscountPaise>0&&<div className="fp-customer-total"><span>Loyalty points</span><b>−{money(loyaltyDiscountPaise)}</b></div>}<div className="fp-customer-total grand"><span>Estimated total incl. delivery</span><b>{money(total)}</b></div>
  {canWrite&&<button className="fp-customer-submit" disabled={busy} onClick={()=>void submit(view==='Recurring')}>{busy?'Processing…':view==='Recurring'?'Create recurring schedule':'Confirm order'}</button>}
  {canRequestQuote&&view==='Order'&&<button className="fp-customer-quote-button" type="button" disabled={busy||!selected.length} onClick={()=>void requestQuote()}>{busy?'Submitting…':'Request a quote'}</button>}
 <small>Prices are indicative until confirmed. Slot capacity and booking cutoff are checked before your order is accepted. Recurring orders are generated before each cutoff by operations.</small></aside></div>}
 </div>;
}
