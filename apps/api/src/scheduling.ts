import type { Recurrence, Slot, Variant } from './domain.js';

// All business-local dates here are interpreted in Asia/Kolkata, without implicit server time zone.
const businessOffsetMs = 330 * 60_000;
export function localDate(date: string): Date {
  const value = new Date(date + 'T00:00:00.000Z');
  if(Number.isNaN(value.getTime()) || value.toISOString().slice(0,10) !== date) throw new Error('Invalid ISO date');
  return value;
}
export function cutoffInstant(deliveryDate: string, slot: Slot): Date {
  const start = localDate(deliveryDate).getTime();
  return new Date(start + (slot.cutoffMinute - slot.cutoffDayOffset * 1440) * 60_000 - businessOffsetMs);
}
export function isSlotBookable(deliveryDate: string, slot: Slot, now: Date): boolean {
  if(!slot.active) return false;
  return now.getTime() < cutoffInstant(deliveryDate, slot).getTime();
}
export function recurrenceRunsOn(rule: Recurrence, deliveryDate: string): boolean {
  const day = localDate(deliveryDate);
  if(deliveryDate < rule.startDate || (rule.endDate && deliveryDate > rule.endDate)) return false;
  return rule.frequency === 'DAILY' || rule.weekdays.includes(day.getUTCDay());
}
export function validateOrderQuantities(items: {variantId:string;grams:number}[], variants: Variant[]): string[] {
  const catalog = new Map(variants.map(v => [v.id,v]));
  return items.flatMap(item => {
    const v=catalog.get(item.variantId);
    if(!v || !v.active) return [`Variant ${item.variantId} unavailable`];
    if(item.grams < v.minimumGrams || (item.grams-v.minimumGrams)%v.incrementGrams!==0) return [`Invalid quantity for ${item.variantId}`];
    return [];
  });
}
