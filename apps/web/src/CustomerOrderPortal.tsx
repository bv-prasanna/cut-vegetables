import React,{useCallback,useEffect,useMemo,useState} from 'react';
import './secure-orders.css';
type Role={roles:string[]};
type Kitchen={id:string;name:string;zone_code:string;address:string};
type Slot={id:string;zone_code:string;label:string;start_minute:number;
 cutoff_day_offset:number;cutoff_minute:number;capacity_orders:number};
type Product={id:string;vegetable:string;preparation:string;sku:string;
 size_kind:string;size_number:string|null;size_unit:string|null;size_label:string|null;
 price_paise_per_kg:number;minimum_grams:number;increment_grams:number;image_url:string};
type Order={id:string;kitchen_id:string;slot_id:string;delivery_date:string;state:string;created_at:string};
type Schedule={id:string;kitchen_id:string;slot_id:string;frequency:string;weekdays:number[];start_date:string;end_date:string|null;state:string};
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
export default function CustomerOrderPortal({token,base,roles,onLogout}:Props){
 const canWrite=roles.includes('SUPERADMIN')||roles.includes('CUSTOMER_BUYER')||roles.includes('CUSTOMER_ADMIN');
 const [products,setProducts]=useState<Product[]>([]),[kitchens,setKitchens]=useState<Kitchen[]>([]),[slots,setSlots]=useState<Slot[]>([]);
 const [orders,setOrders]=useState<Order[]>([]),[schedules,setSchedules]=useState<Schedule[]>([]);
 const [view,setView]=useState<'Order'|'Recurring'|'History'>('Order');
 const [search,setSearch]=useState(''),[basket,setBasket]=useState<Record<string,number>>({});
 const [kitchen,setKitchen]=useState(''),[slot,setSlot]=useState(''),[date,setDate]=useState(new Date().toISOString().slice(0,10));
 const [frequency,setFrequency]=useState<'DAILY'|'WEEKLY'>('WEEKLY'),[weekdays,setWeekdays]=useState<number[]>([1,2,3,4,5,6]);
 const [status,setStatus]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const call=useCallback(async<T,>(path:string,method='GET',data?:unknown):Promise<T>=>{
  const res=await fetch(base+path,{
   method,headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},
   body:data?JSON.stringify(data):undefined,cache:'no-store'
  });
  const payload=await res.json().catch(()=>({error:'Unexpected API response'}));
  if(res.status===401){onLogout();throw Error('Session expired. Sign in again.');}
  if(!res.ok)throw Error(payload.error||'Request failed');
  return payload as T;
 },[base,token,onLogout]);
 const refresh=useCallback(async()=>{
  setBusy(true);setError('');
  try{
   const [p,k,s,o,r]=await Promise.all([
    call<Product[]>('/v1/catalog'),call<Kitchen[]>('/v1/kitchens'),call<Slot[]>('/v1/delivery-slots'),
    call<Order[]>('/v1/orders'),call<Schedule[]>('/v1/recurrences')
   ]);
   setProducts(p);setKitchens(k);setSlots(s);setOrders(o);setSchedules(r);
   setKitchen(old=>k.some(x=>x.id===old)?old:k[0]?.id||'');
  }catch(e){setError(e instanceof Error?e.message:'Unable to load ordering');}
  finally{setBusy(false);}
 },[call]);
 useEffect(()=>{void refresh();},[refresh]);
 const visible=useMemo(()=>products.filter(p=>[p.vegetable,p.preparation,p.sku,String(p.size_number||p.size_label)].join(' ').toLowerCase().includes(search.toLowerCase())),[products,search]);
 const selected=useMemo(()=>Object.entries(basket).filter(([,grams])=>grams>0).map(([variantId,grams])=>({variantId,grams})),[basket]);
 const total=selected.reduce((sum,item)=>sum+Math.round((products.find(p=>p.id===item.variantId)?.price_paise_per_kg||0)*item.grams/1000),0);
 const selectedKitchen=kitchens.find(k=>k.id===kitchen);
 const suitable=slots.filter(s=>s.zone_code===selectedKitchen?.zone_code);
 function change(v:Product,delta:1|-1){
  setBasket(old=>{const current=old[v.id]||0;const next=delta===1?(current?current+v.increment_grams:v.minimum_grams):Math.max(0,current-v.increment_grams);return {...old,[v.id]:next};});
 }
 async function submit(recurring:boolean){
  if(!canWrite)return;
  if(!kitchen||!slot||!selected.length){setError('Choose your kitchen, delivery slot and at least one product.');return;}
  if(!suitable.some(s=>s.id===slot)){setError('Delivery slot does not serve selected kitchen.');return;}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){setError('Select a valid delivery date.');return;}
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
    const id=crypto.randomUUID();
    const saved=await call<{id:string}>('/v1/orders','POST',{
     kitchenId:kitchen,slotId:slot,deliveryDate:date,idempotencyKey:id,items:selected,event
    });
    setStatus('Order confirmed: '+saved.id);setBasket({});
   }
   await refresh();setView('History');
  }catch(e){setError(e instanceof Error?e.message:'Unable to save');}
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
 return <div className="fp-customer"><header className="fp-customer-title"><div><span>FRESHPREP BUSINESS ORDERS</span><h2>Your kitchen supply</h2><p>Precision preparation by slot, date and order size.</p></div><button onClick={()=>void refresh()}>↻ Refresh</button></header>
 {error&&<div role="alert" className="fp-customer-error">{error}</div>}
 {status&&<div role="status" className="fp-customer-ok">{status}</div>}
 <nav className="fp-customer-tabs"><button className={view==='Order'?'active':''} onClick={()=>setView('Order')}>One-time order</button><button className={view==='Recurring'?'active':''} onClick={()=>setView('Recurring')}>Recurring supply</button><button className={view==='History'?'active':''} onClick={()=>setView('History')}>Orders & schedules</button></nav>
 {!canWrite&&<p className="fp-customer-info">Your role permits viewing orders but not creating or changing them.</p>}
 {view==='History'?<div className="fp-customer-history"><section><h3>Recent orders</h3>{orders.length?orders.map(o=><article key={o.id}><b>{o.id.slice(0,12)}</b><span>{o.delivery_date}</span><span>{o.state}</span></article>):<p>No orders yet.</p>}</section>
 <section><h3>Recurring schedules</h3>{schedules.length?schedules.map(s=><article key={s.id}><div><b>{s.frequency} · {s.state}</b><p>{s.start_date}{s.end_date?' – '+s.end_date:''}</p><small>{s.id}</small></div>{canWrite&&<div className="fp-customer-actions"><button disabled={busy||s.state==='CANCELLED'} onClick={()=>void setScheduleState(s,s.state==='ACTIVE'?'PAUSED':'ACTIVE')}>{s.state==='ACTIVE'?'Pause':'Resume'}</button><button disabled={busy||s.state==='CANCELLED'} onClick={()=>void skipDate(s)}>Skip selected date</button><button disabled={busy||s.state==='CANCELLED'} onClick={()=>void setScheduleState(s,'CANCELLED')}>Cancel</button></div>}</article>):<p>No recurring schedules.</p>}</section></div>:
 <div className="fp-customer-order"><section className="fp-customer-products"><div className="fp-customer-filter"><h3>Prepared vegetables</h3><input type="search" placeholder="Search vegetable, cut, or size" value={search} onChange={e=>setSearch(e.target.value)}/></div>
 <div className="fp-customer-grid">{visible.map(p=><article key={p.id}><div><strong>{p.vegetable}</strong><small>{p.preparation.toLowerCase()} · {p.size_kind==='numeric'?p.size_number+' '+p.size_unit:p.size_label}</small><b>{money(p.price_paise_per_kg)}/kg</b></div>{canWrite&&<div className="fp-customer-qty"><button onClick={()=>change(p,-1)} aria-label={'Reduce '+p.vegetable}>−</button><span>{((basket[p.id]||0)/1000).toFixed(2)} kg</span><button onClick={()=>change(p,1)} aria-label={'Increase '+p.vegetable}>+</button></div>}</article>)}</div>
 </section><aside className="fp-customer-checkout"><h3>{view==='Recurring'?'Schedule deliveries':'Delivery details'}</h3><label>Kitchen<select value={kitchen} onChange={e=>{setKitchen(e.target.value);setSlot('')}}><option value="">Choose kitchen</option>{kitchens.map(k=><option key={k.id} value={k.id}>{k.name}</option>)}</select></label>
 <label>{view==='Recurring'?'Start date':'Delivery date'}<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Delivery window<select value={slot} onChange={e=>setSlot(e.target.value)}><option value="">Select a slot</option>{suitable.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
 {view==='Recurring'&&<><label>Frequency<select value={frequency} onChange={e=>setFrequency(e.target.value as 'DAILY'|'WEEKLY')}><option value="DAILY">Daily</option><option value="WEEKLY">Selected weekdays</option></select></label>
 {frequency==='WEEKLY'&&<div className="fp-customer-days">{dayNames.map((n,i)=><button className={weekdays.includes(i)?'selected':''} key={n} onClick={()=>setWeekdays(old=>old.includes(i)?old.filter(x=>x!==i):[...old,i])}>{n}</button>)}</div>}</>}
 <div className="fp-customer-total"><span>Selected products</span><b>{selected.length}</b></div><div className="fp-customer-total"><span>Indicative total per delivery</span><b>{money(total)}</b></div>
 {canWrite&&<button className="fp-customer-submit" disabled={busy} onClick={()=>void submit(view==='Recurring')}>{busy?'Processing…':view==='Recurring'?'Create recurring schedule':'Confirm order'}</button>}
 <small>Delivery availability, cut-off and capacity are validated on the server. Schedule generation is an administrator-run operation.</small></aside></div>}
 </div>;
}
