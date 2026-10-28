import {describe,it,expect} from 'vitest';
import {isoLocalDate,calculatePaise} from './validation.js';
describe('strict business invariants',()=>{
 it.each(['2026-02-30','2026-02-29','2026-13-01','2026-00-01','not-a-date'])('rejects %s',v=>expect(isoLocalDate.safeParse(v).success).toBe(false));
 it.each(['2024-02-29','2026-10-28'])('accepts %s',v=>expect(isoLocalDate.safeParse(v).success).toBe(true));
 it('rounds paise safely',()=>expect(calculatePaise(8099,750)).toBe(6074));
 it('rejects invalid and unsafe numbers',()=>{expect(()=>calculatePaise(10,-1)).toThrow();expect(()=>calculatePaise(Number.MAX_SAFE_INTEGER,100000)).toThrow();});
});
