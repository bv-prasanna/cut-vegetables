import React,{useState} from 'react';
import './secure-portal.css';
import CustomerOrderPortal from './CustomerOrderPortal';
import CatalogAdmin from './CatalogAdmin';
import AdminInsights from './AdminInsights';
import {apiRequest,FriendlyApiError} from './api-errors';
type Session={accessToken:string;tokenType:string;expiresInSeconds:number};
type Profile={userId:string;organizationId:string;roles:string[]};
type Overview={staff:number;activeKitchens:number;ordersByState:{state:string;count:number}[]};
type Staff={id:string;email:string;roles:string[];active:boolean};
type Kitchen={kitchen_id:string;kitchen_name:string;organization_name:string;address:string;zone_code:string};
type Task={delivery_date?:string;deliveryDate?:string;slot_label?:string;slotLabel?:string;vegetable?:string;preparation?:string;size?:string;required_grams?:number;order_count?:number;state?:string;order_id?:string;
 id?:string;received_grams?:number;usable_grams?:number;rejected_grams?:number;input_grams?:number;output_grams?:number;waste_grams?:number;supplier_lot?:string;};
const BASE=(import.meta.env.VITE_API_BASE_URL||'/api').replace(/\/$/,'');
async function request<T>(path:string,token?:string,method='GET',payload?:unknown):Promise<T>{
 return apiRequest<T>(BASE,path,{token,method,payload});
}
const allowedRoles=['ADMIN','SALES','PROCUREMENT','STORE','OPERATOR','PRODUCTION_SUPERVISOR','QC','PACKER','DISPATCH','DRIVER','FINANCE','MARKETING','AUDITOR'];
export default function SecurePortal({onHome}:{onHome:()=>void}){
 const[email,setEmail]=useState(''),[password,setPassword]=useState(''),[organizationId,setOrganizationId]=useState('');
 const[session,setSession]=useState<Session|null>(null),[profile,setProfile]=useState<Profile|null>(null);
 const[overview,setOverview]=useState<Overview|null>(null),[staff,setStaff]=useState<Staff[]>([]),[kitchens,setKitchens]=useState<Kitchen[]>([]);
 const[tasks,setTasks]=useState<Task[]>([]),[boardDate,setBoardDate]=useState(new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}));
 const[tab,setTab]=useState<'Overview'|'Supply'|'Staff'|'Customers'|'Catalogue'|'Slots'|'Procurement'|'Cutting'|'Quality'|'Packing'|'Delivery'>('Overview');
 const[generationDate,setGenerationDate]=useState(new Date(Date.now()+86_400_000).toISOString().slice(0,10));
 const[generationSummary,setGenerationSummary]=useState<Record<string,number>|null>(null);
 const[staffEmail,setStaffEmail]=useState(''),[staffPassword,setStaffPassword]=useState(''),[staffRole,setStaffRole]=useState('OPERATOR');
 const[orgName,setOrgName]=useState(''),[contactEmail,setContactEmail]=useState(''),[contactPassword,setContactPassword]=useState(''),[kitchenName,setKitchenName]=useState(''),[address,setAddress]=useState(''),[zoneCode,setZoneCode]=useState('BENGALURU_DEMO');
 const[message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const canAdmin=profile?.roles.some(r=>r==='SUPERADMIN'||r==='ADMIN')??false;
 const canCustomer=profile?.roles.some(r=>['CUSTOMER_ADMIN','CUSTOMER_BUYER','CUSTOMER_VIEWER'].includes(r))??false;
 const canProcure=profile?.roles.some(r=>['SUPERADMIN','PROCUREMENT','STORE'].includes(r))??false;
 const canQC=profile?.roles.some(r=>['SUPERADMIN','QC','PRODUCTION_SUPERVISOR'].includes(r))??false;
 const canCut=profile?.roles.some(r=>['SUPERADMIN','ADMIN','OPERATOR','PRODUCTION_SUPERVISOR','STORE'].includes(r))??false;
 const canPack=profile?.roles.some(r=>['SUPERADMIN','PACKER'].includes(r))??false;
 const canDeliver=profile?.roles.some(r=>['SUPERADMIN','DISPATCH','DRIVER'].includes(r))??false;
 async function login(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError('');
  try{
   const result=await request<Session>('/auth/login',undefined,'POST',{email:email.trim(),password,organizationId:organizationId.trim()});
   const me=await request<Profile>('/v1/me',result.accessToken);
   setSession(result);setProfile(me);setPassword('');
   const preferred=me.roles.some(r=>['CUSTOMER_ADMIN','CUSTOMER_BUYER','CUSTOMER_VIEWER'].includes(r))?'Supply':
    me.roles.includes('PROCUREMENT')||me.roles.includes('STORE')?'Procurement':
    me.roles.includes('QC')?'Quality':me.roles.includes('OPERATOR')||me.roles.includes('PRODUCTION_SUPERVISOR')?'Cutting':
    me.roles.includes('PACKER')?'Packing':me.roles.includes('DRIVER')||me.roles.includes('DISPATCH')?'Delivery':'Overview';
   setTab(preferred);
   if(['Procurement','Cutting','Quality','Packing','Delivery'].includes(preferred)){
    const path=preferred==='Cutting'?'/v1/ops/production-plan':
     preferred==='Packing'?'/v1/ops/packing-board':
     preferred==='Delivery'?'/v1/ops/delivery-board':
     preferred==='Quality'?'/v1/ops/batches':'/v1/ops/raw-lots';
    try{
     const suffix=['Procurement','Quality'].includes(preferred)?'':'?date='+encodeURIComponent(boardDate);
     setTasks(await request<Task[]>(path+suffix,result.accessToken));
    }catch{setError('Signed in, but your work queue could not be loaded. Use Refresh board to retry.');}
   }
   setMessage('Signed in. JWT expires after '+Math.round(result.expiresInSeconds/60)+' minutes.');
   if(me.roles.includes('SUPERADMIN')||me.roles.includes('ADMIN')){
    try{await reloadAdmin(result.accessToken);}
    catch{setError('Signed in successfully, but dashboard data could not be loaded. Refresh the workspace to retry.');}
   }
  }catch(e){setError(e instanceof Error?e.message:'Unable to sign in');setSession(null);setProfile(null);}
  finally{setBusy(false);}
 }
 async function logout(){
  const token=session?.accessToken;setSession(null);setProfile(null);setOverview(null);setStaff([]);setKitchens([]);setTasks([]);
  setMessage('Signed out.');setError('');
  if(token)await request('/v1/logout',token,'POST').catch(()=>{});
 }
 async function reloadAdmin(token:string){
  const[o,s,k]=await Promise.all([
   request<Overview>('/v1/admin/overview',token),
   request<Staff[]>('/v1/admin/staff',token),
   request<Kitchen[]>('/v1/admin/customers',token)
  ]);
  setOverview(o);setStaff(s);setKitchens(k);
 }
 async function run(task:()=>Promise<unknown>,success:string){
  setBusy(true);setError('');setMessage('');
  try{await task();setMessage(success);if(session&&canAdmin)await reloadAdmin(session.accessToken);}
  catch(e){
   if(e instanceof FriendlyApiError&&e.status===401){setSession(null);setProfile(null);setMessage('');}
   setError(e instanceof Error?e.message:'Request failed');
  }
  finally{setBusy(false);}
 }
 async function openTab(name:typeof tab){
  setTab(name);setError('');setTasks([]);
  if(!session||!['Procurement','Cutting','Quality','Packing','Delivery'].includes(name))return;
  const path=name==='Cutting'?'/v1/ops/production-plan':
   name==='Packing'?'/v1/ops/packing-board':
   name==='Delivery'?'/v1/ops/delivery-board':
   name==='Quality'?'/v1/ops/batches':'/v1/ops/raw-lots';
  await run(async()=>{
   const rows=await request<Task[]>(path+(name==='Quality'||name==='Procurement'?'':'?date='+encodeURIComponent(boardDate)),session.accessToken);
   setTasks(rows);
  },'Workboard loaded from PostgreSQL.');
 }
 async function generateOrders(){
  if(!session)return;
  await run(async()=>{
   const result=await request<{summary:Record<string,number>}>('/v1/admin/recurrences/generate',session.accessToken,'POST',{deliveryDate:generationDate});
   setGenerationSummary(result.summary);
  },'Recurring schedules processed. Review the breakdown and any blocked deliveries.');
 }
 async function createStaff(e:React.FormEvent){
  e.preventDefault();if(!session)return;
  await run(async()=>{
   await request('/v1/admin/staff',session.accessToken,'POST',{email:staffEmail,password:staffPassword,roles:[staffRole]});
   setStaffEmail('');setStaffPassword('');
  },'Staff account created. Credentials should be supplied privately to the new user.');
 }
 async function createCustomer(e:React.FormEvent){
  e.preventDefault();if(!session)return;
  await run(async()=>{
   await request('/v1/admin/customers',session.accessToken,'POST',{
    organizationName:orgName,contactEmail,contactPassword,kitchenName,address,zoneCode
   });
   setOrgName('');setContactEmail('');setContactPassword('');setKitchenName('');setAddress('');
  },'Customer organisation and first kitchen created.');
 }
 const availableTabs=[...(canCustomer?['Supply']:[]),...(canAdmin?['Overview','Staff','Customers','Catalogue','Slots']:['Overview']),...(canProcure?['Procurement']:[]),...(canCut?['Cutting']:[]),...(canQC?['Quality']:[]),...(canPack?['Packing']:[]),...(canDeliver?['Delivery']:[])] as (typeof tab)[];
 return <div className="fp-secure">
 <header className="fp-secure-header"><button onClick={onHome} className="fp-secure-brand">❧ FreshPrep <small>Veggies</small></button><div><span>SECURE BUSINESS PORTAL</span>{session&&<button onClick={()=>void logout()}>Sign out</button>}</div></header>
 {!session?<div className="fp-login-layout"><div className="fp-login-story"><span>FRESHPREP OPERATIONS</span><h1>One platform.<br/>Every kitchen.<br/>Every role.</h1><p>Sign in to manage staff, customer kitchens and operational workboards.</p><div>Signed JWTs · Database-verified permissions · Organisation-scoped access</div></div>
 <form className="fp-login-form" onSubmit={e=>void login(e)}><h2>Welcome back</h2><p>Use the account created through the Super Admin bootstrap or the Admin portal.</p>
 <label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username"/></label>
 <label>Password<input type="password" required minLength={12} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/></label>
 <label>Organisation ID<input type="text" required value={organizationId} onChange={e=>setOrganizationId(e.target.value)} placeholder="UUID from bootstrap / invitation"/></label>
 {error&&<p role="alert" className="fp-error">{error}</p>}
 <button type="submit" disabled={busy}>{busy?'Signing in…':'Sign in securely →'}</button>
 <small>Access is granted only to registered organisation members. Public signup and password recovery are not enabled.</small></form></div>:
 <div className="fp-secure-workspace">
 <div className="fp-secure-intro"><div><span>FRESHPREP  /  TEAM WORKSPACE  /  {profile?.organizationId.slice(0,8)}</span><h1>{tab==='Supply'?'Your kitchen, always prepared':tab==='Overview'?'Business overview':tab==='Procurement'?'Procurement & inventory':tab==='Cutting'?'Production planning':tab==='Quality'?'Quality assurance':tab==='Packing'?'Packing operations':tab==='Delivery'?'Delivery control':tab==='Staff'?'Team management':tab==='Customers'?'Customer network':tab==='Catalogue'?'Product catalogue':'Delivery configuration'}</h1><p>Your authorised workspace · {profile?.roles.join(' · ')}</p></div><div className="fp-secure-intro-actions"><span className="fp-secure-live"><i/> Database connected</span><button type="button" onClick={()=>void logout()}>Sign out</button></div></div>
 {error&&<p role="alert" className="fp-error">{error}</p>}{message&&<p role="status" className="fp-notice">{message}</p>}
 <div className="fp-secure-layout"><nav className="fp-secure-tabs" aria-label="Workspace navigation"><p className="fp-secure-nav-caption">WORKSPACES</p>{availableTabs.map(t=><button type="button" key={t} aria-current={tab===t?'page':undefined} className={tab===t?'active':''} onClick={()=>void openTab(t)}><span className="fp-secure-nav-icon" aria-hidden="true">{({Overview:'▦',Supply:'▤',Staff:'♧',Customers:'▣',Catalogue:'◈',Slots:'◷',Procurement:'▧',Cutting:'▥',Quality:'◆',Packing:'▨',Delivery:'↗'} as Record<string,string>)[t]}</span>{t}</button>)}<div className="fp-secure-nav-footer"><strong>FreshPrep operations</strong><span>Roles are verified with every request.</span></div></nav><main className="fp-secure-main" id="workspace-content">
 {tab==='Supply'&&session&&profile&&<CustomerOrderPortal token={session.accessToken} base={BASE} roles={profile.roles} onLogout={()=>void logout()}/>}
 {(tab==='Catalogue'||tab==='Slots')&&session&&<CatalogAdmin base={BASE} token={session.accessToken} superadmin={profile?.roles.includes('SUPERADMIN')??false} mode={tab}/>}
 {tab==='Overview'&&<section className="fp-secure-panels" aria-label="Business key metrics"><article><h3>Secure workspace</h3><p>Your roles are obtained from active database memberships each request. The client cannot grant itself permissions.</p><strong>{profile?.roles.join(', ')}</strong></article>
 {canAdmin&&<><article><h3>Active kitchens</h3><strong>{overview?.activeKitchens??'—'}</strong></article><article><h3>Team members</h3><strong>{overview?.staff??'—'}</strong></article><article><h3>Orders by stage</h3>{overview?.ordersByState.map(r=><div key={r.state}>{r.state}: {r.count}</div>)}</article></>}
 </section>}
 {tab==='Overview'&&canAdmin&&session&&<AdminInsights base={BASE} token={session.accessToken}/>}
 {tab==='Overview'&&canAdmin&&<section className="fp-secure-card" style={{marginTop:16}}>
 <h3>Prepare upcoming deliveries</h3><p>Convert eligible customer schedules into PostgreSQL orders before slot cutoffs. Run this explicitly for the target delivery date; the free service does not guarantee background scheduling.</p>
 <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
 <label style={{margin:0}}>Delivery date<input type="date" value={generationDate} onChange={e=>setGenerationDate(e.target.value)}/></label>
 <button disabled={busy} onClick={()=>void generateOrders()} style={{background:'#165b38',color:'white',border:0,borderRadius:8,padding:'12px 15px',cursor:'pointer'}}>Generate due orders</button></div>
 {generationSummary&&<div role="status" className="fp-secure-line">{Object.entries(generationSummary).map(([status,count])=><span key={status}>{status}: {count}　</span>)}</div>}
 </section>}
 {tab==='Staff'&&canAdmin&&<div className="fp-secure-split"><section className="fp-secure-card"><h3>Create staff account</h3><form onSubmit={e=>void createStaff(e)}>
 <label>Email<input type="email" required value={staffEmail} onChange={e=>setStaffEmail(e.target.value)}/></label>
 <label>Temporary password (12+ characters)<input type="password" minLength={12} required value={staffPassword} onChange={e=>setStaffPassword(e.target.value)}/></label>
 <label>Role<select value={staffRole} onChange={e=>setStaffRole(e.target.value)}>{[...(profile?.roles.includes('SUPERADMIN')?['ADMIN']:[]),...allowedRoles].map(r=><option key={r} value={r}>{r.replaceAll('_',' ')}</option>)}</select></label>
 <button disabled={busy}>Create staff account</button></form></section><section className="fp-secure-card"><h3>Registered staff</h3>{staff.map(s=><div className="fp-secure-line" key={s.id}><strong>{s.email}</strong><span>{s.roles.join(', ')}</span></div>)}</section></div>}
 {tab==='Customers'&&canAdmin&&<div className="fp-secure-split"><section className="fp-secure-card"><h3>Onboard a customer kitchen</h3><form onSubmit={e=>void createCustomer(e)}>
 <label>Business name<input required value={orgName} onChange={e=>setOrgName(e.target.value)}/></label>
 <label>Primary email<input type="email" required value={contactEmail} onChange={e=>setContactEmail(e.target.value)}/></label>
 <label>Initial password<input type="password" minLength={12} required value={contactPassword} onChange={e=>setContactPassword(e.target.value)}/></label>
 <label>Kitchen name<input required value={kitchenName} onChange={e=>setKitchenName(e.target.value)}/></label>
 <label>Delivery address<input required value={address} onChange={e=>setAddress(e.target.value)}/></label>
 <label>Service zone<input required value={zoneCode} onChange={e=>setZoneCode(e.target.value)}/></label>
 <button disabled={busy}>Create customer</button></form></section><section className="fp-secure-card"><h3>Customer kitchens</h3>{kitchens.map(k=><div className="fp-secure-line" key={k.kitchen_id}><strong>{k.organization_name} — {k.kitchen_name}</strong><span>{k.address} · {k.zone_code}</span></div>)}</section></div>}
 {(['Procurement','Cutting','Quality','Packing','Delivery'] as string[]).includes(tab)&&<section className="fp-secure-card"><div className="fp-secure-boardhead"><div><h3>{tab==='Procurement'?'Received raw inventory':tab==='Quality'?'Quality inspection queue':tab+' workboard'}</h3>
 <p>PostgreSQL records scoped to your verified organisation and role, with no local demo data.</p></div>{!['Procurement','Quality'].includes(tab)&&<label>Delivery date<input type="date" value={boardDate} onChange={e=>setBoardDate(e.target.value)}/></label>}<button type="button" disabled={busy} onClick={()=>void openTab(tab)}>{busy?'Refreshing…':'Refresh board'}</button></div>
 <div className="fp-secure-table" role="region" aria-label="Operational work queue" tabIndex={0}><table>
 <thead><tr>{(tab==='Procurement'?['Raw lot','Vegetable','Received','Usable','Rejected']:
 tab==='Quality'?['Batch','Status','Raw input','Output','Waste']:
 ['Date','Slot','Vegetable / Customer','Cut / Status','Required weight / Order']).map(x=><th key={x}>{x}</th>)}</tr></thead>
 <tbody>{tasks.map((r,i)=>tab==='Procurement'?<tr key={r.id||i}>
 <td>{r.supplier_lot||r.id?.slice(0,8)||'—'}</td><td>{r.vegetable||'—'}</td>
 <td>{(Number(r.received_grams||0)/1000).toFixed(2)} kg</td>
 <td>{(Number(r.usable_grams||0)/1000).toFixed(2)} kg</td>
 <td>{(Number(r.rejected_grams||0)/1000).toFixed(2)} kg</td></tr>:
 tab==='Quality'?<tr key={r.id||i}>
 <td>{r.id?.slice(0,8)||'—'}</td><td>{r.state||'—'}</td>
 <td>{(Number(r.input_grams||0)/1000).toFixed(2)} kg</td>
 <td>{(Number(r.output_grams||0)/1000).toFixed(2)} kg</td>
 <td>{(Number(r.waste_grams||0)/1000).toFixed(2)} kg</td></tr>:
 <tr key={i}><td>{r.delivery_date||r.deliveryDate||'—'}</td><td>{r.slot_label||r.slotLabel||'—'}</td>
 <td>{r.vegetable||'Order '+(r.order_id||'').slice(0,8)}</td>
 <td>{r.preparation||r.state||'—'} {r.size||''}</td>
 <td>{r.required_grams==null?'—':(Number(r.required_grams)/1000).toFixed(2)+' kg'}
 {r.order_count!=null?' · '+r.order_count+' orders':''}</td></tr>)}</tbody></table></div>{tasks.length===0&&<div className="fp-emptystate"><span aria-hidden="true">◷</span><strong>{busy?'Loading current work queue…':'No work assigned for this delivery date'}</strong><p>{busy?'Fetching the latest records.':'Try another date or refresh. Only work authorised for your organisation is shown.'}</p></div>}</section>}
 </main></div></div>}
 </div>;
}
