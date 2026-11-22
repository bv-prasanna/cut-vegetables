import React,{useCallback,useEffect,useState} from 'react';
import {apiRequest,FriendlyApiError} from './api-errors';
type Slide={id:string;eyebrow:string;headline:string;description:string;imageUrl:string;mobileImageUrl?:string;altText:string;targetUrl?:string;ctaLabel?:string;sortOrder:number;startsAt:string;endsAt:string;active:boolean;audience:string};
type Announcement={id:string;title:string;body:string;startsAt:string;endsAt:string;active:boolean;priority:number;urgency:'INFO'|'IMPORTANT'|'CRITICAL';audience:string};
type Props={base:string;token:string;onSessionExpired?:()=>void};
const localInput=(value:Date)=>new Date(value.getTime()-value.getTimezoneOffset()*60000).toISOString().slice(0,16);
const defaultStart=()=>localInput(new Date());
const defaultEnd=()=>localInput(new Date(Date.now()+30*86400000));
export default function SecureMarketingAdmin({base,token,onSessionExpired}:Props){
 const [slides,setSlides]=useState<Slide[]>([]),[announcements,setAnnouncements]=useState<Announcement[]>([]);
 const [headline,setHeadline]=useState('Freshly cut. Ready for great kitchens.'),[eyebrow,setEyebrow]=useState('READY FOR GREAT KITCHENS');
 const [description,setDescription]=useState('Precision-prepared vegetables for professional kitchens.'),[imageUrl,setImageUrl]=useState('');
 const [altText,setAltText]=useState('Prepared vegetables for professional kitchens'),[targetUrl,setTargetUrl]=useState('');
 const [ctaLabel,setCtaLabel]=useState('Browse catalogue'),[sortOrder,setSortOrder]=useState('0');
 const [slideStart,setSlideStart]=useState(defaultStart),[slideEnd,setSlideEnd]=useState(defaultEnd);
 const [noticeTitle,setNoticeTitle]=useState(''),[noticeBody,setNoticeBody]=useState('');
 const [noticeStart,setNoticeStart]=useState(defaultStart),[noticeEnd,setNoticeEnd]=useState(defaultEnd);
 const [urgency,setUrgency]=useState<'INFO'|'IMPORTANT'|'CRITICAL'>('INFO'),[priority,setPriority]=useState('0');
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{
  const [s,a]=await Promise.all([
   apiRequest<Slide[]>(base,'/v1/admin/marketing/slides',{token}),
   apiRequest<Announcement[]>(base,'/v1/admin/marketing/announcements',{token})
  ]);
  setSlides(s);setAnnouncements(a);
 },[base,token]);
 useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:'Unable to load marketing content'));},[load]);
 async function run(task:()=>Promise<unknown>,success:string){
  setBusy(true);setError('');setMessage('');
  try{await task();setMessage(success);await load();}
  catch(e){
   if(e instanceof FriendlyApiError&&e.status===401){setError('Your session expired. Sign in again to continue.');onSessionExpired?.();}
   else setError(e instanceof Error?e.message:'Marketing change could not be saved.');
  }finally{setBusy(false);}
 }
 const date=(v:string)=>new Date(v).toISOString();
 async function publishSlide(e:React.FormEvent){
  e.preventDefault();
  if(!imageUrl.trim().startsWith('https://')){setError('Use an HTTPS image URL.');return;}
  await run(()=>apiRequest(base,'/v1/admin/marketing/slides',{token,method:'POST',payload:{
   eyebrow,headline,description,imageUrl,altText,targetUrl:targetUrl||undefined,ctaLabel,
   sortOrder:Number(sortOrder),startsAt:date(slideStart),endsAt:date(slideEnd),active:true,audience:'ALL'
  }}),'Hero slide published and scheduled.');
  setHeadline('');setImageUrl('');setTargetUrl('');
 }
 async function publishAnnouncement(e:React.FormEvent){
  e.preventDefault();
  await run(()=>apiRequest(base,'/v1/admin/marketing/announcements',{token,method:'POST',payload:{
   title:noticeTitle,body:noticeBody,startsAt:date(noticeStart),endsAt:date(noticeEnd),
   active:true,priority:Number(priority),urgency,audience:'ALL'
  }}),'Announcement published and scheduled.');
  setNoticeTitle('');setNoticeBody('');
 }
 return <section className="fp-ops-workspace" aria-label="Secure marketing content management">
  <div className="fp-ops-heading"><div><h3>Marketing content management</h3><p>Authenticated, scheduled content. Only active content inside its publication window is visible on the public storefront.</p></div><button className="fp-ops-refresh" type="button" onClick={()=>void load()} disabled={busy}>Refresh content</button></div>
  {error&&<p className="fp-ops-message error" role="alert">{error}</p>}{message&&<p className="fp-ops-message success" role="status">{message}</p>}
  <div className="fp-ops-grid">
   <article className="fp-ops-action"><h4>Publish hero banner</h4><p>Use approved HTTPS imagery, descriptive alt text and a defined publication window.</p>
    <form className="fp-ops-form" onSubmit={e=>void publishSlide(e)}>
     <label className="fp-ops-field"><span>Eyebrow</span><input value={eyebrow} onChange={e=>setEyebrow(e.target.value)} required/></label>
     <label className="fp-ops-field"><span>Sort order</span><input type="number" min="0" value={sortOrder} onChange={e=>setSortOrder(e.target.value)} required/></label>
     <label className="fp-ops-field full"><span>Headline</span><input value={headline} onChange={e=>setHeadline(e.target.value)} required/></label>
     <label className="fp-ops-field full"><span>Description</span><input value={description} onChange={e=>setDescription(e.target.value)} required/></label>
     <label className="fp-ops-field full"><span>HTTPS image URL</span><input type="url" value={imageUrl} onChange={e=>setImageUrl(e.target.value)} placeholder="https://…" required/></label>
     <label className="fp-ops-field full"><span>Image alt text</span><input value={altText} onChange={e=>setAltText(e.target.value)} required/></label>
     <label className="fp-ops-field"><span>CTA label</span><input value={ctaLabel} onChange={e=>setCtaLabel(e.target.value)}/></label>
     <label className="fp-ops-field"><span>Target URL (optional)</span><input type="url" value={targetUrl} onChange={e=>setTargetUrl(e.target.value)}/></label>
     <label className="fp-ops-field"><span>Starts at</span><input type="datetime-local" value={slideStart} onChange={e=>setSlideStart(e.target.value)} required/></label>
     <label className="fp-ops-field"><span>Ends at</span><input type="datetime-local" value={slideEnd} onChange={e=>setSlideEnd(e.target.value)} required/></label>
     <button className="fp-ops-submit" disabled={busy}>Publish banner</button>
    </form>
   </article>
   <article className="fp-ops-action"><h4>Publish announcement</h4><p>Operational notices have priority and urgency; they are not hidden in a rotating banner.</p>
    <form className="fp-ops-form" onSubmit={e=>void publishAnnouncement(e)}>
     <label className="fp-ops-field full"><span>Title</span><input value={noticeTitle} onChange={e=>setNoticeTitle(e.target.value)} required/></label>
     <label className="fp-ops-field full"><span>Message</span><input value={noticeBody} onChange={e=>setNoticeBody(e.target.value)} required/></label>
     <label className="fp-ops-field"><span>Urgency</span><select value={urgency} onChange={e=>setUrgency(e.target.value as 'INFO'|'IMPORTANT'|'CRITICAL')}><option value="INFO">Information</option><option value="IMPORTANT">Important</option><option value="CRITICAL">Critical</option></select></label>
     <label className="fp-ops-field"><span>Priority</span><input type="number" min="0" value={priority} onChange={e=>setPriority(e.target.value)}/></label>
     <label className="fp-ops-field"><span>Starts at</span><input type="datetime-local" value={noticeStart} onChange={e=>setNoticeStart(e.target.value)} required/></label>
     <label className="fp-ops-field"><span>Ends at</span><input type="datetime-local" value={noticeEnd} onChange={e=>setNoticeEnd(e.target.value)} required/></label>
     <button className="fp-ops-submit" disabled={busy}>Publish announcement</button>
    </form>
   </article>
  </div>
  <div className="fp-ops-grid">
   <article className="fp-ops-action"><h4>Published and scheduled banners</h4>{slides.length?slides.map(s=><div className="fp-secure-line" key={s.id}><div><strong>{s.headline}</strong><div className="fp-ops-small">{s.active?'Active':'Archived'} · {new Date(s.startsAt).toLocaleString()} – {new Date(s.endsAt).toLocaleString()}</div></div><button className="fp-ops-refresh" disabled={busy||!s.active} onClick={()=>void run(()=>apiRequest(base,'/v1/admin/marketing/slides/'+s.id,{token,method:'DELETE'}),'Banner archived.')}>Archive</button></div>):<p className="fp-ops-empty">No hero banners are configured.</p>}</article>
   <article className="fp-ops-action"><h4>Published and scheduled announcements</h4>{announcements.length?announcements.map(a=><div className="fp-secure-line" key={a.id}><div><strong>{a.title}</strong><div className="fp-ops-small">{a.urgency} · {a.active?'Active':'Archived'} · {new Date(a.startsAt).toLocaleString()} – {new Date(a.endsAt).toLocaleString()}</div></div><button className="fp-ops-refresh" disabled={busy||!a.active} onClick={()=>void run(()=>apiRequest(base,'/v1/admin/marketing/announcements/'+a.id,{token,method:'DELETE'}),'Announcement archived.')}>Archive</button></div>):<p className="fp-ops-empty">No announcements are configured.</p>}</article>
  </div>
 </section>;
}
