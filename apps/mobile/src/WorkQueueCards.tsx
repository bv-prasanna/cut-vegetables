import React from 'react';
import {View,Text,StyleSheet} from 'react-native';
import {rowOf,textOf,gramsOf,kgOf,remainingGrams,packingReadiness,humanState} from './work-queue';

type Props={screen:string;rows:unknown[];loading:boolean};
const colors={ink:'#193b2b',forest:'#155f3d',soft:'#e9f4e9',border:'#dfe9e1',subtle:'#6c8171'};
const L=({children}:{children:React.ReactNode})=><Text style={styles.label}>{children}</Text>;
const Status=({value}:{value:unknown})=>{
 const s=textOf(value,'PENDING').toUpperCase();
 const warning=['CANCELLED','FAILED','QC_FAILED','BLOCKED','EXCEPTION','REJECTED'].some(w=>s.includes(w));
 const done=['PACKED','DELIVERED','QC_PASSED','COMPLETED'].some(w=>s.includes(w));
 return <View style={[styles.status,warning?styles.statusBad:done?styles.statusDone:styles.statusActive]}>
  <Text style={[styles.statusText,warning?styles.statusBadText:done?styles.statusDoneText:styles.statusActiveText]}>{humanState(s)}</Text>
 </View>;
};
const Big=({label,value}:{label:string;value:string})=><View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
const Panel=({children}:{children:React.ReactNode})=><View style={styles.card}>{children}</View>;
const Head=({title,subtitle}:{title:string;subtitle?:string})=><View style={styles.cardHead}><Text style={styles.title}>{title}</Text>{Boolean(subtitle)&&<Text style={styles.subtitle}>{subtitle}</Text>}</View>;
const Cell=({title,value}:{title:string;value:string})=><View style={styles.cell}><Text style={styles.label}>{title}</Text><Text style={styles.value}>{value}</Text></View>;
export default function WorkQueueCards({screen,rows,loading}:Props){
 if(loading&&rows.length===0)return <View style={styles.empty}><Text style={styles.emptyTitle}>Loading your assigned work…</Text><Text style={styles.subtitle}>Fetching the latest kitchen and delivery data.</Text></View>;
 if(!loading&&rows.length===0)return <View style={styles.empty}><Text style={styles.emptyGlyph}>✓</Text>
  <Text style={styles.emptyTitle}>Nothing in this work queue</Text>
  <Text style={styles.subtitle}>There are no records for the selected day and your authorised role. Try a different date or refresh.</Text></View>;
 if(screen==='Cutting'){
  const total=rows.reduce<number>((sum,x)=>sum+gramsOf(rowOf(x).required_grams),0);
  const qcDone=rows.reduce<number>((sum,x)=>sum+gramsOf(rowOf(x).qc_approved_grams),0);
  return <><View style={styles.metricRow}><Big label="TOTAL CUTTING" value={kgOf(total)}/><Big label="QC APPROVED" value={kgOf(qcDone)}/></View>
   <Text style={styles.sectionTitle}>Consolidated items · all orders</Text>
   {rows.map((value,i)=>{const r=rowOf(value),required=gramsOf(r.required_grams),approved=gramsOf(r.qc_approved_grams);
    return <Panel key={String(r.variant_id??i)}>
     <View style={styles.topRow}><View style={styles.grow}><Text style={styles.kicker}>{textOf(r.slot_label)}</Text>
      <Text style={styles.title}>{textOf(r.vegetable)} · {textOf(r.preparation).toLowerCase()}</Text>
      <Text style={styles.subtitle}>{textOf(r.size)} · {textOf(r.order_count,'0')} customer orders</Text></View>
      <Status value={approved>=required&&required>0?'QC_PASSED':gramsOf(r.input_grams)>0?'IN_PRODUCTION':'PENDING'}/>
     </View><View style={styles.line}/><View style={styles.metricRow}>
      <Cell title="CUT REQUIRED" value={kgOf(required)}/>
      <Cell title="RAW STARTED" value={kgOf(r.input_grams)}/>
      <Cell title="STILL TO APPROVE" value={kgOf(remainingGrams(required,approved))}/>
     </View>
     <View style={styles.progressTrack}><View style={[styles.progressFill,{width:((required?Math.min(100,approved/required*100):0)+'%') as `${number}%`}]}/></View>
     <Text style={styles.hint}>QC approved {kgOf(approved)} · packed {kgOf(r.packed_grams)}</Text>
    </Panel>;
   })}</>;
 }
 if(screen==='Packing'){
  return <><Text style={styles.sectionTitle}>Pack by customer order</Text>{rows.map((value,i)=>{
   const r=rowOf(value),info=packingReadiness(r.lines);
   const lines=Array.isArray(r.lines)?r.lines:[];
   return <Panel key={String(r.orderId??i)}>
    <View style={styles.topRow}><View style={styles.grow}><Text style={styles.kicker}>{textOf(r.slot)}</Text>
     <Text style={styles.title}>{textOf(r.customer)} · {textOf(r.kitchen)}</Text>
     <Text style={styles.subtitle}>Order {textOf(r.orderId).slice(0,8)} · {textOf(r.date)}</Text></View>
     <Status value={info.ready?'PACKED':r.state}/>
    </View><View style={styles.line}/>
    {lines.map((item,j)=>{const line=rowOf(item);return <View key={j} style={styles.itemRow}>
     <View style={styles.grow}><Text style={styles.itemTitle}>{textOf(line.vegetable)} · {textOf(line.preparation).toLowerCase()}</Text>
      <Text style={styles.subtitle}>{textOf(line.size)} · approved {kgOf(line.qcApprovedGrams)}</Text></View>
     <View style={styles.right}><L>TO PACK</L><Text style={styles.itemValue}>{kgOf(remainingGrams(line.requiredGrams,line.packedGrams))}</Text></View>
    </View>})}
    <View style={styles.line}/><View style={styles.metricRow}><Cell title="TOTAL REQUIRED" value={kgOf(info.required)}/>
     <Cell title="ALREADY PACKED" value={kgOf(info.packed)}/>
     <Cell title="REMAINING" value={kgOf(info.remaining)}/></View>
    {!info.ready&&<Text style={styles.hint}>Only quality-approved batches can be packed. Each order line must be fulfilled before dispatch.</Text>}
   </Panel>;
  })}</>;
 }
 if(screen==='Delivery'){
  return <><Text style={styles.sectionTitle}>Driver routes and stops</Text>{rows.map((value,i)=>{
   const r=rowOf(value);return <Panel key={String(r.stop_id??r.run_id??i)}>
    <View style={styles.topRow}><View style={styles.grow}><Text style={styles.kicker}>{textOf(r.slot_label)} · Stop {textOf(r.stop_number,'—')}</Text>
     <Text style={styles.title}>{textOf(r.customer,'Unassigned run')}</Text>
     <Text style={styles.subtitle}>{textOf(r.kitchen)} · {textOf(r.delivery_date)}</Text></View><Status value={r.stop_state??r.run_state}/></View>
    <View style={styles.line}/><Text style={styles.address}>{textOf(r.address,'Address available once assigned')}</Text>
    <Text style={styles.hint}>Confirmed handovers update the order and produce an auditable delivery record.</Text>
   </Panel>;
  })}</>;
 }
 if(screen==='Orders'){
  return <>{rows.map((value,i)=>{const r=rowOf(value);return <Panel key={String(r.id??i)}>
   <View style={styles.topRow}><View style={styles.grow}><Text style={styles.kicker}>DELIVERY {textOf(r.delivery_date)}</Text>
   <Text style={styles.title}>Order #{textOf(r.id).slice(0,8)}</Text><Text style={styles.subtitle}>Your confirmed kitchen request</Text></View><Status value={r.state}/></View>
  </Panel>})}</>;
 }
 if(screen==='Quality'){
  return <><Text style={styles.sectionTitle}>Production batches awaiting quality checks</Text>{rows.map((value,i)=>{
   const r=rowOf(value);return <Panel key={String(r.id??i)}>
    <View style={styles.topRow}><View style={styles.grow}><Text style={styles.kicker}>BATCH {textOf(r.id).slice(0,8)}</Text>
     <Text style={styles.title}>Quality inspection</Text><Text style={styles.subtitle}>Record the actual measured yield and inspection outcome.</Text></View><Status value={r.state}/></View>
    <View style={styles.line}/><View style={styles.metricRow}><Cell title="INPUT" value={kgOf(r.input_grams)}/>
    <Cell title="OUTPUT" value={kgOf(r.output_grams)}/><Cell title="WASTE" value={kgOf(r.waste_grams)}/></View>
   </Panel>})}</>;
 }
 if(screen==='Procurement'){
  return <><Text style={styles.sectionTitle}>Received raw vegetables and lots</Text>{rows.map((value,i)=>{
   const r=rowOf(value);return <Panel key={String(r.id??i)}>
    <View style={styles.topRow}><View style={styles.grow}><Text style={styles.kicker}>LOT {textOf(r.supplier_lot,r.id?String(r.id).slice(0,8):'—')}</Text>
    <Text style={styles.title}>{textOf(r.vegetable)}</Text><Text style={styles.subtitle}>Received {textOf(r.received_at)}</Text></View><Status value="RECEIVED"/></View>
    <View style={styles.line}/><View style={styles.metricRow}><Cell title="RECEIVED" value={kgOf(r.received_grams)}/><Cell title="USABLE" value={kgOf(r.usable_grams)}/><Cell title="REJECTED" value={kgOf(r.rejected_grams)}/></View>
   </Panel>})}</>;
 }
 if(screen==='Administration'){
  const r=rowOf(rows[0]);
  return <><View style={styles.metricRow}><Big label="ACTIVE KITCHENS" value={textOf(r.activeKitchens,'0')}/><Big label="TEAM MEMBERS" value={textOf(r.staff,'0')}/></View>
   <Panel><Head title="Order lifecycle" subtitle="Real orders grouped by current state"/>
    {(Array.isArray(r.ordersByState)?r.ordersByState:[]).map((value,i)=>{
     const line=rowOf(value);return <View key={i} style={styles.itemRow}><Text style={styles.itemTitle}>{humanState(line.state)}</Text><Text style={styles.itemValue}>{textOf(line.count,'0')}</Text></View>;
    })}
   </Panel></>;
 }
 return <View style={styles.empty}><Text style={styles.emptyTitle}>No dedicated overview for this role</Text><Text style={styles.subtitle}>Choose a different authorised workspace.</Text></View>;
}
const styles=StyleSheet.create({
 cardHead:{marginBottom:8},card:{backgroundColor:'#fff',padding:17,borderRadius:16,borderWidth:1,borderColor:colors.border,marginBottom:11},
 topRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',gap:12},
 grow:{flex:1},right:{alignItems:'flex-end',minWidth:80},kicker:{fontSize:10,fontWeight:'800',letterSpacing:1.2,color:'#679879',textTransform:'uppercase',marginBottom:7},
 title:{fontSize:16,fontWeight:'800',color:colors.ink,lineHeight:22,marginBottom:5},
 subtitle:{fontSize:11,color:colors.subtle,lineHeight:17},sectionTitle:{fontSize:17,fontWeight:'800',color:colors.ink,marginTop:15,marginBottom:13},
 line:{height:1,backgroundColor:colors.border,marginVertical:14},metricRow:{flexDirection:'row',gap:8,justifyContent:'space-between',flexWrap:'wrap'},
 metric:{flex:1,minWidth:140,backgroundColor:'#e7f3e7',padding:16,borderRadius:13,marginBottom:14},
 metricLabel:{fontSize:10,fontWeight:'800',color:'#679478',letterSpacing:1},
 metricValue:{fontSize:24,fontWeight:'900',color:colors.forest,marginTop:8},cell:{flex:1,minWidth:90,marginBottom:8},
 label:{fontSize:9,fontWeight:'800',color:'#8a9c8c',letterSpacing:.7,marginBottom:6},
 value:{fontSize:14,fontWeight:'900',color:colors.forest},progressTrack:{height:7,borderRadius:7,backgroundColor:'#e2ede3',marginTop:6,overflow:'hidden'},
 progressFill:{height:7,backgroundColor:'#3a9862',borderRadius:7},
 itemRow:{flexDirection:'row',justifyContent:'space-between',gap:10,paddingVertical:10,borderBottomColor:'#edf2ec',borderBottomWidth:1},
 itemTitle:{fontSize:12,color:colors.ink,fontWeight:'800'},itemValue:{fontSize:13,fontWeight:'900',color:colors.forest},
 status:{borderRadius:7,paddingHorizontal:10,paddingVertical:7,alignSelf:'flex-start'},
 statusText:{fontSize:9,fontWeight:'900'},statusBad:{backgroundColor:'#fff1ec'},statusBadText:{color:'#ad503c'},
 statusDone:{backgroundColor:'#e6f4e8'},statusDoneText:{color:'#2c7843'},
 statusActive:{backgroundColor:'#fff6e4'},statusActiveText:{color:'#8a6931'},
 hint:{fontSize:10,color:'#819386',marginTop:10,lineHeight:16},
 empty:{marginTop:12,padding:35,borderStyle:'dashed',borderWidth:1,borderColor:'#c8dfcc',borderRadius:16,alignItems:'center',backgroundColor:'#f9fcf9'},
 emptyGlyph:{fontSize:31,color:'#398f5a',marginBottom:10},emptyTitle:{fontSize:16,fontWeight:'800',color:colors.forest,marginBottom:6,textAlign:'center'},
 address:{fontSize:12,lineHeight:19,color:colors.ink,fontWeight:'600'}
});
