import React,{useEffect,useMemo,useState} from 'react';
import './staff-boards.css';
type Role='CUTTER'|'QC'|'PACKER'|'DISPATCH'|'DELIVERY';
type Slot={id:string;label:string};
type Plan={deliveryDate:string;slotId:string;slotLabel:string;variantId:string;vegetable:string;preparation:string;size:string;grams:number;orderCount:number;startedOrders:number;qcApprovedOrders:number;packedOrders:number};
type PackOrder={orderId:string;deliveryDate:string;slotId:string;slotLabel:string;state:string;totalGrams:number;lines:{variantId:string;description:string;grams:number}[]};
type DeliveryOrder={orderId:string;deliveryDate:string;slotId:string;slotLabel:string;state:string;totalGrams:number};
type Props={slots:Slot[]};
const roles:Role[]=['CUTTER','QC','PACKER','DISPATCH','DELIVERY'];
const nextState:Record<Role,{from:string;to:string;label:string}>={
 CUTTER:{from:'CONFIRMED',to:'IN_PRODUCTION',label:'Start cutting'},
 QC:{from:'IN_PRODUCTION',to:'QC_PASSED',label:'Approve demo QC'},
 PACKER:{from:'QC_PASSED',to:'PACKED',label:'Confirm demo packing'},
 DISPATCH:{from:'PACKED',to:'DISPATCHED',label:'Mark dispatched'},
 DELIVERY:{from:'DISPATCHED',to:'DELIVERED',label:'Confirm demo delivery'}
};
const kg=(grams:number)=>(grams/1000).toLocaleString('en-IN',{maximumFractionDigits:2})+' kg';
async function get<T>(path:string,method='GET',body?:unknown):Promise<T>{
 const response=await fetch('/api'+path,{method,headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
 const result=await response.json().catch(()=>({error:'Unexpected backend response'}));
 if(!response.ok)throw Error(result.error||'Backend request failed');
 return result as T;
}
export default function StaffBoards({slots}:Props){
 const[role,setRole]=useState<Role>('CUTTER'),[date,setDate]=useState(''),[slot,setSlot]=useState(''),[plan,setPlan]=useState<Plan[]>([]),[packing,setPacking]=useState<PackOrder[]>([]),[delivery,setDelivery]=useState<DeliveryOrder[]>([]);
 const[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[selected,setSelected]=useState('');
 async function refresh(){
  setBusy(true);setError('');
  const params=new URLSearchParams();if(date)params.set('date',date);if(slot)params.set('slotId',slot);
  const qs=params.toString()?'?'+params:'';
  try{
   const[p,o,d]=await Promise.all([
    get<Plan[]>('/dev/staff/production'+qs),get<PackOrder[]>('/dev/staff/packing'+qs),get<DeliveryOrder[]>('/dev/staff/delivery'+qs)
   ]);
   setPlan(p);setPacking(o);setDelivery(d);
  }catch(e){setError(e instanceof Error?e.message:'Unable to load staff work queue');}
  finally{setBusy(false);}
 }
 useEffect(()=>{void refresh()},[date,slot]);
 const totalKg=useMemo(()=>plan.reduce((sum,p)=>sum+p.grams,0),[plan]);

 const action=nextState[role];
 const queue=role==='DELIVERY'||role==='DISPATCH'?delivery:packing.map(p=>({...p}));
 async function advance(orderId:string){
  setBusy(true);setMessage('');setError('');
  try{
   const r=await get<{state:string;notice:string}>('/dev/staff/orders/'+encodeURIComponent(orderId)+'/advance','POST',{
    role,nextState:action.to,location:{source:'UNAVAILABLE',unavailableReason:'Desktop local demonstration',consentStatus:'NOT_REQUESTED'}
   });
   setMessage('Order '+orderId.slice(0,8)+' → '+r.state+'. Local demo only; physical processing not verified.');
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Unable to change stage');}
  finally{setBusy(false);}
 }
 const relevantOrders=selected?packing.filter(o=>o.deliveryDate===plan.find(p=>p.variantId===selected)?.deliveryDate &&
   o.lines.some(line=>line.variantId===selected)&&(!slot||o.slotId===slot)):packing;
 return <section className="staff-workspaces">
 <header className="staff-heading"><div><span className="staff-kicker">FRESHPREP · OPERATIONS</span><h1>Daily Production & Fulfilment</h1><p>Slot-wise cutting requirements, order-wise packing and delivery handover.</p></div><button onClick={()=>void refresh()} disabled={busy}>↻ Refresh board</button></header>
 <div className="staff-warning" role="note"><strong>Local demonstration:</strong> The status buttons below simulate staff steps without verified login, physical QC, measured packing or GPS proof. The PostgreSQL operational APIs require authenticated roles and database records.</div>
 {error&&<div className="staff-error" role="alert">{error}</div>}{message&&<div className="staff-success" role="status">{message}</div>}
 <nav className="staff-roles" aria-label="Role-specific operational dashboards">{roles.map(r=><button className={role===r?'active':''} key={r} onClick={()=>{setRole(r);setSelected('')}}>{r==='CUTTER'?'🔪 Cutter':r==='PACKER'?'📦 Packing':r==='DELIVERY'?'🚚 Driver':r==='DISPATCH'?'📋 Dispatch':'✅ QC'}</button>)}</nav>
 <div className="staff-filters"><label>Delivery date<input type="date" value={date} onChange={e=>{setDate(e.target.value);setSelected('')}}/></label><button className="staff-small" onClick={()=>{setDate('');setSlot('')}}>All dates / slots</button><label>Delivery slot<select value={slot} onChange={e=>setSlot(e.target.value)}><option value="">All slots consolidated</option>{slots.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label><span>{busy?'Updating…':role==='CUTTER'?plan.length+' preparation groups':queue.length+' orders in queue'}</span></div>
 {role==='CUTTER'&&<><div className="staff-summary"><article><small>Vegetable preparation groups</small><strong>{plan.length}</strong></article><article><small>Total preparation required</small><strong>{kg(totalKg)}</strong></article><article><small>Customer orders</small><strong>{new Set(packing.map(o=>o.orderId)).size}</strong></article><article><small>Delivery slots</small><strong>{new Set(plan.map(p=>p.slotId+'|'+p.deliveryDate)).size}</strong></article></div>
 <div className="staff-panel"><h2>Consolidated Cutting Plan</h2><p>Each line combines all accepted customer orders for the same delivery date, slot, vegetable, preparation and exact size. Cancelled orders are excluded.</p>
 <div className="staff-table-wrap"><table><thead><tr><th>Delivery date</th><th>Delivery window</th><th>Vegetable</th><th>Preparation</th><th>Size</th><th>Required</th><th>Orders</th><th>In progress</th><th>Details</th></tr></thead><tbody>{plan.map(p=><tr key={p.deliveryDate+p.slotId+p.variantId}><td>{p.deliveryDate}</td><td>{p.slotLabel}</td><td><b>{p.vegetable}</b></td><td>{p.preparation}</td><td>{p.size}</td><td><strong>{kg(p.grams)}</strong></td><td>{p.orderCount}</td><td>{p.startedOrders}</td><td><button className="staff-small" onClick={()=>setSelected(old=>old===p.variantId?'':p.variantId)}>Orders</button></td></tr>)}</tbody></table></div>{!plan.length&&<p className="staff-empty">No orders have been placed for the selected delivery date and window.</p>}
 </div></>}
 <div className="staff-panel"><h2>{role==='CUTTER'?'Order Drill-down':role==='QC'?'QC Review Queue':role==='PACKER'?'Order-wise Packing Queue':role==='DISPATCH'?'Ready-to-Dispatch Orders':'Delivery & Handover Queue'}</h2>
 <p>{role==='PACKER'?'Each order lists its precise products, preparation sizes and required packed weights. The real service calculates readiness from QC-approved batches and packed units.':role==='DELIVERY'?'Demo orders appear here; the authenticated driver dashboard shows only assigned runs and stops.':role==='CUTTER'?'Start cutting for individual orders after reviewing consolidated demand.':'Status updates are controlled by the prior workflow stage.'}</p>
 <div className="staff-orders">{(role==='CUTTER'?relevantOrders:queue).map(o=><article className="staff-order" key={o.orderId}><div className="staff-order-title"><div><b>Order {o.orderId.slice(0,10)}</b><small>{o.deliveryDate} · {o.slotLabel}</small></div><span className={'staff-status '+o.state.toLowerCase()}>{o.state.replaceAll('_',' ')}</span></div>
 {'lines' in o&&Array.isArray(o.lines)?<div className="staff-order-lines">{o.lines.map(line=><div key={line.variantId}><span>{line.description}</span><b>{kg(line.grams)}</b></div>)}</div>:<div className="staff-order-lines"><div><span>Required delivery</span><b>{kg(o.totalGrams)}</b></div></div>}
 <div className="staff-order-actions"><span>{kg(o.totalGrams)} total</span>{o.state===action.from?<button disabled={busy} onClick={()=>void advance(o.orderId)}>{action.label}</button>:<small>{o.state===action.to?'Step recorded':'Waiting for previous step'}</small>}</div></article>)}</div>
 {!(role==='CUTTER'?relevantOrders:queue).length&&<p className="staff-empty">No orders to show for this selection.</p>}
 </div>
 </section>;
}
