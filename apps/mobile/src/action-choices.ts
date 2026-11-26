export type ActionMutation='SUPPLIER'|'PURCHASE'|'RECEIVE'|'BATCH'|'COMPLETE'|'QC'|'REWORK'|'PACK'|'RUN'|'STOP'|'ARRIVE'|'POD'|'FAIL'|'RETRY';
export type ActionOrderItem={variantId:string;vegetableId:string;description:string;grams:number|string};
export type ActionOptions={
 suppliers:{id:string;name:string;active:boolean}[];
 purchases:{id:string;status:string;supplier_id:string;supplier:string}[];
 vegetables:{id:string;name:string}[];
 variants:{id:string;vegetable_id:string;sku:string;vegetable:string;preparation:string;size:string}[];
 rawLots:{id:string;vegetable_id:string;vegetable:string;supplier_lot:string|null;usable_grams:number|string}[];
 orders:{id:string;delivery_date:string;slot_id:string;slot_label:string;state:string;kitchen:string;customer:string;items:ActionOrderItem[]}[];
 batches:{id:string;order_id:string;variant_id:string;state:string;input_grams:number|string;output_grams:number|string|null;waste_grams:number|string|null;delivery_date:string;slot_label:string;vegetable:string;preparation:string;size:string}[];
 drivers:{id:string;email:string}[];
 slots:{id:string;label:string;zone_code:string}[];
 runs:{id:string;driver_id:string;driver_email:string;slot_id:string;slot_label:string;delivery_date:string;status:string}[];
 stops:{id:string;run_id:string;order_id:string;stop_number:number;status:string;driver_id:string;delivery_date:string;slot_id:string;slot_label:string;kitchen:string;customer:string}[];
};
export type ActionChoice={value:string;label:string};
export const emptyActionOptions:ActionOptions={suppliers:[],purchases:[],vegetables:[],variants:[],rawLots:[],orders:[],batches:[],drivers:[],slots:[],runs:[],stops:[]};
export function isActionChoiceField(action:ActionMutation,key:string):boolean{
 return ({
  PURCHASE:['supplierId'],RECEIVE:['id','vegetableId'],
  BATCH:['orderId','variantId','rawLotId'],COMPLETE:['id'],QC:['id'],REWORK:['id'],PACK:['id'],
  RUN:['slotId','driverId'],STOP:['id','orderId'],ARRIVE:['id'],POD:['id'],FAIL:['id'],RETRY:['id'],SUPPLIER:[]
 } as Record<ActionMutation,string[]>)[action].includes(key);
}
const short=(id:string)=>id.slice(0,8);
export function actionChoicesForField(action:ActionMutation,key:string,options:ActionOptions,fields:Record<string,string>):ActionChoice[]{
 if(action==='PURCHASE'&&key==='supplierId')
  return options.suppliers.filter(x=>x.active).map(x=>({value:x.id,label:x.name}));
 if(action==='RECEIVE'&&key==='id')
  return options.purchases.filter(x=>['APPROVED','RECEIVED'].includes(x.status)).map(x=>({value:x.id,label:x.supplier+' · '+short(x.id)+' · '+x.status}));
 if(action==='RECEIVE'&&key==='vegetableId')
  return options.vegetables.map(x=>({value:x.id,label:x.name}));
 if(action==='BATCH'&&key==='orderId')
  return options.orders.filter(x=>['CONFIRMED','IN_PRODUCTION'].includes(x.state)).map(x=>({value:x.id,label:x.customer+' · '+x.kitchen+' · '+x.delivery_date+' · '+short(x.id)}));
 if(action==='BATCH'&&key==='variantId'){
  const order=options.orders.find(x=>x.id===fields.orderId);
  return (order?.items||[]).map(x=>({value:x.variantId,label:x.description+' · '+(Number(x.grams)/1000).toFixed(2)+' kg'}));
 }
 if(action==='BATCH'&&key==='rawLotId'){
  const order=options.orders.find(x=>x.id===fields.orderId);
  const item=order?.items.find(x=>x.variantId===fields.variantId);
  return options.rawLots.filter(x=>item&&x.vegetable_id===item.vegetableId&&Number(x.usable_grams)>0)
   .map(x=>({value:x.id,label:x.vegetable+' · '+(x.supplier_lot||short(x.id))+' · '+(Number(x.usable_grams)/1000).toFixed(2)+' kg'}));
 }
 if(key==='id'&&action==='COMPLETE')
  return options.batches.filter(x=>x.state==='PROCESSING').map(x=>({value:x.id,label:x.vegetable+' · '+x.preparation+' · '+x.size+' · '+short(x.id)}));
 if(key==='id'&&action==='QC')
  return options.batches.filter(x=>x.state==='AWAITING_QC').map(x=>({value:x.id,label:x.vegetable+' · '+x.preparation+' · '+x.size+' · '+short(x.id)}));
 if(key==='id'&&action==='REWORK')
  return options.batches.filter(x=>x.state==='QC_FAILED').map(x=>({value:x.id,label:x.vegetable+' · '+x.preparation+' · '+x.size+' · '+short(x.id)}));
 if(key==='id'&&action==='PACK')
  return options.batches.filter(x=>['QC_PASSED','PACKED'].includes(x.state)).map(x=>({value:x.id,label:x.vegetable+' · '+x.preparation+' · '+x.size+' · '+short(x.id)}));
 if(action==='RUN'&&key==='slotId')
  return options.slots.map(x=>({value:x.id,label:x.label+' · '+x.zone_code}));
 if(action==='RUN'&&key==='driverId')
  return options.drivers.map(x=>({value:x.id,label:x.email}));
 if(action==='STOP'&&key==='id')
  return options.runs.filter(x=>['PLANNED','LOADING'].includes(x.status)).map(x=>({value:x.id,label:x.delivery_date+' · '+x.slot_label+' · '+x.driver_email+' · '+short(x.id)}));
 if(action==='STOP'&&key==='orderId'){
  const run=options.runs.find(x=>x.id===fields.id);
  return options.orders.filter(x=>x.state==='PACKED'&&run&&x.slot_id===run.slot_id&&x.delivery_date===run.delivery_date)
   .map(x=>({value:x.id,label:x.customer+' · '+x.kitchen+' · '+short(x.id)}));
 }
 if(action==='ARRIVE'&&key==='id')
  return options.stops.filter(x=>x.status==='PENDING')
   .map(x=>({value:x.id,label:x.delivery_date+' · '+x.slot_label+' · '+x.customer+' / '+x.kitchen+' · #'+x.stop_number}));
 if(action==='POD'&&key==='id')
  return options.stops.filter(x=>['PENDING','ARRIVED'].includes(x.status))
   .map(x=>({value:x.id,label:x.delivery_date+' · '+x.slot_label+' · '+x.customer+' / '+x.kitchen+' · #'+x.stop_number}));
 if(action==='FAIL'&&key==='id')
  return options.stops.filter(x=>['PENDING','ARRIVED'].includes(x.status))
   .map(x=>({value:x.id,label:x.delivery_date+' · '+x.slot_label+' · '+x.customer+' / '+x.kitchen+' · #'+x.stop_number}));
 if(action==='RETRY'&&key==='id')
  return options.stops.filter(x=>x.status==='FAILED')
   .map(x=>({value:x.id,label:x.delivery_date+' · '+x.slot_label+' · '+x.customer+' / '+x.kitchen+' · #'+x.stop_number}));
 return [];
}
