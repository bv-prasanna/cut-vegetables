export const permissions = {
 SUPERADMIN:['*'],
 ADMIN:['catalog:read','catalog:write','slots:read','slots:write','orders:read','orders:approve','schedules:read','marketing:write','reports:read','users:manage','audit:read'],
 SALES:['catalog:read','orders:read','customers:read','customers:write','pricing:propose','reports:read'],
 CUSTOMER_ADMIN:['catalog:read','orders:write','orders:read','schedules:write','schedules:read','buyers:manage','invoices:read'],
 CUSTOMER_BUYER:['catalog:read','orders:write','orders:read','schedules:write','schedules:read','invoices:read'],
 CUSTOMER_VIEWER:['catalog:read','orders:read','schedules:read','invoices:read'],
 PROCUREMENT:['procurement:write','procurement:read','inventory:read','orders:read'],
 STORE:['inventory:read','inventory:write','procurement:read','production:read'],
 OPERATOR:['orders:read','production:read','production:write'],
 PRODUCTION_SUPERVISOR:['orders:read','production:read','production:write','production:approve','inventory:read'],
 QC:['orders:read','qc:read','qc:write','qc:approve','production:read'],
 PACKER:['orders:read','packing:read','packing:write','qc:read'],
 DISPATCH:['orders:read','delivery:read','delivery:assign','delivery:write'],
 DRIVER:['delivery:assigned','delivery:pod','delivery:location'],
 FINANCE:['orders:read','finance:read','finance:write','invoices:read','invoices:write','loyalty:review'],
 MARKETING:['catalog:read','marketing:read','marketing:write'],
 AUDITOR:['audit:read','reports:read','orders:read','finance:read']
} as const;
export type Role = keyof typeof permissions;
export type Permission = string;
export function isRole(value: string): value is Role {
 return Object.prototype.hasOwnProperty.call(permissions,value);
}
export function can(role:Role,permission:Permission):boolean {
 const granted:readonly string[]=permissions[role];
 return granted.includes('*')||granted.includes(permission);
}
export function canAny(roles:readonly Role[],permission:Permission):boolean {
 return roles.some(role=>can(role,permission));
}
export function enforceOrganizationScope(authOrganizationId:string,resourceOrganizationId:string):boolean {
 return Boolean(authOrganizationId)&&authOrganizationId===resourceOrganizationId;
}
// Policy primitives only: auth identity and roles MUST come from verified sessions.
// API route security must never depend on a client-submitted role or organization ID.
