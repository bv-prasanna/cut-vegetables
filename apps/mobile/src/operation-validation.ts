/** Field-level preflight checks for physical operations.
 * Server Zod, JWT scopes, database locks and audit records remain authoritative.
 * UI validation exists to prevent wasting operator time with malformed forms.
 */
export type OperationName='SUPPLIER'|'PURCHASE'|'RECEIVE'|'BATCH'|'COMPLETE'|'QC'|'PACK'|'RUN'|'STOP'|'POD';
export type OperationFields=Record<string,string>;
const requiredByOperation:Record<OperationName,string[]>={
 SUPPLIER:['name'],PURCHASE:['supplierId'],
 RECEIVE:['id','vegetableId','receivedGrams','usableGrams','rejectedGrams'],
 BATCH:['orderId','variantId','rawLotId','inputGrams'],
 COMPLETE:['id','outputGrams','wasteGrams'],
 QC:['id','passed','findings'],
 PACK:['id','netGrams','labelCode','useBy'],
 RUN:['slotId','deliveryDate','driverId'],
 STOP:['id','orderId','stopNumber'],
 POD:['id','receivedBy']
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const identifierFields=new Set(['id','supplierId','vegetableId','orderId','variantId','rawLotId','slotId','driverId']);
const weightFields=new Set(['receivedGrams','usableGrams','rejectedGrams','inputGrams','outputGrams','wasteGrams','netGrams']);
const nonNegativeFields=new Set(['usableGrams','rejectedGrams','outputGrams','wasteGrams']);
const labelFor=(name:string)=>name.replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase();
export function validateOperationInput(op:OperationName,fields:OperationFields,now:Date=new Date()):string|null{
 for(const field of requiredByOperation[op]){
  if(!fields[field]?.trim())return 'Complete '+labelFor(field)+' before recording this action.';
 }
 for(const key of identifierFields){
  if(fields[key]?.trim()&&!uuid.test(fields[key].trim()))
   return 'Select or enter a valid '+labelFor(key)+' (36-character UUID).';
 }
 for(const key of weightFields){
  const raw=fields[key]?.trim();
  if(!raw)continue;
  if(!/^\d+$/.test(raw))return labelFor(key)+' must be a whole number of grams.';
  const value=Number(raw);
  if(!Number.isSafeInteger(value)||value>1_000_000_000||
   (!nonNegativeFields.has(key)&&value<1)||
   (nonNegativeFields.has(key)&&value<0))
   return labelFor(key)+' must be within the allowed weight range.';
 }
 if(op==='RECEIVE'){
  if(Number(fields.usableGrams)+Number(fields.rejectedGrams)>Number(fields.receivedGrams))
   return 'Usable plus rejected grams cannot exceed the received weight.';
 }
 if(op==='QC'){
  if(!['true','false'].includes(fields.passed?.toLowerCase()||''))return 'Choose Pass QC or Reject batch.';
  if(fields.findings.trim().length<3)return 'Inspection findings must have at least 3 characters.';
  if(fields.temperatureC?.trim()){
   const n=Number(fields.temperatureC);
   if(!Number.isFinite(n)||n< -40||n>100)return 'Temperature must be between −40°C and 100°C.';
  }
 }
 if(op==='SUPPLIER'&&fields.name.trim().length<2)return 'Supplier name must contain at least 2 characters.';
 if(op==='PACK'){
  if(fields.labelCode.trim().length<3)return 'Pack label needs at least 3 characters.';
  const useBy=fields.useBy.trim();
  if(!/T\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(useBy)
   ||!Number.isFinite(Date.parse(useBy)))
   return 'Enter use-by date and time with a timezone, for example 2026-11-20T08:00:00+05:30.';
  if(Date.parse(useBy)<=now.getTime())return 'Pack use-by date must be in the future.';
 }
 if(op==='RUN'){
  const date=fields.deliveryDate.trim();
  const instant=new Date(date+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(instant.getTime())||instant.toISOString().slice(0,10)!==date)
   return 'Enter a valid delivery date in YYYY-MM-DD format.';
 }
 if(op==='STOP'){
  const n=Number(fields.stopNumber);
  if(!/^\d+$/.test(fields.stopNumber.trim())||!Number.isInteger(n)||n<1||n>1000)
   return 'Stop number must be between 1 and 1000.';
 }
 if(op==='POD'&&fields.receivedBy.trim().length<2)return 'Receiver name must contain at least 2 characters.';
 return null;
}
