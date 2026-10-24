import {describe,it,expect} from 'vitest';
import {can,enforceOrganizationScope} from './authorization.js';
describe('role policies',()=>{
 it('buyer may create orders but cannot edit product master',()=>{expect(can('CUSTOMER_BUYER','orders:write')).toBe(true);expect(can('CUSTOMER_BUYER','catalog:write')).toBe(false);});
 it('QC only writes QC; admin can edit catalog',()=>{expect(can('QC','qc:write')).toBe(true);expect(can('QC','finance:write')).toBe(false);expect(can('ADMIN','catalog:write')).toBe(true);});
 it('enforces organization ownership',()=>{expect(enforceOrganizationScope('a','b')).toBe(false);expect(enforceOrganizationScope('a','a')).toBe(true);});
});
