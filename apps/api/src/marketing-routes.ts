import {Hono,type Context} from 'hono';
import {z} from 'zod';
import type {Pool} from 'pg';
import {canAny,type Role} from './authorization.js';
import {BusinessFailure,inTransaction,recordEvent,respondError,systemEvent} from './ops-db.js';
type Env={Variables:{userId:string;organizationId:string;roles:Role[]}};
const httpsUrl=z.string().url().refine(value=>new URL(value).protocol==='https:',{message:'Use an HTTPS image or target URL'});
const time=z.string().datetime({offset:true});
const audience=z.enum(['ALL','CUSTOMERS','ZONE','SEGMENT']).default('ALL');
const slideSchema=z.object({
 eyebrow:z.string().trim().min(2).max(80),headline:z.string().trim().min(3).max(200),
 description:z.string().trim().min(3).max(600),imageUrl:httpsUrl,
 mobileImageUrl:httpsUrl.optional().or(z.literal('')),
 altText:z.string().trim().min(3).max(240),targetUrl:httpsUrl.optional().or(z.literal('')),
 ctaLabel:z.string().trim().max(60).optional(),sortOrder:z.number().int().min(0).max(10000),
 startsAt:time,endsAt:time,active:z.boolean(),audience,audienceValue:z.string().trim().max(120).optional()
}).refine(v=>new Date(v.endsAt).getTime()>new Date(v.startsAt).getTime(),{path:['endsAt'],message:'End time must be after start time'});
const announcementSchema=z.object({
 title:z.string().trim().min(3).max(160),body:z.string().trim().min(3).max(1200),
 startsAt:time,endsAt:time,active:z.boolean(),audience,
 audienceValue:z.string().trim().max(120).optional(),priority:z.number().int().min(0).max(10000).default(0),
 urgency:z.enum(['INFO','IMPORTANT','CRITICAL']).default('INFO')
}).refine(v=>new Date(v.endsAt).getTime()>new Date(v.startsAt).getTime(),{path:['endsAt'],message:'End time must be after start time'});
function canRead(c:Context<Env>){return canAny(c.get('roles'),'marketing:read')||canAny(c.get('roles'),'marketing:write');}
function canWrite(c:Context<Env>){return canAny(c.get('roles'),'marketing:write');}
function parseId(c:Context<Env>){
 const parsed=z.string().uuid().safeParse(c.req.param('id'));
 if(!parsed.success)throw new BusinessFailure(400,'Invalid marketing record identifier');
 return parsed.data;
}
function parseBody<T extends z.ZodTypeAny>(input:unknown,schema:T):z.infer<T>{
 const parsed=schema.safeParse(input);
 if(!parsed.success)throw new BusinessFailure(400,'Invalid marketing content: '+parsed.error.issues.map(x=>x.path.join('.')).join(', '));
 return parsed.data;
}
export function createMarketingRoutes(pool:Pool,clock:()=>Date=()=>new Date()){
 const app=new Hono<Env>();
 app.onError((err,c)=>{
  const e=respondError(err);
  if(e.status===500)console.error('Marketing API error',err);
  return c.json({error:e.message},e.status);
 });
 app.get('/home/slides',async c=>{
  const q=await pool.query(`SELECT id,eyebrow,title AS headline,description,image_url AS "imageUrl",
   alt_text AS "altText",target_url AS "targetUrl",cta_label AS "ctaLabel",
   mobile_image_url AS "mobileImageUrl",sort_order AS "sortOrder",active
   FROM hero_slides WHERE active=true AND audience='ALL' AND starts_at<=$1 AND ends_at>$1
   ORDER BY sort_order,starts_at DESC LIMIT 12`,[clock()]);
  return c.json(q.rows);
 });
 app.get('/home/announcements',async c=>{
  const q=await pool.query(`SELECT id,title,body,urgency,priority
   FROM announcements WHERE active=true AND audience='ALL' AND starts_at<=$1 AND ends_at>$1
   ORDER BY priority DESC,starts_at DESC LIMIT 20`,[clock()]);
  return c.json(q.rows);
 });
 app.get('/v1/admin/marketing/slides',async c=>{
  if(!canRead(c))throw new BusinessFailure(403,'Permission denied');
  const q=await pool.query(`SELECT id,eyebrow,title AS headline,description,image_url AS "imageUrl",
   alt_text AS "altText",target_url AS "targetUrl",cta_label AS "ctaLabel",
   mobile_image_url AS "mobileImageUrl",sort_order AS "sortOrder",starts_at AS "startsAt",
   ends_at AS "endsAt",active,audience,audience_value AS "audienceValue"
   FROM hero_slides ORDER BY sort_order,starts_at DESC LIMIT 300`);
  return c.json(q.rows);
 });
 app.post('/v1/admin/marketing/slides',async c=>{
  if(!canWrite(c))throw new BusinessFailure(403,'Permission denied');
  const input=parseBody(await c.req.json().catch(()=>null),slideSchema);
  const created=await inTransaction(pool,async tx=>{
   const r=await tx.query<{id:string}>(`INSERT INTO hero_slides
    (eyebrow,title,description,image_url,mobile_image_url,alt_text,target_url,cta_label,sort_order,
     starts_at,ends_at,active,audience,audience_value)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,[
    input.eyebrow,input.headline,input.description,input.imageUrl,input.mobileImageUrl||null,input.altText,
    input.targetUrl||null,input.ctaLabel||null,input.sortOrder,input.startsAt,input.endsAt,input.active,
    input.audience,input.audienceValue||null
   ]);
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),
    systemEvent('MARKETING_SLIDE_CREATED','HERO_SLIDE',r.rows[0].id),'MARKETING_SLIDE_CREATED','HERO_SLIDE',r.rows[0].id);
   return r.rows[0];
  });
  return c.json(created,201);
 });
 app.patch('/v1/admin/marketing/slides/:id',async c=>{
  if(!canWrite(c))throw new BusinessFailure(403,'Permission denied');
  const id=parseId(c),input=parseBody(await c.req.json().catch(()=>null),slideSchema);
  const updated=await inTransaction(pool,async tx=>{
   const found=await tx.query('SELECT id FROM hero_slides WHERE id=$1 FOR UPDATE',[id]);
   if(!found.rowCount)throw new BusinessFailure(404,'Hero slide not found');
   await tx.query(`UPDATE hero_slides SET eyebrow=$2,title=$3,description=$4,image_url=$5,
    mobile_image_url=$6,alt_text=$7,target_url=$8,cta_label=$9,sort_order=$10,starts_at=$11,
    ends_at=$12,active=$13,audience=$14,audience_value=$15 WHERE id=$1`,[
    id,input.eyebrow,input.headline,input.description,input.imageUrl,input.mobileImageUrl||null,input.altText,
    input.targetUrl||null,input.ctaLabel||null,input.sortOrder,input.startsAt,input.endsAt,input.active,
    input.audience,input.audienceValue||null
   ]);
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),
    systemEvent('MARKETING_SLIDE_UPDATED','HERO_SLIDE',id),'MARKETING_SLIDE_UPDATED','HERO_SLIDE',id);
   return {id};
  });
  return c.json(updated);
 });
 app.delete('/v1/admin/marketing/slides/:id',async c=>{
  if(!canWrite(c))throw new BusinessFailure(403,'Permission denied');
  const id=parseId(c);
  await inTransaction(pool,async tx=>{
   const found=await tx.query('UPDATE hero_slides SET active=false WHERE id=$1 RETURNING id',[id]);
   if(!found.rowCount)throw new BusinessFailure(404,'Hero slide not found');
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),
    systemEvent('MARKETING_SLIDE_ARCHIVED','HERO_SLIDE',id),'MARKETING_SLIDE_ARCHIVED','HERO_SLIDE',id);
  });
  return c.json({id,archived:true});
 });
 app.get('/v1/admin/marketing/announcements',async c=>{
  if(!canRead(c))throw new BusinessFailure(403,'Permission denied');
  const q=await pool.query(`SELECT id,title,body,starts_at AS "startsAt",ends_at AS "endsAt",
   active,audience,audience_value AS "audienceValue",priority,urgency
   FROM announcements ORDER BY priority DESC,starts_at DESC LIMIT 300`);
  return c.json(q.rows);
 });
 app.post('/v1/admin/marketing/announcements',async c=>{
  if(!canWrite(c))throw new BusinessFailure(403,'Permission denied');
  const input=parseBody(await c.req.json().catch(()=>null),announcementSchema);
  const created=await inTransaction(pool,async tx=>{
   const r=await tx.query<{id:string}>(`INSERT INTO announcements
    (title,body,starts_at,ends_at,active,audience,audience_value,priority,urgency)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[
    input.title,input.body,input.startsAt,input.endsAt,input.active,input.audience,input.audienceValue||null,input.priority,input.urgency
   ]);
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),
    systemEvent('MARKETING_ANNOUNCEMENT_CREATED','ANNOUNCEMENT',r.rows[0].id),
    'MARKETING_ANNOUNCEMENT_CREATED','ANNOUNCEMENT',r.rows[0].id);
   return r.rows[0];
  });
  return c.json(created,201);
 });
 app.patch('/v1/admin/marketing/announcements/:id',async c=>{
  if(!canWrite(c))throw new BusinessFailure(403,'Permission denied');
  const id=parseId(c),input=parseBody(await c.req.json().catch(()=>null),announcementSchema);
  await inTransaction(pool,async tx=>{
   const found=await tx.query('SELECT id FROM announcements WHERE id=$1 FOR UPDATE',[id]);
   if(!found.rowCount)throw new BusinessFailure(404,'Announcement not found');
   await tx.query(`UPDATE announcements SET title=$2,body=$3,starts_at=$4,ends_at=$5,
    active=$6,audience=$7,audience_value=$8,priority=$9,urgency=$10 WHERE id=$1`,[
    id,input.title,input.body,input.startsAt,input.endsAt,input.active,input.audience,input.audienceValue||null,input.priority,input.urgency
   ]);
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),
    systemEvent('MARKETING_ANNOUNCEMENT_UPDATED','ANNOUNCEMENT',id),
    'MARKETING_ANNOUNCEMENT_UPDATED','ANNOUNCEMENT',id);
  });
  return c.json({id});
 });
 app.delete('/v1/admin/marketing/announcements/:id',async c=>{
  if(!canWrite(c))throw new BusinessFailure(403,'Permission denied');
  const id=parseId(c);
  await inTransaction(pool,async tx=>{
   const found=await tx.query('UPDATE announcements SET active=false WHERE id=$1 RETURNING id',[id]);
   if(!found.rowCount)throw new BusinessFailure(404,'Announcement not found');
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),
    systemEvent('MARKETING_ANNOUNCEMENT_ARCHIVED','ANNOUNCEMENT',id),
    'MARKETING_ANNOUNCEMENT_ARCHIVED','ANNOUNCEMENT',id);
  });
  return c.json({id,archived:true});
 });
 return app;
}
