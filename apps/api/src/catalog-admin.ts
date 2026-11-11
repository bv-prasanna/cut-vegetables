import {Hono} from 'hono';
import {z} from 'zod';
import type {Pool} from 'pg';
import {canAny,type Role} from './authorization.js';
import {BusinessFailure,inTransaction,recordEvent,systemEvent,respondError} from './ops-db.js';
import {geoEventSchema} from './geo-events.js';
type Env={Variables:{userId:string;organizationId:string;roles:Role[]}};
const uuid=z.string().uuid();
const positive=z.number().int().positive();
const event=z.object({event:geoEventSchema.optional()});
export const vegetableInput=z.object({name:z.string().trim().min(2).max(120)}).merge(event);
export const variantInput=z.object({
 vegetableId:uuid,sku:z.string().regex(/^[A-Z0-9_-]{4,80}$/),
 methodCode:z.enum(['DICED','CHOPPED','SLICED','GRATED','SHREDDED','JULIENNE','PEELED']),
 size:z.discriminatedUnion('kind',[
  z.object({kind:z.literal('numeric'),value:z.number().positive(),unit:z.enum(['mm','cm'])}),
  z.object({kind:z.literal('label'),value:z.enum(['fine','medium','coarse','thin','thick'])})
 ]),
 imageUrl:z.string().url(),pricePaisePerKg:z.number().int().nonnegative(),
 minimumGrams:positive,incrementGrams:positive
}).merge(event);
export const variantUpdate=z.object({
 pricePaisePerKg:z.number().int().nonnegative().optional(),
 imageUrl:z.string().url().optional(),
 minimumGrams:positive.optional(),incrementGrams:positive.optional(),active:z.boolean().optional()
}).merge(event).refine(v=>Object.keys(v).some(k=>k!=='event'),{message:'No changes requested'});
export const slotInput=z.object({
 zoneCode:z.string().trim().min(2).max(100),label:z.string().trim().min(3).max(150),
 startMinute:z.number().int().min(0).max(1439),endMinute:z.number().int().min(1).max(1440),
 cutoffDayOffset:z.number().int().min(0).max(7),
 cutoffMinute:z.number().int().min(0).max(1439),
 capacityOrders:positive
}).merge(event).refine(s=>s.endMinute>s.startMinute,{message:'End must be after start'});
export const slotUpdate=z.object({
 label:z.string().trim().min(3).max(150).optional(),active:z.boolean().optional(),
 capacityOrders:positive.optional(),cutoffDayOffset:z.number().int().min(0).max(7).optional(),
 cutoffMinute:z.number().int().min(0).max(1439).optional()
}).merge(event).refine(v=>Object.keys(v).some(k=>k!=='event'),{message:'No changes requested'});
function writePermission(roles:Role[],kind:'catalog'|'slots'):void{
 if(!roles.includes('SUPERADMIN'))
  throw new BusinessFailure(403,'Only Super Admin can change shared '+kind+' settings');
}
async function payload<T extends z.ZodTypeAny>(c:{req:{json:()=>Promise<unknown>}},schema:T):Promise<z.infer<T>>{
 const data=schema.safeParse(await c.req.json().catch(()=>null));
 if(!data.success)throw new BusinessFailure(400,'Invalid request: '+data.error.issues.map(i=>i.path.join('.')).join(', '));
 return data.data;
}
export function createCatalogAdminRoutes(pool:Pool){
 const app=new Hono<Env>();
 app.onError((err,c)=>{
  const error=respondError(err);
  if(error.status===500)console.error('Catalogue API failed',err);
  return c.json({error:error.message},error.status);
 });
 app.get('/admin/vegetables',async c=>{
  if(!canAny(c.get('roles'),'catalog:read'))throw new BusinessFailure(403,'Forbidden');
  const q=await pool.query('SELECT id,name,active FROM vegetables ORDER BY name LIMIT 1000');
  return c.json(q.rows);
 });
 app.get('/admin/variants',async c=>{
  if(!canAny(c.get('roles'),'catalog:read'))throw new BusinessFailure(403,'Forbidden');
  const q=await pool.query(`SELECT pv.id,pv.sku,pv.vegetable_id,v.name AS vegetable,
   pv.method_code,pv.size_kind,pv.size_number,pv.size_unit,pv.size_label,
   pv.image_url,pv.price_paise_per_kg,pv.minimum_grams,pv.increment_grams,pv.active
   FROM product_variants pv JOIN vegetables v ON v.id=pv.vegetable_id
   ORDER BY v.name,pv.sku LIMIT 1000`);
  return c.json(q.rows);
 });
 app.get('/admin/slots',async c=>{
  if(!canAny(c.get('roles'),'slots:read')&&!canAny(c.get('roles'),'slots:write'))
   throw new BusinessFailure(403,'Forbidden');
  const q=await pool.query(`SELECT id,zone_code,label,start_minute,end_minute,
   cutoff_day_offset,cutoff_minute,capacity_orders,active
   FROM delivery_slots ORDER BY zone_code,start_minute LIMIT 500`);
  return c.json(q.rows);
 });
 app.post('/admin/vegetables',async c=>{
  writePermission(c.get('roles'),'catalog');
  const data=await payload(c,vegetableInput);
  const result=await inTransaction(pool,async tx=>{
   const row=await tx.query<{id:string}>(`INSERT INTO vegetables(name) VALUES($1)
    ON CONFLICT(name) DO NOTHING RETURNING id`,[data.name]);
   if(!row.rowCount)throw new BusinessFailure(409,'Vegetable already exists');
   const id=row.rows[0].id;
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),data.event??systemEvent('VEGETABLE_CREATED','VEGETABLE',id),'VEGETABLE_CREATED','VEGETABLE',id);
   return {id,name:data.name};
  });
  return c.json(result,201);
 });
 app.post('/admin/variants',async c=>{
  writePermission(c.get('roles'),'catalog');
  const data=await payload(c,variantInput);
  const created=await inTransaction(pool,async tx=>{
   const veg=await tx.query('SELECT 1 FROM vegetables WHERE id=$1 AND active=true',[data.vegetableId]);
   if(!veg.rowCount)throw new BusinessFailure(422,'Vegetable unavailable');
   const size=data.size.kind==='numeric'
    ?{number:data.size.value,unit:data.size.unit,label:null}
    :{number:null,unit:null,label:data.size.value};
   const result=await tx.query<{id:string}>(`INSERT INTO product_variants(
    vegetable_id,method_code,sku,size_kind,size_number,size_unit,size_label,image_url,
    price_paise_per_kg,minimum_grams,increment_grams,active)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)
    ON CONFLICT(sku) DO NOTHING RETURNING id`,[
     data.vegetableId,data.methodCode,data.sku,data.size.kind,
     size.number,size.unit,size.label,
     data.imageUrl,data.pricePaisePerKg,data.minimumGrams,data.incrementGrams
    ]);
   if(!result.rowCount)throw new BusinessFailure(409,'Product SKU already exists');
   const id=result.rows[0].id;
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),data.event??systemEvent('PRODUCT_VARIANT_CREATED','VARIANT',id),
    'PRODUCT_VARIANT_CREATED','VARIANT',id);
   return {id,sku:data.sku};
  });
  return c.json(created,201);
 });
 app.patch('/admin/variants/:id',async c=>{
  writePermission(c.get('roles'),'catalog');
  const id=uuid.safeParse(c.req.param('id'));
  if(!id.success)throw new BusinessFailure(400,'Invalid variant ID');
  const data=await payload(c,variantUpdate);
  const result=await inTransaction(pool,async tx=>{
   const updated=await tx.query(`UPDATE product_variants SET
    price_paise_per_kg=COALESCE($2,price_paise_per_kg),
    image_url=COALESCE($3,image_url),minimum_grams=COALESCE($4,minimum_grams),
    increment_grams=COALESCE($5,increment_grams),active=COALESCE($6,active)
    WHERE id=$1 RETURNING id`,[
     id.data,data.pricePaisePerKg??null,data.imageUrl??null,data.minimumGrams??null,
     data.incrementGrams??null,data.active??null
    ]);
   if(!updated.rowCount)throw new BusinessFailure(404,'Variant not found');
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),data.event??systemEvent('PRODUCT_VARIANT_UPDATED','VARIANT',id.data),
    'PRODUCT_VARIANT_UPDATED','VARIANT',id.data);
   return {id:id.data,updated:true};
  });
  return c.json(result);
 });
 app.post('/admin/slots',async c=>{
  writePermission(c.get('roles'),'slots');
  const data=await payload(c,slotInput);
  const result=await inTransaction(pool,async tx=>{
   const row=await tx.query<{id:string}>(`INSERT INTO delivery_slots(
    zone_code,label,start_minute,end_minute,cutoff_day_offset,cutoff_minute,capacity_orders)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[
     data.zoneCode,data.label,data.startMinute,data.endMinute,
     data.cutoffDayOffset,data.cutoffMinute,data.capacityOrders
    ]);
   const id=row.rows[0].id;
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),data.event??systemEvent('DELIVERY_SLOT_CREATED','SLOT',id),
    'DELIVERY_SLOT_CREATED','SLOT',id);
   return {id,label:data.label};
  });
  return c.json(result,201);
 });
 app.patch('/admin/slots/:id',async c=>{
  writePermission(c.get('roles'),'slots');
  const id=uuid.safeParse(c.req.param('id'));
  if(!id.success)throw new BusinessFailure(400,'Invalid slot ID');
  const data=await payload(c,slotUpdate);
  const result=await inTransaction(pool,async tx=>{
   const slot=await tx.query(`UPDATE delivery_slots SET
    label=COALESCE($2,label),active=COALESCE($3,active),
    capacity_orders=COALESCE($4,capacity_orders),
    cutoff_day_offset=COALESCE($5,cutoff_day_offset),
    cutoff_minute=COALESCE($6,cutoff_minute)
    WHERE id=$1 RETURNING id`,[
     id.data,data.label??null,data.active??null,data.capacityOrders??null,
     data.cutoffDayOffset??null,data.cutoffMinute??null
    ]);
   if(!slot.rowCount)throw new BusinessFailure(404,'Slot not found');
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),data.event??systemEvent('DELIVERY_SLOT_UPDATED','SLOT',id.data),
    'DELIVERY_SLOT_UPDATED','SLOT',id.data);
   return {id:id.data,updated:true};
  });
  return c.json(result);
 });
 return app;
}
