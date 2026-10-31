import React,{useEffect,useState} from 'react';
type Vegetable={id:string;name:string;active:boolean};
type Variant={id:string;sku:string;vegetable_id:string;vegetable:string;method_code:string;size_kind:string;
 size_number:string|null;size_unit:string|null;size_label:string|null;price_paise_per_kg:number;
 minimum_grams:number;increment_grams:number;image_url:string;active:boolean};
type DeliverySlot={id:string;zone_code:string;label:string;start_minute:number;end_minute:number;
 cutoff_day_offset:number;cutoff_minute:number;capacity_orders:number;active:boolean};
type Props={base:string;token:string;superadmin:boolean;mode:'Catalogue'|'Slots'};
const money=(value:number)=>'₹'+(value/100).toFixed(2);
async function api<T>(base:string,token:string,path:string,method='GET',data?:unknown):Promise<T>{
 const r=await fetch(base+path,{method,headers:{
  Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})
 },body:data?JSON.stringify(data):undefined,cache:'no-store'});
 const v=await r.json().catch(()=>({error:'Unexpected response'}));
 if(!r.ok)throw Error(v.error||'Request rejected');
 return v as T;
}
export default function CatalogAdmin({base,token,superadmin,mode}:Props){
 const[vegetables,setVegetables]=useState<Vegetable[]>([]),[variants,setVariants]=useState<Variant[]>([]),[slots,setSlots]=useState<DeliverySlot[]>([]);
 const[vegetableName,setVegetableName]=useState(''),[vegetableId,setVegetableId]=useState('');
 const[sku,setSku]=useState(''),[method,setMethod]=useState('DICED');
 const[sizeKind,setSizeKind]=useState<'numeric'|'label'>('numeric'),[sizeValue,setSizeValue]=useState('10'),[unit,setUnit]=useState('mm');
 const[imageUrl,setImageUrl]=useState('https://images.unsplash.com/photo-1540420773420-3366772f4999');
 const[price,setPrice]=useState('50'),[minGrams,setMinGrams]=useState('500'),[increment,setIncrement]=useState('250');
 const[zone,setZone]=useState('BENGALURU'),[label,setLabel]=useState('Morning 5 AM - 8 AM');
 const[start,setStart]=useState('300'),[end,setEnd]=useState('480'),[cutoffDay,setCutoffDay]=useState('1'),[cutoffAt,setCutoffAt]=useState('1380'),[capacity,setCapacity]=useState('50');
 const[search,setSearch]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function refresh(){
  setBusy(true);
  try{
   if(mode==='Catalogue'){
    const [v,p]=await Promise.all([api<Vegetable[]>(base,token,'/v1/admin/vegetables'),api<Variant[]>(base,token,'/v1/admin/variants')]);
    setVegetables(v);setVariants(p);setVegetableId(prev=>prev||v[0]?.id||'');
   }else setSlots(await api<DeliverySlot[]>(base,token,'/v1/admin/slots'));
   setError('');
  }catch(e){setError(e instanceof Error?e.message:'Unable to load catalogue');}
  finally{setBusy(false);}
 }
 useEffect(()=>{void refresh()},[mode,base,token]);
 async function perform(fn:()=>Promise<unknown>,success:string){
  setBusy(true);setError('');setMessage('');
  try{await fn();setMessage(success);await refresh();}
  catch(e){setError(e instanceof Error?e.message:'Action rejected');}
  finally{setBusy(false);}
 }
 const productSize=sizeKind==='numeric'?{kind:'numeric',value:Number(sizeValue),unit}:{kind:'label',value:sizeValue};
 return <section className="fp-secure-card"><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><div><h3>{mode==='Catalogue'?'Product Master':'Delivery Windows'}</h3><p>{mode==='Catalogue'?'Manage vegetables and exact preparation variants.':'Configure windows, booking cutoff and capacity.'}</p></div><button onClick={()=>void refresh()}>↻ Refresh</button></div>
 {!superadmin&&<p className="fp-notice">Read-only. Shared catalogue and slot changes require Super Admin.</p>}
 {error&&<p role="alert" className="fp-error">{error}</p>}{message&&<p role="status" className="fp-notice">{message}</p>}
 {mode==='Catalogue'&&<><div className="fp-secure-split" style={{margin:'18px 0'}}>
 <section className="fp-secure-card"><h3>Vegetable master</h3><label>New vegetable name<input value={vegetableName} onChange={e=>setVegetableName(e.target.value)}/></label>
 {superadmin&&<button disabled={busy} onClick={()=>void perform(async()=>{
  await api(base,token,'/v1/admin/vegetables','POST',{name:vegetableName});
  setVegetableName('');
 },'Vegetable added')}>Add vegetable</button>}
 <div style={{maxHeight:260,overflow:'auto'}}>{vegetables.map(v=><div className="fp-secure-line" key={v.id}><strong>{v.name}</strong><span>{v.active?'Active':'Inactive'}</span></div>)}</div>
 </section>
 <section className="fp-secure-card"><h3>New preparation variant</h3><label>Vegetable<select value={vegetableId} onChange={e=>setVegetableId(e.target.value)}>{vegetables.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
 <label>SKU (unique)<input value={sku} onChange={e=>setSku(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,''))}/></label>
 <label>Preparation<select value={method} onChange={e=>setMethod(e.target.value)}>{['DICED','CHOPPED','SLICED','GRATED','SHREDDED','JULIENNE','PEELED'].map(x=><option key={x}>{x}</option>)}</select></label>
 <label>Size kind<select value={sizeKind} onChange={e=>{setSizeKind(e.target.value as 'numeric'|'label');setSizeValue(e.target.value==='numeric'?'10':'fine')}}><option value="numeric">Numeric dimension</option><option value="label">Fine/coarse/thin/thick</option></select></label>
 <label>Size {sizeKind==='numeric'?<input type="number" value={sizeValue} onChange={e=>setSizeValue(e.target.value)} min={0.1} step={0.5}/>:<select value={sizeValue} onChange={e=>setSizeValue(e.target.value)}>{['fine','medium','coarse','thin','thick'].map(x=><option key={x}>{x}</option>)}</select>}</label>
 {sizeKind==='numeric'&&<label>Unit<select value={unit} onChange={e=>setUnit(e.target.value)}><option value="mm">mm</option><option value="cm">cm</option></select></label>}
 <label>Photo URL<input type="url" value={imageUrl} onChange={e=>setImageUrl(e.target.value)}/></label>
 <label>Price per kg (₹)<input type="number" value={price} onChange={e=>setPrice(e.target.value)} min="0"/></label>
 <label>Minimum grams<input type="number" value={minGrams} onChange={e=>setMinGrams(e.target.value)} min="1"/></label>
 <label>Quantity increment grams<input type="number" value={increment} onChange={e=>setIncrement(e.target.value)} min="1"/></label>
 {superadmin&&<button disabled={busy} onClick={()=>void perform(()=>api(base,token,'/v1/admin/variants','POST',{
  vegetableId,sku,methodCode:method,size:productSize,imageUrl,
  pricePaisePerKg:Math.round(Number(price)*100),minimumGrams:Number(minGrams),incrementGrams:Number(increment)
 }), 'SKU created')}>Create product variant</button>}</section></div>
 <div className="fp-customer-filter"><h3>Existing variants ({variants.length})</h3><input placeholder="Search SKU or vegetable" value={search} onChange={e=>setSearch(e.target.value)}/></div>
 <div className="fp-secure-table"><table><thead><tr><th>Vegetable</th><th>Preparation</th><th>SKU</th><th>Price</th><th>Active</th><th>Action</th></tr></thead><tbody>{variants.filter(v=>(v.sku+' '+v.vegetable).toLowerCase().includes(search.toLowerCase())).map(v=><tr key={v.id}><td>{v.vegetable}</td><td>{v.method_code} · {v.size_kind==='numeric'?v.size_number+' '+v.size_unit:v.size_label}</td><td>{v.sku}</td><td>{money(v.price_paise_per_kg)}</td><td>{v.active?'Yes':'No'}</td><td>{superadmin&&<button disabled={busy} onClick={()=>void perform(()=>api(base,token,'/v1/admin/variants/'+v.id,'PATCH',{active:!v.active}),v.sku+' updated')}>{v.active?'Disable':'Activate'}</button>}</td></tr>)}</tbody></table></div></>}
 {mode==='Slots'&&<><div className="fp-secure-split" style={{margin:'18px 0'}}><section className="fp-secure-card"><h3>Create delivery window</h3>
 <label>Service zone<input value={zone} onChange={e=>setZone(e.target.value)}/></label>
 <label>Window label<input value={label} onChange={e=>setLabel(e.target.value)}/></label>
 <label>Start minute after midnight<input type="number" min="0" max="1439" value={start} onChange={e=>setStart(e.target.value)}/></label>
 <label>End minute after midnight<input type="number" min="1" max="1440" value={end} onChange={e=>setEnd(e.target.value)}/></label>
 <label>Cutoff day offset<input type="number" min="0" max="7" value={cutoffDay} onChange={e=>setCutoffDay(e.target.value)}/></label>
 <label>Cutoff minute<input type="number" min="0" max="1439" value={cutoffAt} onChange={e=>setCutoffAt(e.target.value)}/></label>
 <label>Daily capacity<input type="number" min="1" value={capacity} onChange={e=>setCapacity(e.target.value)}/></label>
 {superadmin&&<button disabled={busy} onClick={()=>void perform(()=>api(base,token,'/v1/admin/slots','POST',{
  zoneCode:zone,label,startMinute:Number(start),endMinute:Number(end),
  cutoffDayOffset:Number(cutoffDay),cutoffMinute:Number(cutoffAt),capacityOrders:Number(capacity)
 }), 'Delivery window created')}>Create slot</button>}</section>
 <section className="fp-secure-card"><h3>Configured delivery windows</h3>{slots.map(s=><div className="fp-secure-line" key={s.id}>
 <div><strong>{s.zone_code} · {s.label}</strong><p>Cutoff: {s.cutoff_day_offset} days before, minute {s.cutoff_minute} · Capacity {s.capacity_orders}</p></div>
 {superadmin&&<button disabled={busy} onClick={()=>void perform(()=>api(base,token,'/v1/admin/slots/'+s.id,'PATCH',{active:!s.active}),s.label+' updated')}>{s.active?'Suspend':'Activate'}</button>}</div>)}</section></div></>}
 </section>;
}
