/** Derived workboard metrics stay pure so quantity logic is independently testable. */
export type QueueRow=Record<string,unknown>;
export function rowOf(value:unknown):QueueRow {
 return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as QueueRow:{};
}
export function textOf(value:unknown,empty='—'):string {
 if(value===null||value===undefined||value==='')return empty;
 if(typeof value==='string'||typeof value==='number')return String(value);
 return empty;
}
export function gramsOf(value:unknown):number{
 const n=Number(value);
 return Number.isFinite(n)&&n>=0?n:0;
}
export function kgOf(value:unknown):string{
 return (gramsOf(value)/1000).toLocaleString('en-IN',{minimumFractionDigits:0,maximumFractionDigits:2})+' kg';
}
export function remainingGrams(required:unknown,complete:unknown):number{
 return Math.max(0,gramsOf(required)-gramsOf(complete));
}
export function packingReadiness(lines:unknown):{required:number;approved:number;packed:number;remaining:number;ready:boolean}{
 const values=Array.isArray(lines)?lines.map(rowOf):[];
 const required=values.reduce((sum,v)=>sum+gramsOf(v.requiredGrams),0);
 const approved=values.reduce((sum,v)=>sum+gramsOf(v.qcApprovedGrams),0);
 const packed=values.reduce((sum,v)=>sum+gramsOf(v.packedGrams),0);
 const ready=required>0&&values.every(v=>gramsOf(v.packedGrams)>=gramsOf(v.requiredGrams));
 return {required,approved,packed,remaining:Math.max(0,required-packed),ready};
}
export function humanState(value:unknown):string{
 const s=textOf(value,'Pending').replaceAll('_',' ').trim().toLowerCase();
 return s.charAt(0).toUpperCase()+s.slice(1);
}
export function todayInIndia(now:Date=new Date()):string {
 return new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',
  timeZone:'Asia/Kolkata'}).format(now);
}
