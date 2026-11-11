import {describe,it,expect} from 'vitest';
import {cleanEvent} from './geo-events.js';
const base={eventType:'DELIVERY_HANDOVER',subjectType:'ORDER',subjectId:'o1'};
describe('geo event validation',()=>{
 it('allows verified captured GPS with accuracy',()=>expect(cleanEvent({...base,location:{source:'DEVICE_GPS',latitude:12.9716,longitude:77.5946,accuracyMeters:13,capturedAt:'2026-10-24T10:00:00+05:30',consentStatus:'GRANTED'}}).location.source).toBe('DEVICE_GPS'));
 it('rejects out of range coordinates',()=>expect(()=>cleanEvent({...base,location:{source:'DEVICE_GPS',latitude:99,longitude:77,capturedAt:'2026-10-24T10:00:00+05:30',consentStatus:'GRANTED'}})).toThrow());
 it('allows unavailable GPS with explicit reason',()=>expect(cleanEvent({...base,location:{source:'UNAVAILABLE',unavailableReason:'Permission denied',consentStatus:'DENIED'}}).location.source).toBe('UNAVAILABLE'));
 it('rejects GPS without capture timestamp',()=>expect(()=>cleanEvent({...base,location:{source:'DEVICE_GPS',latitude:12,longitude:77,consentStatus:'GRANTED'}})).toThrow());
});
