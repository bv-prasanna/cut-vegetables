import React, { useEffect, useState } from 'react';
import './storefront.css';

export type StoreVariant = {
  id: string; vegetable: string; preparation: string;
  size: { kind: string; value: string | number; unit?: string };
  imageUrl: string; pricePaisePerKg: number;
  minimumGrams: number; incrementGrams: number; active: boolean;
};
export type StoreSlot = {
  id: string; label: string; startMinute: number; endMinute: number;
  cutoffDayOffset: number; cutoffMinute: number;
  capacityOrders: number; active: boolean;
};
type Slide = {
  id: string; eyebrow: string; headline: string; description: string;
  imageUrl: string; active: boolean; sortOrder: number;
};
type Props = {
  variants: StoreVariant[]; slots: StoreSlot[]; weekdays: number[];
  frequency: 'DAILY' | 'WEEKLY';
  onSetFrequency: (v: 'DAILY' | 'WEEKLY') => void;
  onSetWeekdays: (v: number[]) => void;
  onCatalogue: () => void; onRecurring: () => void;
  onOrders: () => void; onAdmin: () => void; onStaff?: () => void;
  onSelectProduct: (v: StoreVariant) => void;
};

const HERO_FALLBACK: Slide[] = [
 {id:'h1',eyebrow:'READY FOR GREAT KITCHENS',headline:'Freshly Cut.\nHygienically Packed.\nDelivered On Time.',description:'Precision-prepared vegetables for restaurants, hotels, PG kitchens, caterers and wedding halls.',imageUrl:'https://images.unsplash.com/photo-1543362906-acfc16c67564?auto=format&fit=crop&w=1800&q=85',active:true,sortOrder:0},
 {id:'h2',eyebrow:'YOUR PREP PARTNER',headline:'The Right Cut.\nFor Every Recipe.',description:'Choose the vegetable, cutting style, exact dimension and weight that works for your kitchen.',imageUrl:'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1800&q=85',active:true,sortOrder:1},
 {id:'h3',eyebrow:'BUSINESS DELIVERY SCHEDULES',headline:'Fresh Supply.\nOn Your Schedule.',description:'Plan one-time orders or schedule deliveries every day or on selected weekdays.',imageUrl:'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1800&q=85',active:true,sortOrder:2}
];
const imageFor = (name:string,method:string) => {
 const n=name.toLowerCase();
 if(n.includes('potato'))return 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=600&q=80';
 if(n.includes('onion'))return 'https://images.unsplash.com/photo-1508747703725-719777637510?auto=format&fit=crop&w=600&q=80';
 if(n.includes('carrot'))return 'https://images.unsplash.com/photo-1445282768818-728615cc910a?auto=format&fit=crop&w=600&q=80';
 if(n.includes('cabbage'))return 'https://images.unsplash.com/photo-1594282486552-05b4d80fbb9f?auto=format&fit=crop&w=600&q=80';
 return 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80';
};
const previews:StoreVariant[]=[
 {id:'preview-potato',vegetable:'Potato',preparation:'DICED',size:{kind:'numeric',value:10,unit:'mm'},imageUrl:imageFor('potato','diced'),pricePaisePerKg:0,minimumGrams:500,incrementGrams:250,active:true},
 {id:'preview-onion',vegetable:'Onion',preparation:'CHOPPED',size:{kind:'numeric',value:20,unit:'mm'},imageUrl:imageFor('onion','chopped'),pricePaisePerKg:0,minimumGrams:500,incrementGrams:250,active:true},
 {id:'preview-carrot',vegetable:'Carrot',preparation:'GRATED',size:{kind:'label',value:'fine'},imageUrl:imageFor('carrot','grated'),pricePaisePerKg:0,minimumGrams:500,incrementGrams:250,active:true},
 {id:'preview-cabbage',vegetable:'Cabbage',preparation:'SHREDDED',size:{kind:'label',value:'thin'},imageUrl:imageFor('cabbage','shredded'),pricePaisePerKg:0,minimumGrams:500,incrementGrams:250,active:true}
];
function I({name,size=20}:{name:string;size?:number}) {
 const common={width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round' as const,strokeLinejoin:'round' as const,'aria-hidden':true as const};
 const shapes:Record<string,React.ReactNode>={
 leaf:<><path d="M20 4c-11 0-17 5-15 12 2 6 12 6 15-12Z"/><path d="M4 21c2-6 7-10 13-13"/></>,
 shield:<><path d="M12 22S4 18 4 11V5l8-3 8 3v6c0 7-8 11-8 11Z"/><path d="m9 12 2 2 4-4"/></>,
 truck:<><path d="M3 6h11v11H3zM14 9h4l3 4v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>,
 calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 15h3"/></>,
 grid:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
 knife:<><path d="M4 4c8 0 12 5 12 11H4Z"/><path d="M16 15v5a2 2 0 0 0 4 0v-8"/></>,
 repeat:<><path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/></>,
 clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
 gift:<><rect x="3" y="9" width="18" height="12" rx="1"/><path d="M12 9v12M3 13h18M12 9S5 9 5 6a3 3 0 0 1 6-1l1 4Zm0 0s7 0 7-3a3 3 0 0 0-6-1l-1 4Z"/></>,
 tag:<><path d="M3 12V4h8l10 10-7 7L3 12Z"/><circle cx="8" cy="8" r="1"/></>,
 star:<><path d="m12 2 3 7 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1Z"/></>,
 arrow:<><path d="M5 12h14M13 6l6 6-6 6"/></>,
 search:<><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></>,
 location:<><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/></>,
 box:<><path d="m3 7 9-4 9 4v11l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v11"/></>
 };
 return <svg {...common}>{shapes[name]||shapes.leaf}</svg>;
}
function prettyCut(v:StoreVariant){return v.preparation.toLowerCase()+' '+String(v.size.value)+(v.size.kind==='numeric'?' '+(v.size.unit||'mm'):'');}
function clock(m:number){return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');}
function price(p:number){return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(p/100);}

export default function MarketingHome({variants,slots,weekdays,onSetWeekdays,frequency,onSetFrequency,onCatalogue,onRecurring,onOrders,onAdmin,onStaff,onSelectProduct}:Props){
 const [slides,setSlides]=useState<Slide[]>(HERO_FALLBACK);
 const [active,setActive]=useState(0);
 const [notice,setNotice]=useState<string|null>(null);
 useEffect(()=>{
  let cancelled=false;
  fetch('/api/home/slides').then(r=>r.ok?r.json():[]).then((items:Slide[])=>{
   if(!cancelled&&Array.isArray(items)&&items.length){const valid=items.filter(i=>i.active&&i.imageUrl&&i.headline).sort((a,b)=>a.sortOrder-b.sortOrder);if(valid.length){setSlides(valid);setActive(0);}}
  }).catch(()=>{});
  fetch('/api/home/announcements').then(r=>r.ok?r.json():[]).then((items:{title:string;body:string}[])=>{if(!cancelled&&items.length)setNotice(items[0].title+': '+items[0].body);}).catch(()=>{});
  return()=>{cancelled=true;};
 },[]);
 const hero=slides[Math.min(active,slides.length-1)]||HERO_FALLBACK[0];
 const featured=variants.length?variants.filter(v=>v.active).slice(0,4):previews;
 const showPreview=!variants.length;
 const displayedSlots=slots.length?slots.slice(0,2):[
  {id:'preview-morning',label:'5 AM – 8 AM',startMinute:300,endMinute:480,cutoffDayOffset:1,cutoffMinute:1380,capacityOrders:0,active:true},
  {id:'preview-afternoon',label:'2 PM – 5 PM',startMinute:840,endMinute:1020,cutoffDayOffset:0,cutoffMinute:660,capacityOrders:0,active:true}
 ];
 function gotoSlide(delta:number){setActive(i=>(i+delta+slides.length)%slides.length);}
 function toggleDay(day:number){onSetFrequency('WEEKLY');onSetWeekdays(weekdays.includes(day)?weekdays.filter(i=>i!==day):[...weekdays,day]);}
 return <div className="fp-site">
 <header className="fp-header"><div className="fp-header-inner">
   <button className="fp-wordmark" onClick={()=>window.scrollTo({top:0,behavior:'smooth'})} aria-label="FreshPrep home"><span className="fp-leafmark"><I name="leaf" size={34}/></span><span className="fp-wordmark-text"><b>FreshPrep</b><small>Veggies</small></span><span className="fp-brand-tag">READY FOR<br/>GREAT KITCHENS</span></button>
   <nav className="fp-top-nav" aria-label="Main navigation"><button className="fp-nav-active" onClick={()=>window.scrollTo({top:0,behavior:'smooth'})}>Home</button><button onClick={onCatalogue}>Catalogue</button><button onClick={onRecurring}>Recurring Orders</button><button onClick={onStaff||onAdmin}>Staff Boards</button><button onClick={()=>document.getElementById('fp-delivery')?.scrollIntoView({behavior:'smooth'})}>Delivery Slots</button><button onClick={()=>document.getElementById('fp-promos')?.scrollIntoView({behavior:'smooth'})}>Offers</button><button onClick={()=>document.getElementById('fp-about')?.scrollIntoView({behavior:'smooth'})}>About</button></nav>
   <button className="fp-login" onClick={onCatalogue}>Browse / Get Started <I name="arrow" size={15}/></button>
 </div></header>
 <section className="fp-hero" aria-label="FreshPrep promotions">
  <div className="fp-hero-image" style={{backgroundImage:'linear-gradient(90deg, #f6f8f5 0%, rgba(246,248,245,.9) 14%, rgba(246,248,245,0) 43%), url("'+hero.imageUrl+'")'}} />
  <div className="fp-hero-inner"><div className="fp-hero-copy"><div className="fp-eyebrow">{hero.eyebrow}</div><h1>{hero.headline}</h1><p>{hero.description}</p>
   <div className="fp-hero-buttons"><button className="fp-btn-primary" onClick={onCatalogue}><I name="grid" size={17}/> Browse Catalogue <I name="arrow" size={16}/></button><button className="fp-btn-outline" onClick={onRecurring}><I name="calendar" size={17}/> Start Recurring Order</button></div>
   <div className="fp-trust-mini"><span><I name="leaf" size={21}/> Farm-fresh focus</span><span><I name="shield" size={21}/> Hygiene-first process</span><span><I name="truck" size={21}/> Planned delivery</span></div></div>
   <div className="fp-handwritten">Same great taste.<br/>Less prep. More possibilities.</div>
  </div>
  <button aria-label="Previous banner" className="fp-slider-arrow fp-slider-prev" onClick={()=>gotoSlide(-1)}>‹</button><button aria-label="Next banner" className="fp-slider-arrow fp-slider-next" onClick={()=>gotoSlide(1)}>›</button>
  <div className="fp-hero-dots" aria-label="Choose banner">{slides.map((s,i)=><button key={s.id} className={i===active?'active':''} onClick={()=>setActive(i)} aria-label={'Slide '+(i+1)} aria-current={i===active?'true':undefined}/>)}</div>
 </section>
 {notice&&<div className="fp-announcement" role="status"><I name="tag" size={17}/>{notice}</div>}
 <div className="fp-main-content"><div className="fp-shop-row">
  <section className="fp-products"><div className="fp-section-heading"><div><h2>Shop by Preparation</h2><p>Consistent cuts. Save prep time. Focus on what you do best.</p></div><button className="fp-inline-link" onClick={onCatalogue}>View full catalogue <I name="arrow" size={15}/></button></div>
   <div className="fp-product-grid">{featured.map(v=><article className="fp-product-card" key={v.id}><div className="fp-product-photo"><img src={v.imageUrl||imageFor(v.vegetable,v.preparation)} alt={v.vegetable+' '+prettyCut(v)} loading="lazy"/>{(showPreview||v.id.startsWith('sample-'))&&<span className="fp-sample-mark">Illustrative photo</span>}</div><div className="fp-product-content"><strong>{v.vegetable}</strong><p>{prettyCut(v)}</p><div className="fp-product-buy"><b>{showPreview?'Price on request':price(v.pricePaisePerKg)+' / kg'+(v.id.startsWith('sample-')?' (demo)':'')}</b><button onClick={()=>showPreview?onCatalogue():onSelectProduct(v)}><I name="grid" size={13}/> {showPreview?'View':'Add'}</button></div></div></article>)}</div>
  </section>
  <section className="fp-recurrence" aria-label="Recurring ordering"><div className="fp-panel-heading"><I name="calendar" size={27}/><div><h2>Set Up Recurring Orders</h2><p>Fresh supply, your schedule. No last-minute hassle.</p></div></div><div className="fp-recurrence-widget"><b>Select Delivery Days</b><div className="fp-weekdays">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((label,i)=>{const day=(i+1)%7;return <button key={label} className={weekdays.includes(day)?'selected':''} aria-pressed={weekdays.includes(day)} onClick={()=>toggleDay(day)}>{label}</button>})}</div><label>Delivery Frequency<select aria-label="Delivery frequency" value={frequency} onChange={e=>onSetFrequency(e.target.value as 'DAILY'|'WEEKLY')}><option value="WEEKLY">Every week</option><option value="DAILY">Daily</option></select></label><button className="fp-panel-button" onClick={onRecurring}>Create Recurring Order <I name="arrow" size={16}/></button></div></section>
  <section className="fp-delivery" id="fp-delivery"><div className="fp-panel-heading"><I name="truck" size={27}/><div><h2>Delivery Slots</h2><p>Choose a slot that works for your kitchen.</p></div></div><div className="fp-delivery-list">{displayedSlots.map((s,i)=><button className="fp-delivery-option" key={s.id} onClick={onCatalogue}><span className="fp-sun">☼</span><span><b>{s.label}</b><small><I name="clock" size={13}/> Closes {s.cutoffDayOffset?'previous day':'same day'} at {clock(s.cutoffMinute)}</small></span>{i===0&&<em>{slots.length?'Available window':'Example'}</em>}</button>)}</div></section>
 </div>
 <section className="fp-promotion-row" id="fp-promos"><button className="fp-offer-card fp-offer-one" onClick={onCatalogue}><I name="tag" size={31}/><span><small>BUSINESS PRICING</small><b>Ask about repeat-order pricing</b><span>Customer-specific rates for regular kitchens.</span></span><I name="arrow" size={18}/></button><button className="fp-offer-card fp-offer-two" onClick={onOrders}><I name="gift" size={31}/><span><small>BULK ORDER PLANNING</small><b>Plan large catering requirements</b><span>Choose custom cuts and delivery schedules.</span></span><I name="arrow" size={18}/></button><div className="fp-offer-card fp-offer-three"><I name="star" size={33}/><span><small>PLANNED FEATURE</small><b>FreshPrep Rewards</b><span>Loyalty points and redemption coming later.</span></span></div></section>
 <section className="fp-why" id="fp-about"><h2>Why Professional Kitchens Choose FreshPrep Veggies</h2><div className="fp-reasons"><div><span><I name="shield" size={25}/></span><div><b>Hygiene-first Processing</b><p>Designed for traceable cleaning, packing and QC.</p></div></div><div><span><I name="knife" size={25}/></span><div><b>Exact Cut Sizes</b><p>Consistent specifications for your recipes.</p></div></div><div><span><I name="truck" size={25}/></span><div><b>Planned Delivery</b><p>Choose the slot that suits your kitchen.</p></div></div><div><span><I name="box" size={25}/></span><div><b>Batch Traceability</b><p>Raw-lot to delivery tracking in the roadmap.</p></div></div></div></section>
 </div>
 <footer className="fp-footer"><div className="fp-footer-inner"><div className="fp-footer-brand"><I name="leaf" size={26}/><span><b>FreshPrep Veggies</b><small>READY FOR GREAT KITCHENS</small></span></div><div className="fp-footer-links"><button onClick={onCatalogue}>Catalogue</button><button onClick={onRecurring}>Recurring Orders</button><button onClick={()=>document.getElementById('fp-delivery')?.scrollIntoView({behavior:'smooth'})}>Delivery Slots</button><button onClick={onStaff||onAdmin}>Staff Boards</button><button onClick={onAdmin}>Admin Demo</button></div><div className="fp-footer-place"><I name="location" size={17}/> Bengaluru, Karnataka</div></div><div className="fp-footer-bottom">FreshPrep Veggies · Development preview · Product prices, claims and contact details must be confirmed before launch</div></footer>
 </div>;
}
