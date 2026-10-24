import { z } from 'zod';

export const preparationTypes = ['DICED','CHOPPED','SLICED','GRATED','SHREDDED','JULIENNE','PEELED'] as const;
export const variantSchema = z.object({
  id: z.string().min(1),
  vegetable: z.string().trim().min(1),
  preparation: z.enum(preparationTypes),
  size: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('numeric'), value: z.number().positive(), unit: z.enum(['mm','cm']) }),
    z.object({ kind: z.literal('label'), value: z.enum(['fine','medium','coarse','thin','thick']) })
  ]),
  imageUrl: z.string().url(),
  pricePaisePerKg: z.number().int().nonnegative(),
  minimumGrams: z.number().int().positive(),
  incrementGrams: z.number().int().positive(),
  active: z.boolean()
});
export type Variant = z.infer<typeof variantSchema>;
export const slotSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
  cutoffDayOffset: z.number().int().min(0).max(7),
  cutoffMinute: z.number().int().min(0).max(1439),
  capacityOrders: z.number().int().positive(),
  active: z.boolean()
}).refine(x => x.endMinute > x.startMinute, 'Slot must finish after it starts');
export type Slot = z.infer<typeof slotSchema>;
export const recurrenceSchema = z.object({
  frequency: z.enum(['DAILY','WEEKLY']),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  slotId: z.string().min(1),
  items: z.array(z.object({variantId:z.string().min(1),grams:z.number().int().positive()})).min(1)
}).superRefine((v,ctx) => {
  if(v.frequency === 'WEEKLY' && v.weekdays.length === 0) ctx.addIssue({code:'custom',message:'Select weekdays',path:['weekdays']});
  if(v.endDate && v.endDate < v.startDate) ctx.addIssue({code:'custom',message:'End before start',path:['endDate']});
});
export type Recurrence = z.infer<typeof recurrenceSchema>;
