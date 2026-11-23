import React,{useCallback,useEffect,useState} from 'react';
import {apiRequest,FriendlyApiError} from './api-errors';
type Case={id:string;case_number:number|string;order_id:string;buyer_organization_id?:string;kitchen_id?:string;category:string;description:string;requested_resolution:string|null;state:string;resolution_note:string|null;resolution_type?:string|null;created_at:string;updated_at:string};
type Props={base:string;token:string;canResolve:boolean;onSessionExpired:()=>void};
export default function SupportAdmin({base,token,canResolve,onSessionExpired}:Props){
 const [cases,setCases]=useState<Case[]>([]),[notes,setNotes]=useState<Record<string,string>>({}),[resolutionTypes,setResolutionTypes]=useState<Record<string,string>>({});
 const [filter,setFilter]=useState('OPEN'),[loading,setLoading]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const call=useCallback(async<T,>(path:string,method='GET',payload?:unknown):Promise<T>=>{
  try{return await apiRequest<T>(base,path,{token,method,payload});}
  catch(e){if(e instanceof FriendlyApiError&&e.status===401)onSessionExpired();throw e;}
 },[base,token,onSessionExpired]);
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{setCases(await call<Case[]>('/v1/support/cases'));}
  catch(e){setError(e instanceof Error?e.message:'Unable to load support cases');}
  finally{setLoading(false);}
 },[call]);
 useEffect(()=>{void load();},[load]);
 async function update(item:Case,state:'IN_REVIEW'|'WAITING_CUSTOMER'|'RESOLVED'|'REJECTED'|'CLOSED'){
  const note=(notes[item.id]||'').trim();
  if(['RESOLVED','REJECTED'].includes(state)&&note.length<5){setError('Add a resolution note of at least 5 characters before closing this case.');return;}
  const resolutionType=resolutionTypes[item.id];
  if(state==='RESOLVED'&&!resolutionType){setError('Select a resolution outcome before resolving this case.');return;}
  setBusy(item.id);setError('');setNotice('');
  try{await call('/v1/support/cases/'+item.id,'PATCH',{state,resolutionNote:note||undefined,resolutionType:state==='RESOLVED'?resolutionType:undefined});
   setNotice('Case #'+item.case_number+' updated to '+state.replaceAll('_',' ').toLowerCase()+'.');await load();
  }catch(e){setError(e instanceof Error?e.message:'Unable to update support case');}
  finally{setBusy('');}
 }
 const filtered=cases.filter(x=>filter==='ALL'||x.state===filter);
 return <section className="fp-secure-card fp-support-admin">
  <div className="fp-ops-heading"><div><span className="fp-secure-kicker">CUSTOMER CARE</span><h3>Complaints, shortages & returns</h3><p>Supplier-side case queue. Buyer and producer access is enforced by the API; every decision is audited.</p></div><button type="button" onClick={()=>void load()} disabled={loading||!!busy}>{loading?'Loading…':'Refresh cases'}</button></div>
  {error&&<p role="alert" className="fp-error">{error}</p>}{notice&&<p role="status" className="fp-notice">{notice}</p>}
  <div className="fp-support-filters"><label>Case status<select value={filter} onChange={e=>setFilter(e.target.value)}>{['OPEN','IN_REVIEW','WAITING_CUSTOMER','RESOLVED','REJECTED','CLOSED','ALL'].map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select></label><span>{filtered.length} case{filtered.length===1?'':'s'}</span></div>
  <div className="fp-support-case-list">{filtered.map(item=><article key={item.id}>
   <header><div><strong>Case #{item.case_number} · {item.category.replaceAll('_',' ')}</strong><small>Order {item.order_id.slice(0,12)} · {new Date(item.created_at).toLocaleString('en-IN')}</small></div><span className={'fp-support-state state-'+item.state.toLowerCase()}>{item.state.replaceAll('_',' ')}</span></header>
   <p>{item.description}</p>{item.requested_resolution&&<p><b>Buyer request:</b> {item.requested_resolution}</p>}
   {item.resolution_note&&<p className="fp-support-resolution"><b>Decision:</b> {item.resolution_note}</p>}
   {canResolve&&!['RESOLVED','REJECTED','CLOSED'].includes(item.state)&&<div className="fp-support-decision">
    <label>Resolution outcome<select value={resolutionTypes[item.id]||''} onChange={e=>setResolutionTypes(old=>({...old,[item.id]:e.target.value}))}><option value="">Select outcome</option><option value="RESUPPLY">Resupply missing items</option><option value="REPLACEMENT">Replacement</option><option value="CREDIT_NOTE">Credit note</option><option value="REFUND">Refund</option><option value="NO_ACTION">No further action</option></select></label>
    <label>Internal / customer-facing decision note<textarea rows={2} value={notes[item.id]||''} onChange={e=>setNotes(old=>({...old,[item.id]:e.target.value}))} maxLength={2000} placeholder="Record the investigation, replacement, credit or reason…"/></label>
    <div>{item.state==='OPEN'&&<button disabled={!!busy} onClick={()=>void update(item,'IN_REVIEW')}>Start review</button>}
     <button disabled={!!busy} onClick={()=>void update(item,'WAITING_CUSTOMER')}>Await customer</button>
     <button disabled={!!busy} onClick={()=>void update(item,'RESOLVED')}>Resolve</button>
     <button disabled={!!busy} className="secondary" onClick={()=>void update(item,'REJECTED')}>Reject</button></div>
   </div>}
  </article>)}{!filtered.length&&<div className="fp-emptystate"><strong>{loading?'Loading cases…':'No cases in this view'}</strong><p>New customer complaints and return requests will appear here.</p></div>}</div>
 </section>;
}
