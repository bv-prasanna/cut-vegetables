import {Hono} from 'hono';
import {z} from 'zod';
import type {Pool} from 'pg';
import {BusinessFailure,respondError} from './ops-db.js';
import type {Role} from './authorization.js';
type Env={Variables:{userId:string;organizationId:string;roles:Role[]}};
const category=z.enum(['ORDER','DELIVERY','SUPPORT','FINANCE','LOYALTY','SYSTEM']);
export function createNotificationRoutes(pool:Pool){
 const app=new Hono<Env>();
 app.onError((err,c)=>{const e=respondError(err);if(e.status===500)console.error('Notification API failed',err);return c.json({error:e.message},e.status);});
 app.get('/notifications',async c=>{
  const user=c.get('userId'),unreadOnly=c.req.query('unreadOnly')==='true';
  const [items,count]=await Promise.all([
   pool.query('SELECT id,organization_id,category,title,body,subject_type,subject_id,metadata,created_at,read_at FROM notifications WHERE recipient_user_id=$1 AND ($2::boolean=false OR read_at IS NULL) ORDER BY created_at DESC LIMIT 100',[user,unreadOnly]),
   pool.query('SELECT count(*)::int AS unread_count FROM notifications WHERE recipient_user_id=$1 AND read_at IS NULL',[user])
  ]);
  return c.json({items:items.rows,unreadCount:count.rows[0].unread_count});
 });
 app.patch('/notifications/:id/read',async c=>{
  const id=z.string().uuid().safeParse(c.req.param('id'));if(!id.success)throw new BusinessFailure(400,'Invalid notification ID');
  const row=await pool.query('UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND recipient_user_id=$2 RETURNING id,read_at',[id.data,c.get('userId')]);
  if(!row.rowCount)throw new BusinessFailure(404,'Notification not found');
  return c.json(row.rows[0]);
 });
 app.post('/notifications/read-all',async c=>{
  const row=await pool.query('UPDATE notifications SET read_at=now() WHERE recipient_user_id=$1 AND read_at IS NULL RETURNING id',[c.get('userId')]);
  return c.json({markedRead:row.rowCount??0});
 });
 app.get('/notifications/preferences',async c=>{
  const row=await pool.query('SELECT category,in_app_enabled,updated_at FROM notification_preferences WHERE user_id=$1 ORDER BY category',[c.get('userId')]);
  return c.json(row.rows);
 });
 app.put('/notifications/preferences/:category',async c=>{
  const cat=category.safeParse(c.req.param('category'));if(!cat.success)throw new BusinessFailure(400,'Invalid notification category');
  const body=z.object({inAppEnabled:z.boolean()}).safeParse(await c.req.json().catch(()=>null));
  if(!body.success)throw new BusinessFailure(400,'Select whether in-app notifications should be enabled');
  const row=await pool.query('INSERT INTO notification_preferences(user_id,category,in_app_enabled) VALUES($1,$2,$3) ON CONFLICT(user_id,category) DO UPDATE SET in_app_enabled=EXCLUDED.in_app_enabled,updated_at=now() RETURNING category,in_app_enabled,updated_at',[c.get('userId'),cat.data,body.data.inAppEnabled]);
  return c.json(row.rows[0]);
 });
 return app;
}
