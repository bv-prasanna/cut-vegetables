export const orderStates=['CONFIRMED','IN_PRODUCTION','QC_PASSED','PACKED','DISPATCHED','DELIVERED','CANCELLED','EXCEPTION'] as const;
export type OrderState=typeof orderStates[number];
const allowed:Record<OrderState,readonly OrderState[]>={
 CONFIRMED:['IN_PRODUCTION','CANCELLED','EXCEPTION'],
 IN_PRODUCTION:['QC_PASSED','EXCEPTION'],
 QC_PASSED:['PACKED','EXCEPTION'],
 PACKED:['DISPATCHED','EXCEPTION'],
 DISPATCHED:['DELIVERED','EXCEPTION'],
 DELIVERED:[],
 CANCELLED:[],
 EXCEPTION:['IN_PRODUCTION','CANCELLED']
};
export function mayTransitionOrder(from:OrderState,to:OrderState):boolean{return allowed[from].includes(to);}
export function nextOrderState(from:OrderState,to:OrderState):OrderState{
 if(!mayTransitionOrder(from,to))throw new Error(`Invalid order transition: ${from} -> ${to}`);
 return to;
}
export function validateBatchYield(inputGrams:number,outputGrams:number,wasteGrams:number):boolean {
 return [inputGrams,outputGrams,wasteGrams].every(v=>Number.isSafeInteger(v)&&v>=0)&&inputGrams>0&&outputGrams+wasteGrams<=inputGrams;
}
export function mayDispatchBatch(state:string,hasQcPass:boolean,hasValidPackLabel:boolean):boolean {
 return state==='PACKED'&&hasQcPass&&hasValidPackLabel;
}
