import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
export function passwordHash(password:string):string {
 if(password.length<12||password.length>1024)throw new Error('Password length must be 12–1024');
 const salt=randomBytes(16);
 return 'scrypt:'+salt.toString('hex')+':'+scryptSync(password,salt,64).toString('hex');
}
export function passwordMatches(password:string,stored:string):boolean {
 const parts=stored.split(':');
 if(parts.length!==3||parts[0]!=='scrypt'||!/^[a-f0-9]{32}$/.test(parts[1])||!/^[a-f0-9]{128}$/.test(parts[2]))return false;
 const expected=Buffer.from(parts[2],'hex');
 const actual=scryptSync(password,Buffer.from(parts[1],'hex'),expected.length);
 return timingSafeEqual(expected,actual);
}
export function newSessionToken():string{return randomBytes(32).toString('base64url');}
export function digestToken(token:string):string{return createHash('sha256').update(token).digest('hex');}
export function bearerToken(header:string|undefined):string|null {
 if(!header)return null;
 const match=/^Bearer ([A-Za-z0-9_-]{32,200})$/.exec(header);
 return match?match[1]:null;
}
