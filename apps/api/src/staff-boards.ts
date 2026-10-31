export type PlanOrder={
 id:string;deliveryDate:string;slotId:string;state:string;
 items:{variantId:string;grams:number}[];
};
export type CatalogItem={id:string;vegetable:string;preparation:string;size:{kind:string;value:string|number;unit?:string}};
export type SlotItem={id:string;label:string;startMinute:number};
export type PlanRow={
 deliveryDate:string;slotId:string;slotLabel:string;variantId:string;
 vegetable:string;preparation:string;size:string;grams:number;orderCount:number;
 startedOrders:number;qcApprovedOrders:number;packedOrders:number;
};
export type PackingRow={orderId:string;deliveryDate:string;slotId:string;slotLabel:string;state:string;
 lines:{variantId:string;description:string;grams:number}[];totalGrams:number};
export type DispatchRow={orderId:string;deliveryDate:string;slotId:string;slotLabel:string;state:string;totalGrams:number};
export const eligibleForPlan=(state:string)=>state!=='CANCELLED';
export function sizeText(item:CatalogItem){const {size}=item;return String(size.value)+(size.kind==='numeric'?' '+(size.unit||'mm'):'');}
export function buildProductionPlan(orders:PlanOrder[],variants:CatalogItem[],slots:SlotItem[],date?:string,slotId?:string):PlanRow[]{
 const catalog=new Map(variants.map(p=>[p.id,p])),windows=new Map(slots.map(s=>[s.id,s]));
 const rows=new Map<string,PlanRow&{orderIds:Set<string>}>();
 for(const order of orders){
  if(!eligibleForPlan(order.state)||(date&&order.deliveryDate!==date)||(slotId&&order.slotId!==slotId))continue;
  for(const item of order.items){
   const variant=catalog.get(item.variantId);if(!variant)continue;
   const key=[order.deliveryDate,order.slotId,item.variantId].join('|');
   let row=rows.get(key);
   if(!row){
    row={deliveryDate:order.deliveryDate,slotId:order.slotId,slotLabel:windows.get(order.slotId)?.label||order.slotId,
     variantId:item.variantId,vegetable:variant.vegetable,preparation:variant.preparation,size:sizeText(variant),
     grams:0,orderCount:0,startedOrders:0,qcApprovedOrders:0,packedOrders:0,orderIds:new Set()};
    rows.set(key,row);
   }
   row.grams+=item.grams;
   if(!row.orderIds.has(order.id)){
    row.orderIds.add(order.id);row.orderCount++;
    if(['IN_PRODUCTION','QC_PASSED','PACKED','DISPATCHED','DELIVERED'].includes(order.state))row.startedOrders++;
    if(['QC_PASSED','PACKED','DISPATCHED','DELIVERED'].includes(order.state))row.qcApprovedOrders++;
    if(['PACKED','DISPATCHED','DELIVERED'].includes(order.state))row.packedOrders++;
   }
  }
 }
 return [...rows.values()].map(({orderIds,...row})=>row).sort((a,b)=>
  a.deliveryDate.localeCompare(b.deliveryDate)||
  ((windows.get(a.slotId)?.startMinute??0)-(windows.get(b.slotId)?.startMinute??0))||
  a.vegetable.localeCompare(b.vegetable)||a.preparation.localeCompare(b.preparation)||a.size.localeCompare(b.size));
}
export function buildPackingQueue(orders:PlanOrder[],variants:CatalogItem[],slots:SlotItem[],date?:string,slotId?:string):PackingRow[]{
 const catalog=new Map(variants.map(v=>[v.id,v])),windows=new Map(slots.map(s=>[s.id,s]));
 return orders.filter(o=>o.state!=='CANCELLED'&&(!date||o.deliveryDate===date)&&(!slotId||o.slotId===slotId))
 .map(o=>({
  orderId:o.id,deliveryDate:o.deliveryDate,slotId:o.slotId,slotLabel:windows.get(o.slotId)?.label||o.slotId,state:o.state,
  lines:o.items.map(line=>{
   const v=catalog.get(line.variantId);
   return {variantId:line.variantId,description:v?[v.vegetable,v.preparation,sizeText(v)].join(' · '):line.variantId,grams:line.grams};
  }),totalGrams:o.items.reduce((sum,i)=>sum+i.grams,0)
 })).sort((a,b)=>a.deliveryDate.localeCompare(b.deliveryDate)||a.slotLabel.localeCompare(b.slotLabel)||a.orderId.localeCompare(b.orderId));
}
export function buildDispatchQueue(orders:PlanOrder[],slots:SlotItem[],date?:string,slotId?:string):DispatchRow[]{
 const windows=new Map(slots.map(s=>[s.id,s]));
 return orders.filter(o=>!['CANCELLED'].includes(o.state)&&(!date||o.deliveryDate===date)&&(!slotId||o.slotId===slotId))
 .map(o=>({orderId:o.id,deliveryDate:o.deliveryDate,slotId:o.slotId,slotLabel:windows.get(o.slotId)?.label||o.slotId,state:o.state,totalGrams:o.items.reduce((sum,i)=>sum+i.grams,0)}))
 .sort((a,b)=>a.deliveryDate.localeCompare(b.deliveryDate)||a.slotLabel.localeCompare(b.slotLabel)||a.orderId.localeCompare(b.orderId));
}
export const allowedRoleActions={
 CUTTER:['CONFIRMED->IN_PRODUCTION'],
 QC:['IN_PRODUCTION->QC_PASSED'],
 PACKER:['QC_PASSED->PACKED'],
 DISPATCH:['PACKED->DISPATCHED'],
 DELIVERY:['DISPATCHED->DELIVERED']
} as const;
export type DemoStaffRole=keyof typeof allowedRoleActions;
export function mayAdvance(role:DemoStaffRole,from:string,to:string){
 return (allowedRoleActions[role] as readonly string[]).includes(from+'->'+to);
}
