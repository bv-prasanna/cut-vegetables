import type {CatalogueVariant} from './secure-api';

export function searchCuts(variants:readonly CatalogueVariant[],query:string):CatalogueVariant[]{
 const q=query.trim().toLocaleLowerCase('en-IN');
 if(!q)return [...variants];
 return variants.filter(v=>[
  v.vegetable,v.preparation,v.sku,
  v.size_kind==='numeric'?[v.size_number,v.size_unit].filter(Boolean).join(' '):v.size_label
 ].join(' ').toLocaleLowerCase('en-IN').includes(q));
}
export type BasketTotals={itemCount:number;totalGrams:number;estimatedPaise:number};
export function basketTotals(items:Readonly<Record<string,number>>,
 products:readonly CatalogueVariant[]):BasketTotals{
 const variants=new Map(products.map(v=>[v.id,v]));
 let totalGrams=0,estimatedPaise=0,itemCount=0;
 for(const [id,value] of Object.entries(items)){
  const p=variants.get(id);
  if(!p||!Number.isSafeInteger(value)||value<=0)continue;
  itemCount++;
  totalGrams+=value;
  estimatedPaise+=Math.round(value*p.price_paise_per_kg/1000);
 }
 return {itemCount,totalGrams,estimatedPaise};
}
