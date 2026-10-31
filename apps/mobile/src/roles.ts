export const roleMenus={
 CUSTOMER:['Home','Catalogue','Orders','Recurring'],
 CUSTOMER_BUYER:['Home','Catalogue','Orders','Recurring'],
 CUSTOMER_ADMIN:['Home','Catalogue','Orders','Recurring','Accounts'],
 PROCUREMENT:['Home','Tasks','Inventory','Orders'],
 STORE:['Home','Tasks','Inventory'],
 CUTTER:['Home','Tasks','Production'],
 OPERATOR:['Home','Tasks','Production','Orders'],
 PRODUCTION_SUPERVISOR:['Home','Tasks','Production','Orders'],
 QC:['Home','Tasks','Quality'],
 PACKER:['Home','Tasks','Packing'],
 DELIVERY:['Home','Tasks','Deliveries'],
 DISPATCH:['Home','Tasks','Deliveries','Orders'],
 ADMIN:['Home','Tasks','Admin','Orders','Catalogue'],
 FINANCE:['Home','Tasks','Finance','Orders'],
 SALES:['Home','Catalogue','Orders','Customers']
} as const;
export type MobileRole=keyof typeof roleMenus;
export type Screen=typeof roleMenus[MobileRole][number];
export const roles=Object.keys(roleMenus) as MobileRole[];
export function menuFor(role:MobileRole):readonly string[]{return roleMenus[role];}
export function mayUse(role:MobileRole,screen:string):boolean{return menuFor(role).some(item=>item===screen);}
export function isBuyer(role:MobileRole):boolean{return role==='CUSTOMER'||role==='CUSTOMER_BUYER'||role==='CUSTOMER_ADMIN';}
export function formatRole(role:MobileRole):string{return role.replaceAll('_',' ').toLowerCase().replace(/\b\w/g,ch=>ch.toUpperCase());}
