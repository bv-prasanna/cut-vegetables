/** Shared production-mobile API access. The JWT stays in process memory only.
 * Do not fall back to /dev endpoints or persist bearer tokens in AsyncStorage.
 */
export type Session={accessToken:string;expiresInSeconds:number};
export type Identity={userId:string;organizationId:string;roles:string[]};
export type CatalogueVariant={
 id:string;sku:string;vegetable:string;preparation:string;
 size_kind:'numeric'|'label';size_number:string|null;size_unit:string|null;size_label:string|null;
 image_url:string;price_paise_per_kg:number;minimum_grams:number;increment_grams:number
};
export type Kitchen={id:string;name:string;address:string;zone_code:string};
export type DeliverySlot={id:string;label:string;zone_code:string;start_minute:number;end_minute:number;
 cutoff_day_offset:number;cutoff_minute:number;capacity_orders:number};
export type Order={id:string;kitchen_id:string;delivery_date:string;slot_id:string;state:string;created_at:string};
export type StaffBoardRow=Record<string,unknown>;

export function validateApiBase(value:string|undefined):string{
 if(!value||!value.trim())throw new Error('EXPO_PUBLIC_API_URL must point to your secure API');
 const url=new URL(value);
 if(url.username||url.password||url.search||url.hash)throw new Error('API URL must not contain credentials, query or fragment');
 const local=['localhost','127.0.0.1','10.0.2.2'].includes(url.hostname);
 if(url.protocol!=='https:'&&!(local&&url.protocol==='http:'))throw new Error('Use an HTTPS API outside the emulator');
 return url.origin+url.pathname.replace(/\/$/,'');
}
export function isSecureMobileRelease():boolean{
 // Explicitly opt in to the unauthenticated demo. Release builds never use the local demo by default.
 return process.env.EXPO_PUBLIC_ENABLE_DEMO!=='true';
}
export function screenPermissions(roles:readonly string[]):string[]{
 const has=(...values:string[])=>roles.includes('SUPERADMIN')||values.some(role=>roles.includes(role));
 const screens=['Home'];
 if(has('CUSTOMER_ADMIN','CUSTOMER_BUYER','CUSTOMER_VIEWER','ADMIN','SALES'))screens.push('Catalogue','Orders');
 if(has('CUSTOMER_ADMIN','CUSTOMER_BUYER','CUSTOMER_VIEWER'))screens.push('Recurring');
 if(has('CUSTOMER_ADMIN','CUSTOMER_BUYER'))screens.push('Place Order');
 if(has('OPERATOR','PRODUCTION_SUPERVISOR','STORE'))screens.push('Cutting');
 if(has('QC','PRODUCTION_SUPERVISOR'))screens.push('Quality');
 if(has('PACKER'))screens.push('Packing');
 if(has('PROCUREMENT','STORE'))screens.push('Procurement');
 if(has('DISPATCH','DRIVER'))screens.push('Delivery');
 if(has('ADMIN'))screens.push('Administration');
 return screens;
}
export function sizeDescription(v:CatalogueVariant):string{
 return v.size_kind==='numeric'?v.size_number+' '+v.size_unit:v.size_label||'';
}
export function firstAllowedScreen(roles:readonly string[]):string{
 return screenPermissions(roles)[0];
}
export function nextQuantity(current:number,minimum:number,increment:number,sign:1|-1):number{
 if(!Number.isSafeInteger(current)||current<0||!Number.isSafeInteger(minimum)||minimum<=0||
  !Number.isSafeInteger(increment)||increment<=0)throw Error('Invalid product weight configuration');
 if(sign===1)return current?current+increment:minimum;
 return current<=minimum?0:Math.max(minimum,current-increment);
}
export function mobileStatusMessage(status:number,path:string,serverMessage:unknown):string{
 if(status===401)return path==='/auth/login'?'Email, password or organisation ID is incorrect.':'Session expired. Sign in again.';
 if(status===403)return 'Your account does not have permission to perform this action.';
 if(status===429)return 'Too many attempts. Please try again later.';
 if(status===404)return 'This record is unavailable. Refresh and try again.';
 if(status===409)return 'This action conflicts with a previous change. Refresh and review the record.';
 if(status>=500)return 'FreshPrep is temporarily unavailable. Please retry shortly.';
 if(status===400||status===422){
  const message=typeof serverMessage==='string'?serverMessage:'';
  if(message&&message.length<=170&&!/(?:sql|postgres|server|syntax|stack|password|secret|token|relation|\/(?:usr|var)\/)/i.test(message)&&!/[<>\r\n]/.test(message))
   return message;
  return 'Review the entered details and try again.';
 }
 return 'We could not complete this action. Please retry.';
}
export async function backend<T>(base:string,path:string,token?:string,method='GET',data?:unknown):Promise<T>{
 let result:Response;
 try{
  result=await fetch(base+path,{
   method,headers:{...(data!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'Authorization':'Bearer '+token}:{})},
   body:data===undefined?undefined:JSON.stringify(data)
  });
 }catch{const e=new Error('Cannot reach FreshPrep. Check your network and retry.');
  Object.assign(e,{status:0});throw e;}
 const payload:unknown=await result.json().catch(()=>null);
 if(!result.ok){
  const serverError=payload&&typeof payload==='object'?(payload as Record<string,unknown>).error:undefined;
  const e=new Error(mobileStatusMessage(result.status,path,serverError));
  Object.assign(e,{status:result.status});throw e;
 }
 if(payload===null){const e=new Error('Unexpected response. Please retry.');Object.assign(e,{status:502});throw e;}
 return payload as T;
}
