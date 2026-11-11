import {z} from 'zod';
/** Strict business-local dates are not equivalent to regex validation. */
export const isoLocalDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{
 const d=new Date(value+'T00:00:00.000Z');
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
},'Invalid calendar date');
export const safeWeight=z.number().int().positive().max(1_000_000_000);
export function calculatePaise(pricePaisePerKg:number,grams:number){
 if(!Number.isSafeInteger(pricePaisePerKg)||pricePaisePerKg<0||!Number.isSafeInteger(grams)||grams<=0)throw new Error('Invalid money/weight');
 const value=Math.round(pricePaisePerKg*grams/1000);
 if(!Number.isSafeInteger(value))throw new Error('Money overflow');
 return value;
}
