import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Alert,Pressable,ScrollView,StatusBar,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView,SafeAreaProvider} from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import {backend,firstAllowedScreen,screenPermissions,sizeDescription,validateApiBase,
 type Session,type Identity,type CatalogueVariant,type Kitchen,type DeliverySlot,type Order,type StaffBoardRow} from './secure-api';

type Fields=Record<string,string>;
type Recurrence={id:string;state:string;frequency:string;start_date:string;weekdays:number[];slot_id:string};
type Mutation='SUPPLIER'|'PURCHASE'|'RECEIVE'|'BATCH'|'COMPLETE'|'QC'|'PACK'|'RUN'|'STOP'|'POD';
type Operation={
 title:string;path:string;method:'POST';eventType:string;subjectType:string;
 fields:{key:string;title:string;type?:'number'|'text'}[];
};
const operations:Record<Mutation,Operation>={
 SUPPLIER:{title:'Create supplier',path:'/v1/ops/suppliers',method:'POST',eventType:'SUPPLIER_CREATED',subjectType:'SUPPLIER',fields:[{key:'name',title:'Supplier business name'}]},
 PURCHASE:{title:'Create purchase order',path:'/v1/ops/purchases',method:'POST',eventType:'PURCHASE_ORDER_CREATED',subjectType:'PURCHASE',fields:[{key:'supplierId',title:'Supplier UUID'}]},
 RECEIVE:{title:'Receive raw lot',path:'/v1/ops/purchases/{id}/receive',method:'POST',eventType:'RAW_LOT_RECEIVED',subjectType:'RAW_LOT',fields:[{key:'id',title:'Purchase UUID'},{key:'vegetableId',title:'Vegetable UUID'},{key:'receivedGrams',title:'Received grams',type:'number'},{key:'usableGrams',title:'Usable grams',type:'number'},{key:'rejectedGrams',title:'Rejected grams',type:'number'},{key:'supplierLot',title:'Supplier lot reference'}]},
 BATCH:{title:'Start production batch',path:'/v1/ops/batches',method:'POST',eventType:'PRODUCTION_BATCH_STARTED',subjectType:'BATCH',fields:[{key:'orderId',title:'Order UUID'},{key:'variantId',title:'Cut variant UUID'},{key:'rawLotId',title:'Raw lot UUID'},{key:'inputGrams',title:'Input grams',type:'number'}]},
 COMPLETE:{title:'Record batch output',path:'/v1/ops/batches/{id}/complete',method:'POST',eventType:'PRODUCTION_BATCH_COMPLETED',subjectType:'BATCH',fields:[{key:'id',title:'Production batch UUID'},{key:'outputGrams',title:'Finished grams',type:'number'},{key:'wasteGrams',title:'Waste grams',type:'number'}]},
 QC:{title:'QC inspection',path:'/v1/ops/batches/{id}/qc',method:'POST',eventType:'QC_CHECK_RECORDED',subjectType:'QC_CHECK',fields:[{key:'id',title:'Batch UUID'},{key:'passed',title:'Passed? Enter true / false'},{key:'findings',title:'Inspection findings'},{key:'temperatureC',title:'Measured temperature °C',type:'number'}]},
 PACK:{title:'Record labelled pack',path:'/v1/ops/batches/{id}/pack',method:'POST',eventType:'PACK_UNIT_CREATED',subjectType:'PACK_UNIT',fields:[{key:'id',title:'QC-approved batch UUID'},{key:'netGrams',title:'Net pack grams',type:'number'},{key:'labelCode',title:'Unique printed label code'},{key:'useBy',title:'Use by (ISO with timezone)'}]},
 RUN:{title:'Create driver run',path:'/v1/ops/runs',method:'POST',eventType:'DELIVERY_RUN_CREATED',subjectType:'DELIVERY_RUN',fields:[{key:'slotId',title:'Delivery slot UUID'},{key:'deliveryDate',title:'Delivery date YYYY-MM-DD'},{key:'driverId',title:'Assigned driver UUID'}]},
 STOP:{title:'Assign order to driver run',path:'/v1/ops/runs/{id}/stops',method:'POST',eventType:'DELIVERY_STOP_ASSIGNED',subjectType:'DELIVERY_STOP',fields:[{key:'id',title:'Delivery run UUID'},{key:'orderId',title:'Packed order UUID'},{key:'stopNumber',title:'Stop number',type:'number'}]},
 POD:{title:'Confirm delivery handover',path:'/v1/ops/stops/{id}/complete',method:'POST',eventType:'DELIVERY_POD_CAPTURED',subjectType:'DELIVERY_STOP',fields:[{key:'id',title:'Assigned stop UUID'},{key:'receivedBy',title:'Receiver full name'},{key:'notes',title:'Handover notes'}]}
};
const palette={green:'#175a3a',light:'#edf5ed',muted:'#748676'};
const kg=(n:unknown)=>((Number(n)||0)/1000).toLocaleString('en-IN',{maximumFractionDigits:2})+' kg';

async function captureEvent(op:Operation,subjectId:string){
 let location:{source:string;unavailableReason?:string;consentStatus:string;latitude?:number;longitude?:number;accuracyMeters?:number;capturedAt?:string}=
  {source:'UNAVAILABLE',unavailableReason:'Device location not requested',consentStatus:'NOT_REQUESTED'};
 try{
  const granted=await Location.requestForegroundPermissionsAsync();
  if(granted.status==='granted'){
   const pos=await Promise.race([Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced}),
    new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('GPS timeout')),6000))]);
   location={source:'DEVICE_GPS',latitude:pos.coords.latitude,longitude:pos.coords.longitude,
    accuracyMeters:Math.max(0,pos.coords.accuracy??0),capturedAt:new Date(pos.timestamp).toISOString(),consentStatus:'GRANTED'};
  }else location={source:'UNAVAILABLE',unavailableReason:'Location permission denied',consentStatus:'DENIED'};
 }catch{location={source:'UNAVAILABLE',unavailableReason:'Device location unavailable',consentStatus:'NOT_REQUESTED'};}
 return {eventType:op.eventType,subjectType:op.subjectType,
  subjectId,location,details:{client:'freshprep-mobile',recordedAt:new Date().toISOString()}};
}

function Input({title,value,onChange,secret=false,numeric=false}:{title:string;value:string;onChange:(v:string)=>void;secret?:boolean;numeric?:boolean}){
 return <View style={styles.field}><Text style={styles.label}>{title}</Text><TextInput
  value={value} onChangeText={onChange} secureTextEntry={secret}
  keyboardType={numeric?'numeric':'default'} autoCapitalize="none" autoCorrect={false}
  style={styles.input} placeholder={title} placeholderTextColor="#87968a"/></View>;
}
function Btn({text,onPress,disabled=false,secondary=false}:{text:string;onPress:()=>void;disabled?:boolean;secondary?:boolean}){
 return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
  style={[styles.button,secondary&&styles.buttonSecondary,disabled&&styles.disabled]}>
  <Text style={[styles.buttonLabel,secondary&&styles.buttonSecondaryLabel]}>{text}</Text></Pressable>;
}
function AuthenticatedMobile(){
 const baseConfig=process.env.EXPO_PUBLIC_API_URL;
 let base='',baseError='';
 try{base=validateApiBase(baseConfig);}catch(e){baseError=e instanceof Error?e.message:'API not configured';}
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[organizationId,setOrganizationId]=useState('');
 const [session,setSession]=useState<Session|null>(null),[identity,setIdentity]=useState<Identity|null>(null);
 const [screen,setScreen]=useState('Home'),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [data,setData]=useState<unknown[]>([]),[date,setDate]=useState(new Date().toISOString().slice(0,10));
 const [catalogue,setCatalogue]=useState<CatalogueVariant[]>([]),[kitchens,setKitchens]=useState<Kitchen[]>([]),[slots,setSlots]=useState<DeliverySlot[]>([]);
 const [cart,setCart]=useState<Record<string,number>>({}),[kitchenId,setKitchenId]=useState(''),[slotId,setSlotId]=useState('');
 const [recurrences,setRecurrences]=useState<Recurrence[]>([]),[frequency,setFrequency]=useState<'DAILY'|'WEEKLY'>('WEEKLY');
 const [weekdays,setWeekdays]=useState<number[]>([1,2,3,4,5,6]);
 const [operation,setOperation]=useState<Mutation>('BATCH'),[fields,setFields]=useState<Fields>({});
 const screens=screenPermissions(identity?.roles||[]);
 const call=useCallback(async<T,>(path:string,method='GET',payload?:unknown):Promise<T>=>{
  if(!session)throw Error('Not signed in');
  try{return await backend<T>(base,path,session.accessToken,method,payload);}
  catch(e){
   if((e as {status?:number}).status===401){setSession(null);setIdentity(null);setError('Session expired. Please sign in again.');}
   throw e;
  }
 },[base,session]);
 async function login(){
  if(!base)return;
  setLoading(true);setError('');
  try{
   const login=await backend<Session>(base,'/auth/login',undefined,'POST',{email:email.trim(),password,organizationId:organizationId.trim()});
   const who=await backend<Identity>(base,'/v1/me',login.accessToken);
   setSession(login);setIdentity(who);setScreen(firstAllowedScreen(who.roles));setPassword('');
  }catch(e){setError(e instanceof Error?e.message:'Unable to authenticate');}
  finally{setLoading(false);}
 }
 async function logout(){
  const token=session?.accessToken;setSession(null);setIdentity(null);setData([]);setCart({});setPassword('');
  if(token)await backend(base,'/v1/logout',token,'POST').catch(()=>{});
 }
 const refresh=useCallback(async()=>{
  if(!session||!identity)return;
  setLoading(true);setError('');
  try{
   let path='';
   if(screen==='Catalogue'||screen==='Place Order'||screen==='Recurring')path='/v1/catalog';
   if(screen==='Orders')path='/v1/orders';
   if(screen==='Cutting')path='/v1/ops/production-plan?date='+encodeURIComponent(date);
   if(screen==='Quality'||screen==='Packing')path='/v1/ops/batches';
   if(screen==='Procurement')path='/v1/ops/raw-lots';
   if(screen==='Delivery')path='/v1/ops/stops';
   if(screen==='Administration')path='/v1/admin/overview';
   if(path){
    const result=await call<unknown>(path);
    if(screen==='Catalogue'||screen==='Place Order'||screen==='Recurring')setCatalogue(result as CatalogueVariant[]);
    else setData(Array.isArray(result)?result:[result]);
   }
   if(screen==='Place Order'||screen==='Recurring'){
    const [k,s]=await Promise.all([call<Kitchen[]>('/v1/kitchens'),call<DeliverySlot[]>('/v1/delivery-slots')]);
    setKitchens(k);setSlots(s);
    if(k.length)setKitchenId(old=>old||k[0].id);
    if(s.length)setSlotId(old=>old||s[0].id);
    if(screen==='Recurring')setRecurrences(await call<Recurrence[]>('/v1/recurrences'));
   }
  }catch(e){setError(e instanceof Error?e.message:'Unable to load this screen');}
  finally{setLoading(false);}
 },[call,screen,date,identity,session]);
 useEffect(()=>{void refresh();},[refresh]);
 const selected=Object.entries(cart).filter(([,g])=>g>0).map(([variantId,grams])=>({variantId,grams}));
 function increment(v:CatalogueVariant,sign:1|-1){
  setCart(old=>({...old,[v.id]:Math.max(0,(old[v.id]||0)+sign*(old[v.id]?v.increment_grams:v.minimum_grams))}));
 }
 async function placeOrder(){
  if(!kitchenId||!slotId||!selected.length){Alert.alert('Order incomplete','Choose a kitchen, delivery window and at least one product.');return;}
  setLoading(true);setError('');
  try{
   const subjectId='request-'+Date.now();
   const ev=await captureEvent({title:'Order',path:'',method:'POST',fields:[],eventType:'ORDER_CREATED',subjectType:'ORDER'},subjectId);
   const result=await call<{id:string}>('/v1/orders','POST',{
    kitchenId,slotId,deliveryDate:date,idempotencyKey:subjectId+'-'+Math.random().toString(36).slice(2),items:selected,event:ev
   });
   setCart({});Alert.alert('Order confirmed','Order reference: '+result.id);setScreen('Orders');
  }catch(e){setError(e instanceof Error?e.message:'Unable to submit order');}finally{setLoading(false);}
 }
 async function placeRecurrence(){
  if(!identity?.roles.some(r=>['SUPERADMIN','CUSTOMER_BUYER','CUSTOMER_ADMIN'].includes(r))){
   Alert.alert('Read-only account','This account cannot manage delivery schedules.');return;
  }
  if(!kitchenId||!slotId||!selected.length){Alert.alert('Schedule incomplete','Select a kitchen, slot and products.');return;}
  if(frequency==='WEEKLY'&&!weekdays.length){Alert.alert('Choose weekdays','Select one or more delivery days.');return;}
  setLoading(true);setError('');
  try{
   const ev=await captureEvent({title:'Schedule',path:'',method:'POST',fields:[],
    eventType:'RECURRING_SCHEDULE_CREATED',subjectType:'SCHEDULE'},'pending');
   const r=await call<{id:string}>('/v1/recurrences','POST',{
    kitchenId,slotId,startDate:date,frequency,weekdays:frequency==='WEEKLY'?weekdays:[],items:selected,event:ev
   });
   Alert.alert('Schedule saved','ID: '+r.id+'. Administrator generation is required before each cutoff.');
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Unable to save recurring schedule');}
  finally{setLoading(false);}
 }
 async function changeRecurrence(s:Recurrence,state:'ACTIVE'|'PAUSED'|'CANCELLED'){
  setLoading(true);setError('');
  try{
   await call('/v1/recurrences/'+s.id,'PATCH',{state});
   await refresh();
   Alert.alert('Schedule updated','Status: '+state);
  }catch(e){setError(e instanceof Error?e.message:'Schedule update rejected');}
  finally{setLoading(false);}
 }
 async function skipRecurrence(s:Recurrence){
  setLoading(true);setError('');
  try{
   await call('/v1/recurrences/'+s.id+'/skips','POST',{deliveryDate:date,reason:'Customer requested skipped delivery'});
   Alert.alert('Delivery skipped','Skipped '+date+'. An existing confirmed order is not cancelled by skipping.');
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Unable to skip this delivery');}
  finally{setLoading(false);}
 }
 async function submitAction(){
  const op=operations[operation];
  const required=op.fields.filter(x=>!['supplierLot','notes','temperatureC'].includes(x.key));
  if(required.some(x=>!fields[x.key]?.trim())){Alert.alert('Missing fields','Complete the required identifiers and quantities.');return;}
  if(operation==='QC'&&!['true','false'].includes((fields.passed||'').toLowerCase())){
   Alert.alert('QC result required','Enter true for pass or false for reject.');return;
  }
  setLoading(true);setError('');
  try{
   const {id,...body}=fields;
   const payload:Record<string,unknown>={};
   for(const input of op.fields){
    if(input.key==='id'||!fields[input.key]?.trim())continue;
    payload[input.key]=input.type==='number'?Number(fields[input.key]):input.key==='passed'?fields[input.key].toLowerCase()==='true':fields[input.key].trim();
   }
   const ev=await captureEvent(op,id||'pending');
   const path=op.path.replace('{id}',encodeURIComponent(id||''));
   await call(path,'POST',{...payload,event:ev});
   setFields({});Alert.alert('Saved to PostgreSQL',op.title+' was recorded.');
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Operation rejected');}finally{setLoading(false);}
 }
 function actionsForScreen():Mutation[]{
  if(screen==='Procurement')return ['SUPPLIER','PURCHASE','RECEIVE'];
  if(screen==='Cutting')return ['BATCH','COMPLETE'];
  if(screen==='Quality')return ['QC'];
  if(screen==='Packing')return ['PACK'];
  if(screen==='Delivery')return identity?.roles.includes('DRIVER')&&!identity.roles.includes('DISPATCH')&&!identity.roles.includes('SUPERADMIN')?['POD']:['RUN','STOP','POD'];
  return [];
 }
 const ops=actionsForScreen();
 const action:Mutation=ops.includes(operation)?operation:(ops[0]??'BATCH');
 if(!base)return <SafeAreaView style={styles.safe}><View style={styles.content}><Text style={styles.heading}>FreshPrep requires secure API configuration</Text><Text style={styles.error}>{baseError}</Text><Text style={styles.muted}>Set EXPO_PUBLIC_API_URL to an HTTPS backend and rebuild the mobile app. Demo access is disabled.</Text></View></SafeAreaView>;
 if(!session||!identity)return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content}>
  <Text style={styles.brand}>❧ FreshPrep Veggies</Text><Text style={styles.heading}>Secure sign in</Text>
  <Text style={styles.muted}>One application for customers, procurement, cutters, QC, packing and delivery. Permissions come from the server.</Text>
  <Input title="Account email" value={email} onChange={setEmail}/>
  <Input title="Password" value={password} onChange={setPassword} secret/>
  <Input title="Organisation UUID" value={organizationId} onChange={setOrganizationId}/>
  {Boolean(error)&&<Text style={styles.error}>{error}</Text>}
  <Btn text={loading?'Signing in…':'Sign in with JWT'} disabled={loading} onPress={()=>void login()}/>
  <Text style={styles.muted}>For security, the access token remains in memory. The app will require a fresh sign-in when reopened.</Text>
 </ScrollView></SafeAreaView>;
 return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content"/>
 <View style={styles.header}><Text style={styles.brand}>❧ FreshPrep</Text><Btn text="Sign out" secondary onPress={()=>void logout()}/></View>
 <Text style={styles.role}>Verified roles: {identity.roles.join(' · ')}</Text>
 <ScrollView horizontal contentContainerStyle={styles.nav} showsHorizontalScrollIndicator={false}>
  {screens.map(s=><Pressable key={s} style={[styles.tab,screen===s&&styles.tabActive]} onPress={()=>{setScreen(s);setData([]);setError('')}}><Text style={[styles.tabText,screen===s&&styles.tabTextActive]}>{s}</Text></Pressable>)}
 </ScrollView>
 <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
  <View style={styles.row}><Text style={styles.heading}>{screen}</Text><Btn text="↻ Refresh" secondary onPress={()=>void refresh()}/></View>
  {loading&&<ActivityIndicator color={palette.green}/>}
  {Boolean(error)&&<Text style={styles.error}>{error}</Text>}
  {screen==='Home'&&<View style={styles.card}><Text style={styles.heading}>Your FreshPrep workspaces</Text>
   <Text style={styles.muted}>Your menus reflect active database memberships. No local role switching is permitted.</Text>
   {screens.filter(s=>s!=='Home').map(s=><Btn key={s} text={s+' →'} secondary onPress={()=>setScreen(s)}/>)}</View>}
  {(screen==='Catalogue'||screen==='Place Order'||screen==='Recurring')&&<>{catalogue.map(v=><View key={v.id} style={styles.card}>
   <Text style={styles.item}>{v.vegetable} · {v.preparation.toLowerCase()} · {sizeDescription(v)}</Text>
   <Text style={styles.muted}>₹{(v.price_paise_per_kg/100).toFixed(2)}/kg · min {kg(v.minimum_grams)} · step {kg(v.increment_grams)}</Text>
   {(screen==='Place Order'||screen==='Recurring')&&identity.roles.some(r=>['SUPERADMIN','CUSTOMER_BUYER','CUSTOMER_ADMIN'].includes(r))&&<View style={styles.row}><Btn text="−" secondary onPress={()=>increment(v,-1)}/><Text>{kg(cart[v.id]||0)}</Text><Btn text="+" secondary onPress={()=>increment(v,1)}/></View>}
  </View>)}
  {(screen==='Place Order'||screen==='Recurring')&&<View style={styles.card}><Text style={styles.heading}>Delivery details</Text>
   <Input title="Delivery date YYYY-MM-DD" value={date} onChange={setDate}/>
   <Text style={styles.label}>Choose kitchen</Text>{kitchens.map(k=><Btn key={k.id} secondary={kitchenId!==k.id} text={k.name+' · '+k.zone_code} onPress={()=>setKitchenId(k.id)}/>)}
   <Text style={styles.label}>Delivery time window</Text>{slots.filter(s=>!kitchens.find(k=>k.id===kitchenId)||s.zone_code===kitchens.find(k=>k.id===kitchenId)?.zone_code).map(s=><Btn key={s.id} secondary={slotId!==s.id} text={s.label} onPress={()=>setSlotId(s.id)}/>)}
   {screen==='Recurring'&&<>
    <Text style={styles.label}>Delivery frequency</Text>
    <View style={styles.row}><Btn text="Daily" secondary={frequency!=='DAILY'} onPress={()=>setFrequency('DAILY')}/><Btn text="Selected weekdays" secondary={frequency!=='WEEKLY'} onPress={()=>setFrequency('WEEKLY')}/></View>
    {frequency==='WEEKLY'&&<View style={styles.row}>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day,index)=><Btn key={day} text={day} secondary={!weekdays.includes(index)} onPress={()=>setWeekdays(old=>old.includes(index)?old.filter(x=>x!==index):[...old,index])}/>)}</View>}
   </>}
   <Text style={styles.item}>{selected.length} items selected</Text>
   {identity.roles.some(r=>['SUPERADMIN','CUSTOMER_BUYER','CUSTOMER_ADMIN'].includes(r))&&
    <Btn text={screen==='Recurring'?'Create recurring schedule':'Submit confirmed order'} disabled={loading} onPress={()=>screen==='Recurring'?void placeRecurrence():void placeOrder()}/>}
   {screen==='Recurring'&&<><Text style={styles.heading}>Saved schedules</Text>
    {recurrences.map(rec=><View key={rec.id} style={styles.card}><Text style={styles.item}>{rec.frequency} · {rec.state}</Text><Text style={styles.muted}>From {rec.start_date} · {rec.id}</Text>
    {identity.roles.some(r=>['SUPERADMIN','CUSTOMER_BUYER','CUSTOMER_ADMIN'].includes(r))&&rec.state!=='CANCELLED'&&<View style={styles.row}>
     <Btn text={rec.state==='ACTIVE'?'Pause':'Resume'} secondary onPress={()=>void changeRecurrence(rec,rec.state==='ACTIVE'?'PAUSED':'ACTIVE')}/>
     <Btn text="Skip selected date" secondary onPress={()=>void skipRecurrence(rec)}/>
     <Btn text="Cancel" secondary onPress={()=>void changeRecurrence(rec,'CANCELLED')}/>
    </View>}</View>)}
   </>}
  </View>}</>}
  {['Cutting','Packing','Delivery'].includes(screen)&&<Input title="Delivery date YYYY-MM-DD" value={date} onChange={setDate}/>}
  {screen!=='Home'&&screen!=='Catalogue'&&screen!=='Place Order'&&screen!=='Recurring'&&data.map((row,index)=><View key={index} style={styles.card}>
   {Object.entries(row as Record<string,unknown>).filter(([key])=>!['password_hash','token_hash'].includes(key)).slice(0,13).map(([key,value])=>
    <View key={key} style={styles.detail}><Text style={styles.muted}>{key.replaceAll('_',' ')}</Text><Text style={styles.value}>{typeof value==='object'?JSON.stringify(value):String(value??'—')}</Text></View>)}
  </View>)}
  {ops.length>0&&<View style={styles.card}><Text style={styles.heading}>Record verified operation</Text>
   <Text style={styles.muted}>These actions update PostgreSQL, require your actual server role and capture a consent-based location audit.</Text>
   <ScrollView horizontal contentContainerStyle={styles.row}>{ops.map(name=><Btn key={name} text={operations[name].title} secondary={action!==name} onPress={()=>{setOperation(name);setFields({})}}/>)}</ScrollView>
   {operations[action].fields.map(f=><Input key={f.key} title={f.title} numeric={f.type==='number'}
    value={fields[f.key]||''} onChange={value=>setFields(old=>({...old,[f.key]:value}))}/>)}
   <Btn text={loading?'Recording…':'Submit '+operations[action].title} disabled={loading} onPress={()=>void submitAction()}/>
  </View>}
  <Text style={styles.footer}>Live operational actions require measured physical work, correct lot/batch IDs and an active server-issued JWT. No demo or bypass role access.</Text>
 </ScrollView></SafeAreaView>;
}
export default function SecureApp(){return <SafeAreaProvider><AuthenticatedMobile/></SafeAreaProvider>;}
const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:'#f5f9f5'},scroll:{flex:1},content:{padding:17,paddingBottom:70},brand:{fontSize:23,fontWeight:'900',color:palette.green},
 header:{backgroundColor:'#fff',minHeight:62,paddingHorizontal:15,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
 role:{fontSize:10,color:'#536d59',backgroundColor:'#e6f2e5',padding:9},nav:{gap:8,padding:12,backgroundColor:'#fff'},
 tab:{padding:10,borderRadius:8,backgroundColor:'#e9f1e9'},tabActive:{backgroundColor:palette.green},tabText:{color:palette.green,fontSize:11,fontWeight:'800'},tabTextActive:{color:'#fff'},
 heading:{fontSize:21,color:palette.green,fontWeight:'900',marginBottom:14},muted:{fontSize:12,color:palette.muted,lineHeight:19,marginBottom:13},error:{padding:12,backgroundColor:'#fff0ee',color:'#a72e2a',borderRadius:8,marginBottom:12},
 field:{marginVertical:7},label:{fontWeight:'800',fontSize:12,color:'#416049',marginBottom:6},input:{padding:12,backgroundColor:'#fff',borderWidth:1,borderColor:'#d4e3d6',borderRadius:8,fontSize:13,color:'#223d29'},
 button:{paddingHorizontal:15,paddingVertical:11,backgroundColor:palette.green,borderRadius:8,margin:4,alignItems:'center'},
 buttonSecondary:{backgroundColor:'#e9f2e9',borderWidth:1,borderColor:'#c9e0cd'},buttonLabel:{fontSize:12,color:'#fff',fontWeight:'800'},
 buttonSecondaryLabel:{color:palette.green},disabled:{opacity:.55},card:{backgroundColor:'#fff',padding:14,borderWidth:1,borderColor:'#e4ece5',borderRadius:12,marginBottom:11},
 item:{fontSize:13,fontWeight:'800',color:'#25412c',marginBottom:8},row:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',justifyContent:'space-between',gap:6},
 detail:{flexDirection:'row',justifyContent:'space-between',gap:8,padding:8,borderBottomWidth:1,borderBottomColor:'#eff3ef'},
 value:{maxWidth:'65%',fontSize:11,color:'#215a3a'},footer:{fontSize:10,color:'#879a8a',marginTop:22,textAlign:'center',lineHeight:17}
});
