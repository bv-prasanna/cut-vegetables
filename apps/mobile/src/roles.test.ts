import {describe,it,expect} from 'vitest';
import {menuFor,mayUse,isBuyer,roles} from './roles';
describe('role-dependent mobile navigation',()=>{
 it('covers all operational personas',()=>expect(roles).toEqual(expect.arrayContaining(['CUSTOMER','CUSTOMER_BUYER','PROCUREMENT','CUTTER','OPERATOR','QC','PACKER','DELIVERY','ADMIN'])));
 it('gives buyers order access',()=>{expect(isBuyer('CUSTOMER_BUYER')).toBe(true);expect(mayUse('CUSTOMER_BUYER','Recurring')).toBe(true);});
 it('hides customer ordering from delivery roles',()=>{expect(isBuyer('DELIVERY')).toBe(false);expect(mayUse('DELIVERY','Catalogue')).toBe(false);});
 it('uses production tasks for cutters and quality for QC',()=>{expect(mayUse('CUTTER','Production')).toBe(true);expect(mayUse('QC','Quality')).toBe(true);expect(mayUse('CUTTER','Finance')).toBe(false);});
 it('always includes Home for each role',()=>expect(roles.every(r=>menuFor(r).includes('Home'))).toBe(true));
});
