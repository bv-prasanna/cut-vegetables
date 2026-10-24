export const permissions = {
 SUPERADMIN:['*'], ADMIN:['catalog:write','slots:write','orders:read','marketing:write','reports:read'],
 CUSTOMER_ADMIN:['catalog:read','orders:write','orders:read','schedules:write','schedules:read'],
 CUSTOMER_BUYER:['catalog:read','orders:write','orders:read','schedules:write','schedules:read'],
 CUSTOMER_VIEWER:['catalog:read','orders:read','schedules:read'],
 OPERATOR:['orders:read','production:write'], QC:['orders:read','qc:write'],
 DISPATCH:['orders:read','delivery:write'], FINANCE:['orders:read','finance:write']
} as const;
export type Role = keyof typeof permissions;
export type Permission = string;
export function can(role:Role,permission:Permission):boolean {
 const granted:readonly string[]=permissions[role];
 return granted.includes('*')||granted.includes(permission);
}
export function enforceOrganizationScope(authOrganizationId:string,resourceOrganizationId:string):boolean {
 return authOrganizationId===resourceOrganizationId;
}
// These are policy primitives, NOT authentication middleware.
// Never trust a role or organization ID supplied in an HTTP request body/header.
