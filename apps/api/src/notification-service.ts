import type {PoolClient} from 'pg';
import type {Role} from './authorization.js';
export type NotificationCategory='ORDER'|'DELIVERY'|'SUPPORT'|'FINANCE'|'LOYALTY'|'SYSTEM';
export async function notifyOrganization(tx:PoolClient,organizationId:string,roles:Role[],category:NotificationCategory,title:string,body:string,subjectType:string,subjectId:string,dedupeKey:string,metadata:Record<string,unknown>={}){
 if(!roles.length)return 0;
 const recipients=await tx.query<{user_id:string}>('SELECT DISTINCT m.user_id FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.role=ANY($2::text[]) AND u.active=true',[organizationId,roles]);
 let created=0;
 for(const recipient of recipients.rows){
  const row=await tx.query('INSERT INTO notifications(recipient_user_id,organization_id,category,title,body,subject_type,subject_id,dedupe_key,metadata) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb WHERE NOT EXISTS(SELECT 1 FROM notification_preferences p WHERE p.user_id=$1 AND p.category=$3 AND p.in_app_enabled=false) ON CONFLICT(recipient_user_id,dedupe_key) DO NOTHING RETURNING id',[recipient.user_id,organizationId,category,title,body,subjectType,subjectId,dedupeKey,JSON.stringify(metadata)]);
  created+=row.rowCount??0;
 }
 return created;
}
