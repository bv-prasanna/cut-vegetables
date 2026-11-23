import React,{useCallback,useEffect,useState} from 'react';
import {apiRequest,FriendlyApiError} from './api-errors';
import './notification-center.css';
type Category='ORDER'|'DELIVERY'|'SUPPORT'|'FINANCE'|'LOYALTY'|'SYSTEM';
type Notice={id:string;category:Category;title:string;body:string;subject_type:string|null;subject_id:string|null;created_at:string;read_at:string|null};
type Preference={category:Category;in_app_enabled:boolean};
const categories:Category[]=['ORDER','DELIVERY','SUPPORT','FINANCE','LOYALTY','SYSTEM'];
export default function NotificationCenter({base,token,onSessionExpired}:{base:string;token:string;onSessionExpired:()=>void}){
 const [items,setItems]=useState<Notice[]>([]),[unread,setUnread]=useState(0),[preferences,setPreferences]=useState<Preference[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const call=useCallback(async<T,>(path:string,method='GET',payload?:unknown)=>apiRequest<T>(base,path,{token,method,payload}),[base,token]);
 const refresh=useCallback(async()=>{const [inbox,prefs]=await Promise.all([call<{items:Notice[];unreadCount:number}>('/v1/notifications'),call<Preference[]>('/v1/notifications/preferences')]);setItems(inbox.items);setUnread(inbox.unreadCount);setPreferences(prefs);},[call]);
 useEffect(()=>{let active=true;void refresh().catch(e=>{if(active){if(e instanceof FriendlyApiError&&e.status===401)onSessionExpired();setError(e instanceof Error?e.message:'Unable to load notifications');}});return()=>{active=false};},[refresh,onSessionExpired]);
 async function act(task:()=>Promise<unknown>){setBusy(true);setError('');try{await task();await refresh();}catch(e){if(e instanceof FriendlyApiError&&e.status===401)onSessionExpired();setError(e instanceof Error?e.message:'Notification action failed');}finally{setBusy(false);}}
 async function toggle(category:Category,enabled:boolean){await act(()=>call('/v1/notifications/preferences/'+category,'PUT',{inAppEnabled:enabled}));}
 const enabled=(category:Category)=>preferences.find(p=>p.category===category)?.in_app_enabled??true;
 return <section className="fp-notifications">
  <header className="fp-notifications-head"><div><span>YOUR WORKSPACE</span><h2>Notifications</h2><p>Order, delivery, support, finance and rewards updates for this account.</p></div><div><b>{unread}</b><small>unread</small><button disabled={busy||unread===0} onClick={()=>void act(()=>call('/v1/notifications/read-all','POST',{}))}>Mark all read</button></div></header>
  {error&&<p className="fp-notifications-error" role="alert">{error}</p>}
  <div className="fp-notifications-layout">
   <section className="fp-notifications-list">
    {items.map(item=><article className={item.read_at?'read':'unread'} key={item.id}>
     <div className="fp-notification-meta"><span>{item.category}</span><time>{new Date(item.created_at).toLocaleString('en-IN')}</time></div>
     <h3>{item.title}</h3><p>{item.body}</p>
     {!item.read_at&&<button disabled={busy} onClick={()=>void act(()=>call('/v1/notifications/'+item.id+'/read','PATCH',{}))}>Mark as read</button>}
    </article>)}
    {!items.length&&<p className="fp-notifications-empty">You are all caught up. New order and account updates will appear here.</p>}
   </section>
   <aside className="fp-notifications-preferences"><h3>In-app preferences</h3><p>Choose which update categories appear in this inbox. Email and SMS delivery are not enabled yet.</p>
    {categories.map(category=><label key={category}><span>{category.replaceAll('_',' ')}</span><input type="checkbox" checked={enabled(category)} onChange={e=>void toggle(category,e.target.checked)} disabled={busy}/></label>)}
   </aside>
  </div>
 </section>;
}
