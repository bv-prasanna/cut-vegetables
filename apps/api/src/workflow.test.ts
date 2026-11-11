import{describe,it,expect}from'vitest';import{mayTransitionOrder,nextOrderState,validateBatchYield,mayDispatchBatch,orderStates}from'./workflow.js';
describe('order state invariants',()=>{
 it('allows validated straight-through operation',()=>{const path=['CONFIRMED','IN_PRODUCTION','QC_PASSED','PACKED','DISPATCHED','DELIVERED'] as const;for(let i=0;i<path.length-1;i++)expect(nextOrderState(path[i],path[i+1])).toBe(path[i+1]);});
 it('rejects skipping QC or packing',()=>expect(mayTransitionOrder('IN_PRODUCTION','DISPATCHED')).toBe(false));
 it('rejects delivery after cancellation',()=>expect(()=>nextOrderState('CANCELLED','DELIVERED')).toThrow());
 it('disallows terminal order transitions',()=>{for(const state of ['DELIVERED','CANCELLED'] as const)for(const to of orderStates)expect(mayTransitionOrder(state,to)).toBe(false);});
});
describe('production quality invariants',()=>{
 it('accepts balanced yield',()=>expect(validateBatchYield(10000,8000,2000)).toBe(true));
 it.each([[100,101,0],[100,50,51],[0,0,0],[100,-1,0],[10,2,0.4]])('rejects invalid yield %s %s %s',(i,o,w)=>expect(validateBatchYield(i,o,w)).toBe(false));
 it('forbids dispatch without passed QC and label',()=>{expect(mayDispatchBatch('PACKED',true,true)).toBe(true);expect(mayDispatchBatch('PACKED',false,true)).toBe(false);expect(mayDispatchBatch('PACKED',true,false)).toBe(false);expect(mayDispatchBatch('QC_FAILED',true,true)).toBe(false);});
});
