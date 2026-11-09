import React,{useCallback,useEffect,useState} from 'react';
import {apiRequest} from './api-errors';
import './admin-insights.css';
type Insight={
 asOf:string;
 metrics:{upcomingOrders:number;exceptionOrders:number;bookedValuePaise:number;customersWithOrders:number};
 daily:{date:string;orders:number;grams:number;bookedPaise:number}[];
 topCuts:{name:string;grams:number;orders:number}[];
 slots:{date:string;label:string;orders:number;capacity:number}[];
 recentEvents:{event_type:string;subject_type:string;created_at:string}[];
};
const cash=(v:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(v/100);
const weight=(v:number)=>new Intl.NumberFormat('en-IN',{maximumFractionDigits:1}).format(v/1000)+' kg';
const human=(s:string)=>s.replaceAll('_',' ').toLowerCase().replace(/\b\w/g,m=>m.toUpperCase());
export default function AdminInsights({base,token}:{base:string;token:string}){
 const[stats,setStats]=useState<Insight|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const refresh=useCallback(async()=>{
  setLoading(true);setError('');
  try{setStats(await apiRequest<Insight>(base,'/v1/admin/insights',{token}));}
  catch(e){setError(e instanceof Error?e.message:'Unable to load reporting');}
  finally{setLoading(false);}
 },[base,token]);
 useEffect(()=>{void refresh();},[refresh]);
 const maxOrders=Math.max(1,...(stats?.daily.map(r=>r.orders)||[]));
 const maxCut=Math.max(1,...(stats?.topCuts.map(r=>r.grams)||[]));
 const bookedKg=(stats?.daily||[]).reduce((n,r)=>n+r.grams,0);
 return <section className="fp-insights" aria-label="Live operations analytics">
  <div className="fp-insights-heading"><div><span className="fp-insights-kicker">OPERATIONS INTELLIGENCE</span><h2>Production & delivery outlook</h2><p>Live PostgreSQL data for the next 14 days. No illustrative KPIs.</p></div><button type="button" disabled={loading} onClick={()=>void refresh()}>{loading?'Updating…':'↻ Refresh metrics'}</button></div>
  {error&&<p className="fp-error" role="alert">{error}</p>}
  {loading&&!stats&&<p role="status" className="fp-notice">Loading business insights…</p>}
  {stats&&<>
   <div className="fp-insights-metrics">
    <article><span>UPCOMING ORDERS</span><strong>{stats.metrics.upcomingOrders.toLocaleString('en-IN')}</strong><small>Awaiting fulfilment</small></article>
    <article><span>BOOKED ORDER VALUE</span><strong>{cash(stats.metrics.bookedValuePaise)}</strong><small>Order value, not settled revenue</small></article>
    <article><span>CUSTOMERS WITH ORDERS</span><strong>{stats.metrics.customersWithOrders.toLocaleString('en-IN')}</strong><small>Across this producer</small></article>
    <article className={stats.metrics.exceptionOrders?'fp-insights-attention':''}><span>EXCEPTIONS TO REVIEW</span><strong>{stats.metrics.exceptionOrders.toLocaleString('en-IN')}</strong><small>Production or order exceptions</small></article>
   </div>
   <div className="fp-insights-grid">
    <article className="fp-insights-panel">
     <div className="fp-insights-panelhead"><div><h3>Delivery demand</h3><p>Orders by scheduled date · {weight(bookedKg)} total</p></div><span>14 DAYS</span></div>
     {stats.daily.length?<div className="fp-insights-chart" role="img" aria-label="Upcoming daily order demand chart">
      {stats.daily.map(row=><div className="fp-insights-day" key={row.date}>
       <b>{row.orders}</b><div className="fp-insights-bartrack"><div style={{height:Math.max(6,row.orders/maxOrders*100)+'%'}} className="fp-insights-bar"/></div>
       <span>{row.date.slice(5)}</span>
      </div>)}
     </div>:<div className="fp-emptystate"><strong>No upcoming orders</strong><p>Demand will appear when customers place or schedule orders.</p></div>}
    </article>
    <article className="fp-insights-panel">
     <div className="fp-insights-panelhead"><div><h3>Most requested preparations</h3><p>Cut-specific weight across all accepted slots</p></div><span>TOP 8</span></div>
     {stats.topCuts.length?stats.topCuts.map((r,i)=><div className="fp-insights-cut" key={r.name}>
      <div className="fp-insights-cutlabel"><b>{i+1}. {r.name}</b><span>{weight(r.grams)}</span></div>
      <div className="fp-insights-track"><div style={{width:Math.max(3,r.grams/maxCut*100)+'%'}}/></div>
      <small>{r.orders} customer {r.orders===1?'order':'orders'}</small>
     </div>):<div className="fp-emptystate"><strong>No preparation demand yet</strong><p>Variants and quantities appear after customer orders are confirmed.</p></div>}
    </article>
    <article className="fp-insights-panel">
     <div className="fp-insights-panelhead"><div><h3>Upcoming delivery windows</h3><p>Allocated order capacity by date and slot</p></div><span>7 DAYS</span></div>
     {stats.slots.length?stats.slots.map((r,i)=><div className="fp-insights-window" key={r.date+'-'+r.label+'-'+i}>
      <div><strong>{r.label}</strong><small>{r.date} · {r.orders} of {r.capacity} bookings</small></div>
      <span className={r.orders>=r.capacity?'fp-insights-full':''}>{Math.round(r.orders/Math.max(1,r.capacity)*100)}%</span>
     </div>):<div className="fp-emptystate"><strong>No slots reserved</strong><p>Slot allocation will update as orders arrive.</p></div>}
    </article>
    <article className="fp-insights-panel">
     <div className="fp-insights-panelhead"><div><h3>Recent operational activity</h3><p>Audit-backed milestones, newest first</p></div><span>LIVE</span></div>
     {stats.recentEvents.length?stats.recentEvents.map((ev,i)=><div className="fp-insights-event" key={i}>
      <span className="fp-insights-eventdot"/><div><strong>{human(ev.event_type)}</strong><small>{ev.subject_type} · {new Date(ev.created_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'})}</small></div>
     </div>):<div className="fp-emptystate"><strong>No recorded activity</strong><p>Operational audit events will appear as work is completed.</p></div>}
    </article>
   </div>
  </>}
 </section>;
}
