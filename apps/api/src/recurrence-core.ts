import type { Recurrence } from './domain.js';
import {localDate,recurrenceRunsOn} from './scheduling.js';
export function occurrenceKey(scheduleId:string,date:string,slotId:string):string {
 if(!scheduleId||!slotId)throw new Error('Missing occurrence identity');
 localDate(date);return scheduleId+':'+date+':'+slotId;
}
export function listOccurrences(rule:Recurrence,startDate:string,days:number,excludedDates:ReadonlySet<string>=new Set()):string[] {
 if(!Number.isSafeInteger(days)||days<1||days>366)throw new Error('Invalid recurrence horizon');
 let at=localDate(startDate).getTime();
 const result:string[]=[];
 for(let i=0;i<days;i++,at+=86_400_000){
  const date=new Date(at).toISOString().slice(0,10);
  if(!excludedDates.has(date)&&recurrenceRunsOn(rule,date))result.push(date);
 }
 return result;
}
