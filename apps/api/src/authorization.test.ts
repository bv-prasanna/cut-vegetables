import {describe,it,expect} from 'vitest';
import {can,canAny,enforceOrganizationScope,isRole,permissions} from './authorization.js';
describe('role-based access matrix',()=>{
 it.each([
 ['CUSTOMER_BUYER','orders:write',true],['CUSTOMER_BUYER','catalog:write',false],
 ['CUSTOMER_VIEWER','orders:write',false],['CUSTOMER_ADMIN','buyers:manage',true],
 ['PROCUREMENT','procurement:write',true],['PROCUREMENT','qc:approve',false],
 ['STORE','inventory:write',true],['OPERATOR','production:write',true],
 ['OPERATOR','production:approve',false],['PRODUCTION_SUPERVISOR','production:approve',true],
 ['QC','qc:approve',true],['PACKER','qc:approve',false],
 ['PACKER','packing:write',true],['DISPATCH','delivery:assign',true],
 ['DRIVER','delivery:pod',true],['DRIVER','delivery:assign',false],
 ['FINANCE','invoices:write',true],['FINANCE','catalog:write',false],
 ['SALES','pricing:propose',true],['MARKETING','marketing:write',true],
 ['AUDITOR','finance:write',false],['ADMIN','users:manage',true],
 ['SUPERADMIN','any:permission',true]
 ] as const)('%s allowed %s equals %s',(role,permission,result)=>expect(can(role,permission)).toBe(result));
 it('does not expose broad admin access to other roles',()=>{for(const role of Object.keys(permissions)){if(role!=='SUPERADMIN')expect(can(role as keyof typeof permissions,'*')).toBe(false);}});
 it('can combine verified roles',()=>expect(canAny(['CUSTOMER_VIEWER','CUSTOMER_BUYER'],'orders:write')).toBe(true));
 it('rejects unknown roles',()=>{expect(isRole('DRIVER')).toBe(true);expect(isRole('ADMINISTRATOR')).toBe(false);});
 it('enforces scope and nonempty ids',()=>{expect(enforceOrganizationScope('a','a')).toBe(true);expect(enforceOrganizationScope('a','b')).toBe(false);expect(enforceOrganizationScope('','')).toBe(false);});
});
