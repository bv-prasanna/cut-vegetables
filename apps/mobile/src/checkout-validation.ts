import type {CatalogueVariant,DeliverySlot,Kitchen} from './secure-api';
import {todayInIndia} from './work-queue';
type Item={variantId:string;grams:number};
export function checkoutError(
 kitchenId:string,slotId:string,deliveryDate:string,items:readonly Item[],
 kitchens:readonly Kitchen[],slots:readonly DeliverySlot[],variants:readonly CatalogueVariant[],
 today:string=todayInIndia()
):string|null{
 const kitchen=kitchens.find(x=>x.id===kitchenId);
 if(!kitchen)return 'Choose one of your registered kitchens.';
 const slot=slots.find(x=>x.id===slotId&&x.zone_code===kitchen.zone_code);
 if(!slot)return 'Choose a delivery window available for this kitchen.';
 const parsed=new Date(deliveryDate+'T00:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)||!Number.isFinite(parsed.getTime())||
  parsed.toISOString().slice(0,10)!==deliveryDate)
  return 'Enter a valid delivery date in YYYY-MM-DD format.';
 if(deliveryDate<today)return 'The delivery date cannot be in the past.';
 if(!items.length)return 'Add at least one prepared vegetable to your basket.';
 for(const item of items){
  const variant=variants.find(v=>v.id===item.variantId);
  if(!variant)return 'Your basket contains an unavailable product. Refresh the catalogue.';
  if(!Number.isSafeInteger(item.grams)||item.grams<variant.minimum_grams||
   (item.grams-variant.minimum_grams)%variant.increment_grams!==0)
   return variant.vegetable+' '+variant.preparation.toLowerCase()+
    ' must meet the minimum and quantity increment.';
 }
 return null;
}
export function fingerprintOrder(kitchenId:string,slotId:string,date:string,items:readonly Item[]):string{
 return JSON.stringify({kitchenId,slotId,date,items:[...items].sort((a,b)=>a.variantId.localeCompare(b.variantId))});
}
