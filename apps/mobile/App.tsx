import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Alert,FlatList,Image,Pressable,ScrollView,StatusBar,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import {formatRole,isBuyer,menuFor,roles,type MobileRole} from './src/roles';
import StaffWorkBoard from './src/StaffWorkBoard';

type Variant={id:string;vegetable:string;preparation:string;size:{kind:string;value:string|number;unit?:string};imageUrl:string;pricePaisePerKg:number;minimumGrams:number;incrementGrams:number;active:boolean};
type Slot={id:string;label:string;startMinute:number;endMinute:number;cutoffDayOffset:number;cutoffMinute:number;capacityOrders:number;active:boolean};
type Order={id:string;state?:string;deliveryDate:string;totalPaise:number;items:{variantId:string;grams:number}[]};
type Summary={metrics:{variants:number;vegetables:number;orders:number;recurringSchedules:number;deliverySlots:number;demoOrderValuePaise:number};stateCounts:Record<string,number>;slotLoad:{id:string;label:string;capacityOrders:number;reserved:number}[]};
const BASE=(process.env.EXPO_PUBLIC_API_URL||'http://10.0.2.2:3000').replace(/\/$/,'');
const money=(v:number)=>'₹'+(v/100).toFixed(2);
const weekdayLabels=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
async function api<T>(path:string,method='GET',body?:unknown):Promise<T>{
 const response=await fetch(BASE+path,{method,headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
 const value=await response.json();
 if(!response.ok)throw new Error(value.error||'Server rejected request');
 return value as T;
}
async function getEvent(subjectId:string){
 const unavailable=(reason:string,consentStatus:'DENIED'|'NOT_REQUESTED'='NOT_REQUESTED')=>({eventType:'ORDER_CREATED',subjectType:'ORDER',subjectId,location:{source:'UNAVAILABLE',unavailableReason:reason,consentStatus},details:{client:'expo-mobile-demo'}});
 try{
  const p=await Location.requestForegroundPermissionsAsync();
  if(p.status!=='granted')return unavailable('Location permission denied','DENIED');
  const position=await Promise.race([
   Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced}),
   new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Location timed out')),5000))
  ]);
  return {eventType:'ORDER_CREATED',subjectType:'ORDER',subjectId,location:{source:'DEVICE_GPS',latitude:position.coords.latitude,longitude:position.coords.longitude,accuracyMeters:Math.max(0,position.coords.accuracy??0),capturedAt:new Date(position.timestamp).toISOString(),consentStatus:'GRANTED'},details:{client:'expo-mobile-demo'}};
 }catch(e){return unavailable(e instanceof Error?e.message:'Location unavailable');}
}
const P=(props:{children:React.ReactNode;onPress:()=>void;selected?:boolean;disabled?:boolean})=><Pressable accessibilityRole="button" disabled={props.disabled} onPress={props.onPress} style={[styles.pill,props.selected&&styles.pillActive,props.disabled&&styles.disabled]}><Text style={[styles.pillText,props.selected&&styles.pillTextActive]}>{props.children}</Text></Pressable>;
function AppContent(){
 const[role,setRole]=useState<MobileRole>('CUSTOMER'),[screen,setScreen]=useState('Home');
 const[variants,setVariants]=useState<Variant[]>([]),[slots,setSlots]=useState<Slot[]>([]),[orders,setOrders]=useState<Order[]>([]),[summary,setSummary]=useState<Summary|null>(null);
 const[cart,setCart]=useState<Record<string,number>>({}),[query,setQuery]=useState(''),[date,setDate]=useState(new Date(Date.now()+86400000).toISOString().slice(0,10)),[slot,setSlot]=useState(''),[frequency,setFrequency]=useState<'DAILY'|'WEEKLY'>('WEEKLY'),[weekdays,setWeekdays]=useState<number[]>([1,3,5]);
 const[error,setError]=useState(''),[working,setWorking]=useState(false),[online,setOnline]=useState(false);
 const refresh=useCallback(async()=>{
  setWorking(true);
  try{
   const [v,s,o,m]=await Promise.all([api<Variant[]>('/catalog/variants'),api<Slot[]>('/delivery/slots'),api<Order[]>('/dev/orders'),api<Summary>('/dev/admin/dashboard')]);
   setVariants(v);setSlots(s);setOrders(o);setSummary(m);setOnline(true);setError('');
  }catch(e){setOnline(false);setError('Unable to reach the local development backend: '+(e instanceof Error?e.message:'Network error'));}
  finally{setWorking(false);}
 },[]);
 useEffect(()=>{void refresh()},[refresh]);
 const selected=useMemo(()=>Object.entries(cart).filter(([,grams])=>grams>0).map(([variantId,grams])=>({variantId,grams})),[cart]);
 const sum=selected.reduce((total,item)=>total+Math.round((variants.find(v=>v.id===item.variantId)?.pricePaisePerKg||0)*item.grams/1000),0);
 const visible=variants.filter(v=>[v.vegetable,v.preparation,String(v.size.value)].join(' ').toLowerCase().includes(query.toLowerCase()));
 function adjust(item:Variant,sign:1|-1){setCart(previous=>{const current=previous[item.id]||0;return {...previous,[item.id]:sign===1?(current?current+item.incrementGrams:item.minimumGrams):Math.max(0,current-item.incrementGrams)};});}
 async function submit(recurring:boolean){
  if(!selected.length||!slot||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)){Alert.alert('Complete your basket','Choose at least one product, a date and delivery slot.');return;}
  setWorking(true);
  try{
   if(recurring){
    if(frequency==='WEEKLY'&&!weekdays.length)throw Error('Choose at least one weekday');
    await api('/dev/recurrences','POST',{id:'mobile-'+Date.now().toString(36),frequency,weekdays:frequency==='WEEKLY'?weekdays:[],startDate:date,slotId:slot,items:selected});
    Alert.alert('Demo schedule saved','This schedule is not automatically fulfilled yet.');
   }else{
    const id='mobile-'+Date.now().toString(36);
    const event=await getEvent(id);
    await api('/dev/orders','POST',{id,slotId:slot,deliveryDate:date,items:selected,event});
    setCart({});
    Alert.alert('Demo order created','The order was stored in the local API memory only.');
   }
   await refresh();
  }catch(e){Alert.alert('Not completed',e instanceof Error?e.message:'Unknown error');}
  finally{setWorking(false);}
 }
 function changeRole(next:MobileRole){setRole(next);setScreen('Home');}
 function cards(){return <View style={styles.statGrid}><View style={styles.metric}><Text style={styles.muted}>Products</Text><Text style={styles.metricValue}>{summary?.metrics.variants??variants.length}</Text></View><View style={styles.metric}><Text style={styles.muted}>Demo orders</Text><Text style={styles.metricValue}>{summary?.metrics.orders??0}</Text></View><View style={styles.metric}><Text style={styles.muted}>Schedules</Text><Text style={styles.metricValue}>{summary?.metrics.recurringSchedules??0}</Text></View><View style={styles.metric}><Text style={styles.muted}>Delivery slots</Text><Text style={styles.metricValue}>{summary?.metrics.deliverySlots??slots.length}</Text></View></View>}
 function rows(){return <>{orders.length?orders.slice(-20).reverse().map(o=><View style={styles.listRow} key={o.id}><Text style={styles.bold}>Order {o.id.slice(0,12)}</Text><Text style={styles.muted}>{o.deliveryDate} · {o.state||'CONFIRMED'} · {o.items.length} items</Text><Text style={styles.money}>{money(o.totalPaise)}</Text></View>):<Text style={styles.empty}>No demo orders yet.</Text>}</>;}
 function scheduleForm(recurring:boolean){return <View style={styles.card}><Text style={styles.heading}>Delivery details</Text><Text style={styles.label}>Delivery date (YYYY-MM-DD)</Text><TextInput value={date} onChangeText={setDate} style={styles.input} placeholder="2026-11-02"/><Text style={styles.label}>Delivery slot</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}>{slots.map(s=><P key={s.id} selected={slot===s.id} onPress={()=>setSlot(s.id)}>{s.label}</P>)}</ScrollView>
 {recurring&&<><Text style={styles.label}>Frequency</Text><View style={styles.wrap}><P selected={frequency==='DAILY'} onPress={()=>setFrequency('DAILY')}>Every day</P><P selected={frequency==='WEEKLY'} onPress={()=>setFrequency('WEEKLY')}>Selected weekdays</P></View>{frequency==='WEEKLY'&&<View style={styles.wrap}>{weekdayLabels.map((d,i)=><P key={d} selected={weekdays.includes(i)} onPress={()=>setWeekdays(old=>old.includes(i)?old.filter(x=>x!==i):[...old,i])}>{d}</P>)}</View>}</>}
 <Text style={styles.subtotal}>Total basket (demo): {money(sum)}</Text><Pressable disabled={working||!online} onPress={()=>void submit(recurring)} style={[styles.primary,working&&styles.disabled]}><Text style={styles.primaryText}>{recurring?'Save demo recurrence':'Place demo order'}</Text></Pressable></View>;}
 function section(){
  if(screen==='Catalogue'||screen==='Recurring')return <><View style={styles.card}><Text style={styles.heading}>{screen==='Catalogue'?'Choose your exact vegetable cut':'Recurring vegetable supply'}</Text><TextInput value={query} onChangeText={setQuery} placeholder="Search potato, grated, 10 mm..." style={styles.input}/><Text style={styles.muted}>{visible.length} available demo variants</Text></View>
    {visible.slice(0,100).map(v=><View style={styles.product} key={v.id}><Image style={styles.productImg} source={{uri:v.imageUrl}}/><View style={styles.productInfo}><Text style={styles.bold}>{v.vegetable}</Text><Text style={styles.muted}>{v.preparation.toLowerCase()} · {v.size.value}{v.size.kind==='numeric'?' '+(v.size.unit||'mm'):''}</Text><Text style={styles.money}>{money(v.pricePaisePerKg)} / kg (demo)</Text><View style={styles.counter}><P onPress={()=>adjust(v,-1)}>−</P><Text style={styles.bold}>{((cart[v.id]||0)/1000).toFixed(2)} kg</Text><P onPress={()=>adjust(v,1)}>+</P></View></View></View>)}
    {isBuyer(role)&&scheduleForm(screen==='Recurring')}</>;
  if(screen==='Orders')return <View style={styles.card}><Text style={styles.heading}>Order register</Text>{rows()}</View>;
  if(['Production','Quality','Packing','Deliveries'].includes(screen))return <StaffWorkBoard role={role} apiBase={BASE}/>;
  if(screen==='Home')return <><View style={styles.banner}><Text style={styles.bannerEyebrow}>FRESHPREP · MOBILE WORKSPACE</Text><Text style={styles.bannerTitle}>{isBuyer(role)?'Your kitchen, ready for service.':'Your shift, clearly organized.'}</Text><Text style={styles.bannerText}>{formatRole(role)} workspace · same lightweight app, different menus.</Text></View>{cards()}<View style={styles.card}><Text style={styles.heading}>Available actions</Text>{menuFor(role).filter(v=>v!=='Home').map(v=><P key={v} onPress={()=>setScreen(v)}>{v}  →</P>)}</View></>;
  return <><View style={styles.card}><Text style={styles.heading}>{screen} workspace</Text><Text style={styles.muted}>Role: {formatRole(role)}. The overview below shows demo information, not an authenticated staff assignment.</Text>{cards()}</View>
    {(screen==='Tasks'||screen==='Production'||screen==='Quality'||screen==='Packing'||screen==='Deliveries'||screen==='Inventory'||screen==='Admin')&&<View style={styles.card}><Text style={styles.heading}>Operational work queue (read only)</Text><Text style={styles.muted}>Requires verified roles, production batches and delivery assignments before live actions can be enabled.</Text>{Object.entries(summary?.stateCounts||{}).map(([state,count])=><View style={styles.listRow} key={state}><Text style={styles.bold}>{state.replaceAll('_',' ')}</Text><Text style={styles.money}>{count}</Text></View>)}</View>}
    {(screen==='Finance'||screen==='Admin')&&<View style={styles.card}><Text style={styles.heading}>Demo order value</Text><Text style={styles.metricValue}>{money(summary?.metrics.demoOrderValuePaise??0)}</Text><Text style={styles.muted}>Not payments or collected revenue.</Text></View>}</>;
 }
 return <SafeAreaView style={styles.safe} edges={['top','left','right','bottom']}><StatusBar barStyle="dark-content"/><View style={styles.header}><View><Text style={styles.logo}>❧ FreshPrep</Text><Text style={styles.logoSmall}>VEGGIES · ONE ROLE-BASED APP</Text></View><Pressable style={styles.refresh} onPress={()=>void refresh()}><Text style={styles.refreshText}>{working?'…':'↻'}</Text></Pressable></View>
 <View style={styles.demoBar}><Text style={styles.demoText}>LOCAL DEVELOPMENT · ROLE SWITCHER IS NOT LOGIN</Text></View>
 <ScrollView horizontal style={styles.roles} contentContainerStyle={styles.roleContent} showsHorizontalScrollIndicator={false}>{roles.map(v=><P key={v} selected={role===v} onPress={()=>changeRole(v)}>{formatRole(v)}</P>)}</ScrollView>
 <View style={styles.nav}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navInner}>{menuFor(role).map(v=><Pressable key={v} onPress={()=>setScreen(v)} style={[styles.navItem,screen===v&&styles.navActive]}><Text style={[styles.navText,screen===v&&styles.navTextActive]}>{v}</Text></Pressable>)}</ScrollView></View>
 <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} keyboardShouldPersistTaps="handled">
  {error? <View style={styles.error}><Text style={styles.errorText}>{error}</Text><Text style={styles.muted}>Android emulator uses 10.0.2.2. Never expose unauthenticated demo API to a public network.</Text></View>:null}
  {working&&<ActivityIndicator color="#166440"/>}{section()}
  <Text style={styles.footer}>FreshPrep pilot · Staff actions in the local app are simulations. Verified role login, production batch records and secure delivery proofs remain required.</Text>
 </ScrollView></SafeAreaView>;
}
export default function App(){return <SafeAreaProvider><AppContent/></SafeAreaProvider>;}
const GREEN='#155c3e',MUTED='#819087';
const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:'#f6f9f6'},header:{height:65,backgroundColor:'#fff',paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 logo:{fontSize:23,fontWeight:'900',color:GREEN},logoSmall:{fontSize:9,letterSpacing:1.4,color:MUTED,marginTop:2},refresh:{padding:12},refreshText:{fontSize:25,color:GREEN},
 demoBar:{backgroundColor:'#fff4dc',paddingVertical:7,paddingHorizontal:16},demoText:{fontSize:10,color:'#795921',fontWeight:'800',letterSpacing:.6},
 roles:{maxHeight:59,backgroundColor:'#fff'},roleContent:{alignItems:'center',paddingHorizontal:12,gap:5,paddingVertical:7},
 nav:{backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#e0e9e1'},navInner:{gap:15,paddingHorizontal:16},navItem:{paddingVertical:12},navActive:{borderBottomWidth:3,borderBottomColor:GREEN},navText:{fontSize:12,color:MUTED,fontWeight:'700'},navTextActive:{color:GREEN},
 content:{flex:1},contentInner:{padding:15,paddingBottom:45},pill:{backgroundColor:'#f1f5f0',borderRadius:9,paddingVertical:9,paddingHorizontal:13,marginRight:5,marginBottom:5,borderWidth:1,borderColor:'#e0ebe0'},pillActive:{backgroundColor:GREEN,borderColor:GREEN},pillText:{fontSize:11,color:GREEN,fontWeight:'800'},pillTextActive:{color:'#fff'},disabled:{opacity:.5},
 banner:{backgroundColor:GREEN,padding:23,borderRadius:16,marginBottom:13},bannerEyebrow:{color:'#b3ddb7',letterSpacing:1.3,fontSize:10,fontWeight:'800'},bannerTitle:{fontSize:27,color:'#fff',fontWeight:'900',marginVertical:12},bannerText:{color:'#d4eade',fontSize:12,lineHeight:20},
 statGrid:{flexDirection:'row',flexWrap:'wrap',gap:9,marginVertical:10},metric:{backgroundColor:'#fff',borderWidth:1,borderColor:'#e6efe8',padding:16,borderRadius:12,width:'48%'},metricValue:{fontSize:28,fontWeight:'900',color:GREEN,marginTop:7},
 muted:{fontSize:11,color:MUTED,lineHeight:18},card:{backgroundColor:'#fff',borderWidth:1,borderColor:'#e5ebe5',padding:17,borderRadius:13,marginBottom:12},heading:{fontSize:17,fontWeight:'900',color:'#174b32',marginBottom:12},
 input:{borderWidth:1,borderColor:'#dce6de',backgroundColor:'#fff',borderRadius:9,padding:12,color:'#26392b',marginBottom:9,fontSize:13},label:{fontSize:12,fontWeight:'800',color:'#4b654e',marginTop:11,marginBottom:5},
 wrap:{flexDirection:'row',flexWrap:'wrap',gap:3,marginTop:7},product:{backgroundColor:'#fff',borderWidth:1,borderColor:'#e6ede5',borderRadius:12,padding:11,flexDirection:'row',gap:12,marginBottom:8},
 productImg:{width:96,height:102,borderRadius:9,backgroundColor:'#edf1ea'},productInfo:{flex:1},bold:{fontWeight:'800',fontSize:13,color:'#304237'},money:{fontSize:12,fontWeight:'800',color:GREEN,marginVertical:5},
 counter:{flexDirection:'row',alignItems:'center',gap:7},primary:{backgroundColor:GREEN,padding:14,borderRadius:10,alignItems:'center',marginTop:11},primaryText:{fontSize:13,fontWeight:'900',color:'#fff'},subtotal:{fontWeight:'900',color:GREEN,marginTop:16},
 listRow:{paddingVertical:12,borderBottomWidth:1,borderBottomColor:'#edf0ed'},empty:{fontSize:12,color:MUTED,padding:16},error:{backgroundColor:'#fff0ed',padding:13,marginBottom:12,borderRadius:9},errorText:{fontSize:12,color:'#b7352a',marginBottom:7},
 footer:{fontSize:11,color:MUTED,textAlign:'center',marginTop:21,lineHeight:17}
});
