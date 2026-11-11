import { z } from 'zod';
export const geoEventSchema=z.object({
 eventType:z.string().trim().min(1).max(100),
 subjectType:z.string().trim().min(1).max(100),
 subjectId:z.string().trim().min(1).max(150),
 requestId:z.string().min(1).max(150).optional(),
 location:z.discriminatedUnion('source',[
   z.object({source:z.enum(['DEVICE_GPS','DEVICE_NETWORK','ADDRESS_GEOCODE','MANUAL']),latitude:z.number().finite().min(-90).max(90),longitude:z.number().finite().min(-180).max(180),accuracyMeters:z.number().finite().nonnegative().optional(),capturedAt:z.string().datetime({offset:true}),consentStatus:z.enum(['GRANTED','NOT_APPLICABLE'])}),
   z.object({source:z.enum(['UNAVAILABLE','SYSTEM']),unavailableReason:z.string().trim().min(1),consentStatus:z.enum(['DENIED','NOT_REQUESTED','NOT_APPLICABLE'])})
 ]),
 details:z.record(z.unknown()).default({})
});
export type GeoEventInput=z.infer<typeof geoEventSchema>;
export function cleanEvent(input:unknown):GeoEventInput {return geoEventSchema.parse(input);}
