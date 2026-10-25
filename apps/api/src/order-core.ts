import type { Slot, Variant } from './domain.js';
import { isSlotBookable, validateOrderQuantities } from './scheduling.js';
export type OrderLine = { variantId:string; grams:number };
export type Quote = { lines:Array<OrderLine & {pricePaisePerKg:number;lineTotalPaise:number}>; totalPaise:number };
export type OrderRejection = {ok:false;reason:string};
export type OrderApproval = {ok:true;quote:Quote};
export function quoteOrder(lines:OrderLine[],variants:Variant[]):Quote {
 const errors=validateOrderQuantities(lines,variants);
 if(!lines.length || errors.length) throw new Error(errors[0]||'Empty order');
 const byId=new Map(variants.map(v=>[v.id,v]));
 const seen=new Set<string>();
 const quoted=lines.map(item=>{
  if(seen.has(item.variantId))throw new Error('Duplicate variant line');
  seen.add(item.variantId);
  const price=byId.get(item.variantId)!.pricePaisePerKg;
  const amount=Math.round(price*item.grams/1000);
  if(!Number.isSafeInteger(amount))throw new Error('Amount overflow');
  return {...item,pricePaisePerKg:price,lineTotalPaise:amount};
 });
 const totalPaise=quoted.reduce((sum,line)=>sum+line.lineTotalPaise,0);
 if(!Number.isSafeInteger(totalPaise))throw new Error('Total overflow');
 return {lines:quoted,totalPaise};
}
export function checkOrder(input:{deliveryDate:string;slot:Slot;ordersAlreadyReserved:number;items:OrderLine[];variants:Variant[]},now:Date):OrderApproval|OrderRejection {
 try{
  if(!isSlotBookable(input.deliveryDate,input.slot,now))return {ok:false,reason:'Slot cutoff passed or inactive'};
  if(!Number.isSafeInteger(input.ordersAlreadyReserved)||input.ordersAlreadyReserved>=input.slot.capacityOrders)return {ok:false,reason:'Slot full'};
  return {ok:true,quote:quoteOrder(input.items,input.variants)};
 }catch(e){return {ok:false,reason:e instanceof Error?e.message:'Invalid order'};}
}
