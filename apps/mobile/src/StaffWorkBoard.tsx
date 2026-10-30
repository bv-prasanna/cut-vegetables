import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Alert,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import * as Location from 'expo-location';
import type {MobileRole} from './roles';
type Role='CUTTER'|'QC'|'PACKER'|'DISPATCH'|'DELIVERY';
type Plan={deliveryDate:string;slotId:string;slotLabel:string;variantId:string;vegetable:string;preparation:string;size:string;grams:number;orderCount:number};
type Pack={orderId:string;deliveryDate:string;slotId:string;slotLabel:string;state:string;totalGrams:number;lines:{variantId:string;description:string;grams:number}[]};
type Deliver={orderId:string;deliveryDate:string;slotId:string;slotLabel:string;state:string;totalGrams:number};
type Props={role:MobileRole;apiBase:string};
const stage:Record<Role,{from:string;to:string;label:string}>={
 CUTTER:{from:'CONFIRMED',to:'IN_PRODUCTION',label:'Start Cutting'},
 QC:{from:'IN_PRODUCTION',to:'QC_PASSED',label:'Approve QC (Demo)'},
 PACKER:{from:'QC_PASSED',to:'PACKED',label:'Pack Order (Demo)'},
 DISPATCH:{from:'PACKED',to:'DISPATCHED',label:'Dispatch Order'},
 DELIVERY:{from:'DISPATCHED',to:'DELIVERED',label:'Confirm Delivery'}
};
const kg=(v:number)=>(v/1000).toFixed(2)+' kg';
async function load<T>(base:string,path:string,method='GET',body?:unknown):Promise<T>{
 const r=await fetch(base+path,{method,headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
 const value=await r.json();if(!r.ok)throw Error(value.error||'API error');return value as T;
}
async function locationForAction(){
 const unavailable=(reason:string,status:'NOT_REQUESTED'|'DENIED'='NOT_REQUESTED')=>({source:'UNAVAILABLE',unavailableReason:reason,consentStatus:status});
 try{
  const permission=await Location.requestForegroundPermissionsAsync();
  if(permission.status!=='granted')return unavailable('Location permission denied','DENIED');
  const p=await Promise.race([
    Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced}),
    new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Location request timed out')),5000))
  ]);
  return {source:'DEVICE_GPS',latitude:p.coords.latitude,longitude:p.coords.longitude,
   accuracyMeters:Math.max(0,p.coords.accuracy??0),capturedAt:new Date(p.timestamp).toISOString(),consentStatus:'GRANTED'};
 }catch(e){return unavailable(e instanceof Error?e.message:'Location unavailable');}
}
export default function StaffWorkBoard({role,apiBase}:Props){
 const effective:Role=role==='PACKER'?'PACKER':role==='QC'?'QC':role==='DELIVERY'?'DELIVERY':role==='DISPATCH'?'DISPATCH':'CUTTER';
 const [plan,setPlan]=useState<Plan[]>([]),[packing,setPacking]=useState<Pack[]>([]),[delivery,setDelivery]=useState<Deliver[]>([]);
 const [date,setDate]=useState(''),[slot,setSlot]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{
  setBusy(true);setError('');
  const q=new URLSearchParams();if(/^\d{4}-\d{2}-\d{2}$/.test(date))q.set('date',date);if(slot)q.set('slotId',slot);
  const qs=q.toString()?'?'+q.toString():'';
  try{
   const [p,k,d]=await Promise.all([
    load<Plan[]>(apiBase,'/dev/staff/production'+qs),load<Pack[]>(apiBase,'/dev/staff/packing'+qs),load<Deliver[]>(apiBase,'/dev/staff/delivery'+qs)
   ]);setPlan(p);setPacking(k);setDelivery(d);
  }catch(e){setError(e instanceof Error?e.message:'Unable to load shift tasks');}
  finally{setBusy(false);}
 },[apiBase,date,slot]);
 useEffect(()=>{void refresh()},[refresh]);
 const slots=useMemo(()=>[...new Map(plan.map(p=>[p.slotId,p.slotLabel])).entries()],[plan]);
 const list=effective==='DELIVERY'||effective==='DISPATCH'?delivery:packing;
 const dailyTotals=useMemo(()=>{
  const totals=new Map<string,{date:string;description:string;grams:number;slots:Map<string,number>}>();
  for(const row of plan){
   const key=row.deliveryDate+'|'+row.variantId;
   let v=totals.get(key);
   if(!v){v={date:row.deliveryDate,description:row.vegetable+' · '+row.preparation+' · '+row.size,grams:0,slots:new Map()};totals.set(key,v);}
   v.grams+=row.grams;v.slots.set(row.slotLabel,(v.slots.get(row.slotLabel)||0)+row.grams);
  }
  return [...totals.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.description.localeCompare(b.description));
 },[plan]);

 async function advance(orderId:string){
  setBusy(true);
  try{
   const result=await load<{state:string}>(apiBase,'/dev/staff/orders/'+encodeURIComponent(orderId)+'/advance','POST',{
    role:effective,nextState:stage[effective].to,location:await locationForAction()
   });
   Alert.alert('Demo status updated',result.state+' — not a real QC, packing or delivery verification.');
   await refresh();
  }catch(e){Alert.alert('Unable to update',e instanceof Error?e.message:'Stage rejected');}
  finally{setBusy(false);}
 }
 return <View><View style={styles.notice}><Text style={styles.noticeText}>Staff demo only. Role switching does not authenticate you. No physical QC, packaging or proof of delivery is verified.</Text></View>
 <Text style={styles.heading}>{effective==='CUTTER'?'Consolidated Cutting Plan':effective==='PACKER'?'Order Packing Dashboard':effective==='QC'?'Quality Control Queue':effective==='DISPATCH'?'Dispatch Dashboard':'Assigned Delivery Preview'}</Text>
 <View style={styles.filters}><TextInput style={styles.dateInput} value={date} onChangeText={setDate} placeholder="Delivery date YYYY-MM-DD"/><Pressable onPress={()=>{setDate('');setSlot('')}} style={styles.clear}><Text style={styles.clearText}>All dates</Text></Pressable></View>
 <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.slotRow}><Pressable style={[styles.slot,slot===''&&styles.active]} onPress={()=>setSlot('')}><Text style={styles.slotText}>All Slots</Text></Pressable>{slots.map(([id,label])=><Pressable key={id} style={[styles.slot,slot===id&&styles.active]} onPress={()=>setSlot(id)}><Text style={styles.slotText}>{label}</Text></Pressable>)}</ScrollView>
 {busy&&<ActivityIndicator color="#175d3d"/>}{!!error&&<Text style={styles.error}>{error}</Text>}
 {effective==='CUTTER'&&<><Text style={styles.heading}>Daily totals across all slots</Text>{dailyTotals.map(row=><View style={styles.card} key={row.date+'|'+row.description}><Text style={styles.caption}>{row.date}</Text><Text style={styles.item}>{row.description}</Text><Text style={styles.amount}>{kg(row.grams)}</Text>{[...row.slots.entries()].map(([label,grams])=><Text style={styles.caption} key={label}>{label}: {kg(grams)}</Text>)}</View>)}<Text style={styles.summary}>Total cutting required: {kg(plan.reduce((n,p)=>n+p.grams,0))}</Text>{plan.map(row=><View style={styles.card} key={row.deliveryDate+row.slotId+row.variantId}><Text style={styles.caption}>{row.deliveryDate} · {row.slotLabel}</Text><Text style={styles.item}>{row.vegetable} · {row.preparation.toLowerCase()} · {row.size}</Text><View style={styles.quantity}><Text style={styles.amount}>{kg(row.grams)}</Text><Text style={styles.caption}>{row.orderCount} orders</Text></View></View>)}</>}
 <Text style={styles.heading}>{effective==='CUTTER'?'Orders to start':effective==='PACKER'?'Packing list by customer order':effective==='DELIVERY'?'Orders for dispatch and delivery':'Order work queue'}</Text>
 {list.length===0&&!busy&&<Text style={styles.empty}>No accepted orders in this delivery window.</Text>}
 {list.map(o=><View style={styles.card} key={o.orderId}><Text style={styles.caption}>{o.deliveryDate} · {o.slotLabel}</Text><View style={styles.quantity}><Text style={styles.item}>Order {o.orderId.slice(0,10)}</Text><Text style={styles.stage}>{o.state.replaceAll('_',' ')}</Text></View>
 {'lines' in o&&o.lines.map(item=><View style={styles.detail} key={item.variantId}><Text style={styles.description}>{item.description}</Text><Text style={styles.item}>{kg(item.grams)}</Text></View>)}
 <Text style={styles.total}>Total: {kg(o.totalGrams)}</Text>{o.state===stage[effective].from?<Pressable style={styles.action} disabled={busy} onPress={()=>void advance(o.orderId)}><Text style={styles.actionText}>{stage[effective].label}</Text></Pressable>:<Text style={styles.caption}>Awaiting required stage / already processed</Text>}</View>)}
 </View>;
}
const styles=StyleSheet.create({
 heading:{fontSize:18,color:'#144d32',fontWeight:'900',marginVertical:13},notice:{backgroundColor:'#fff3d9',padding:12,borderRadius:9,marginBottom:12},noticeText:{fontSize:11,color:'#815e24',lineHeight:17},
 filters:{flexDirection:'row',gap:8,alignItems:'center'},dateInput:{flex:1,backgroundColor:'#fff',borderWidth:1,borderColor:'#dce8df',padding:11,borderRadius:8,fontSize:12},clear:{padding:12,backgroundColor:'#e8f2e8',borderRadius:8},clearText:{color:'#155d3c',fontSize:11,fontWeight:'800'},
 slotRow:{gap:7,paddingVertical:12},slot:{borderColor:'#dce8df',borderWidth:1,padding:10,backgroundColor:'#fff',borderRadius:9},active:{backgroundColor:'#dcefd9'},slotText:{color:'#215d3b',fontSize:11,fontWeight:'700'},
 summary:{fontSize:12,color:'#255d3f',fontWeight:'800',marginVertical:11},card:{backgroundColor:'#fff',borderRadius:12,borderWidth:1,borderColor:'#e4ede5',padding:14,marginBottom:10},
 item:{fontSize:13,fontWeight:'800',color:'#223e2c'},amount:{fontSize:18,fontWeight:'900',color:'#18633e'},quantity:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginVertical:9,gap:10},
 caption:{fontSize:11,color:'#85948b'},stage:{fontSize:10,color:'#3c7c51',fontWeight:'800'},detail:{flexDirection:'row',justifyContent:'space-between',paddingVertical:8,borderBottomWidth:1,borderBottomColor:'#edf2ee'},description:{fontSize:11,color:'#526958',flex:1},
 total:{fontSize:12,color:'#185839',fontWeight:'800',marginVertical:10},action:{backgroundColor:'#16613e',padding:12,borderRadius:9,alignItems:'center'},actionText:{color:'#fff',fontWeight:'800',fontSize:12},empty:{fontSize:12,color:'#849286',padding:15},error:{fontSize:12,color:'#b03933'}
});
