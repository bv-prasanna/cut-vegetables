import {Hono} from 'hono';
import {z} from 'zod';
import type {Pool} from 'pg';
import {canAny,type Role} from './authorization.js';
type Env={Variables:{userId:string;organizationId:string;roles:Role[]}};
const querySchema=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),slotId:z.string().uuid().optional()});
const toNumber=(v:unknown)=>Number(v??0);
const reject=(message:string)=>({error:message});
export function createStaffBoardRoutes(pool:Pool){
 const app=new Hono<Env>();
 const params=(raw:unknown)=>querySchema.safeParse(raw);
 app.get('/ops/production-plan',async c=>{
  if(!canAny(c.get('roles'),'production:read'))return c.json(reject('Forbidden'),403);
  const p=params({date:c.req.query('date'),slotId:c.req.query('slotId')||undefined});
  if(!p.success)return c.json(reject('Valid date YYYY-MM-DD and optional slotId are required'),400);
  const q=await pool.query(`
   WITH demand AS (
     SELECT o.delivery_date::text AS delivery_date, o.slot_id, ds.label AS slot_label,ds.start_minute,
       oi.variant_id,pv.sku,v.name AS vegetable,pv.method_code AS preparation,
       CASE WHEN pv.size_kind='numeric' THEN pv.size_number::text||' '||pv.size_unit
        ELSE pv.size_label END AS size,
       SUM(oi.grams)::bigint AS required_grams,COUNT(DISTINCT o.id)::int AS order_count
     FROM orders o JOIN order_items oi ON oi.order_id=o.id
     JOIN delivery_slots ds ON ds.id=o.slot_id
     JOIN product_variants pv ON pv.id=oi.variant_id JOIN vegetables v ON v.id=pv.vegetable_id
     WHERE o.producer_organization_id=$1 AND o.delivery_date=$2::date
      AND ($3::uuid IS NULL OR o.slot_id=$3::uuid) AND o.state<>'CANCELLED'
     GROUP BY o.delivery_date,o.slot_id,ds.label,ds.start_minute,oi.variant_id,pv.sku,v.name,pv.method_code,pv.size_kind,pv.size_number,pv.size_unit,pv.size_label
   )
   SELECT d.*,COALESCE((
     SELECT SUM(pb.input_grams) FROM production_batches pb JOIN orders o ON o.id=pb.order_id
     WHERE o.producer_organization_id=$1 AND o.delivery_date=$2::date AND o.slot_id=d.slot_id AND pb.variant_id=d.variant_id
       AND pb.state NOT IN ('SCRAPPED','QC_FAILED')
   ),0)::bigint AS input_grams,
   COALESCE((
     SELECT SUM(pb.output_grams) FROM production_batches pb JOIN orders o ON o.id=pb.order_id
     WHERE o.producer_organization_id=$1 AND o.delivery_date=$2::date AND o.slot_id=d.slot_id AND pb.variant_id=d.variant_id
       AND pb.state IN ('QC_PASSED','PACKED')
   ),0)::bigint AS qc_approved_grams,
   COALESCE((
     SELECT SUM(pu.net_grams) FROM pack_units pu JOIN production_batches pb ON pb.id=pu.batch_id JOIN orders o ON o.id=pb.order_id
     WHERE o.producer_organization_id=$1 AND o.delivery_date=$2::date AND o.slot_id=d.slot_id AND pb.variant_id=d.variant_id
   ),0)::bigint AS packed_grams
   FROM demand d ORDER BY d.start_minute,d.vegetable,d.preparation,d.size
  `,[c.get('organizationId'),p.data.date,p.data.slotId??null]);
  return c.json(q.rows.map(row=>({...row,required_grams:toNumber(row.required_grams),input_grams:toNumber(row.input_grams),
   qc_approved_grams:toNumber(row.qc_approved_grams),packed_grams:toNumber(row.packed_grams)})));
 });
 app.get('/ops/packing-board',async c=>{
  if(!canAny(c.get('roles'),'packing:read')&&!canAny(c.get('roles'),'packing:write'))return c.json(reject('Forbidden'),403);
  const p=params({date:c.req.query('date'),slotId:c.req.query('slotId')||undefined});
  if(!p.success)return c.json(reject('Valid date and optional slotId are required'),400);
  const q=await pool.query(`
   SELECT o.id AS order_id,o.delivery_date::text AS delivery_date,o.state,
    ds.label AS slot_label,k.name AS kitchen,org.name AS customer,
    oi.variant_id,oi.grams AS required_grams,v.name AS vegetable,pv.method_code AS preparation,
    CASE WHEN pv.size_kind='numeric' THEN pv.size_number::text||' '||pv.size_unit ELSE pv.size_label END AS size,
    COALESCE((SELECT SUM(pb.output_grams) FROM production_batches pb
     WHERE pb.order_id=o.id AND pb.variant_id=oi.variant_id AND pb.state IN ('QC_PASSED','PACKED')),0)::bigint AS qc_approved_grams,
    COALESCE((SELECT SUM(pu.net_grams) FROM pack_units pu JOIN production_batches pb ON pb.id=pu.batch_id
     WHERE pb.order_id=o.id AND pb.variant_id=oi.variant_id),0)::bigint AS packed_grams
   FROM orders o JOIN order_items oi ON oi.order_id=o.id JOIN kitchens k ON k.id=o.kitchen_id
    JOIN organizations org ON org.id=o.organization_id JOIN delivery_slots ds ON ds.id=o.slot_id
    JOIN product_variants pv ON pv.id=oi.variant_id JOIN vegetables v ON v.id=pv.vegetable_id
   WHERE o.producer_organization_id=$1 AND o.delivery_date=$2::date
     AND ($3::uuid IS NULL OR o.slot_id=$3::uuid) AND o.state<>'CANCELLED'
   ORDER BY ds.start_minute,customer,kitchen,o.id,vegetable
  `,[c.get('organizationId'),p.data.date,p.data.slotId??null]);
  const byOrder=new Map<string,{orderId:string;date:string;slot:string;customer:string;kitchen:string;state:string;lines:unknown[]}>();
  for(const row of q.rows){
   if(!byOrder.has(row.order_id))byOrder.set(row.order_id,{orderId:row.order_id,date:row.delivery_date,slot:row.slot_label,customer:row.customer,kitchen:row.kitchen,state:row.state,lines:[]});
   byOrder.get(row.order_id)!.lines.push({variantId:row.variant_id,vegetable:row.vegetable,preparation:row.preparation,size:row.size,
     requiredGrams:toNumber(row.required_grams),qcApprovedGrams:toNumber(row.qc_approved_grams),packedGrams:toNumber(row.packed_grams)});
  }
  return c.json([...byOrder.values()]);
 });
 app.get('/ops/delivery-board',async c=>{
  if(!canAny(c.get('roles'),'delivery:read')&&!canAny(c.get('roles'),'delivery:assigned'))return c.json(reject('Forbidden'),403);
  const p=params({date:c.req.query('date'),slotId:c.req.query('slotId')||undefined});
  if(!p.success)return c.json(reject('Valid date and optional slotId are required'),400);
  const scopedDriver=!canAny(c.get('roles'),'delivery:read');
  const q=await pool.query(`
    SELECT dr.id AS run_id,dr.status AS run_state,dr.driver_id,ds.label AS slot_label,
     dr.delivery_date::text AS delivery_date,
     st.id AS stop_id,st.stop_number,st.status AS stop_state,st.order_id,
     o.state AS order_state,k.name AS kitchen,k.address,org.name AS customer
    FROM delivery_runs dr JOIN delivery_slots ds ON ds.id=dr.slot_id
     LEFT JOIN delivery_stops st ON st.run_id=dr.id
     LEFT JOIN orders o ON o.id=st.order_id LEFT JOIN kitchens k ON k.id=o.kitchen_id
     LEFT JOIN organizations org ON org.id=o.organization_id
    WHERE dr.producer_organization_id=$1 AND dr.delivery_date=$2::date
      AND ($3::uuid IS NULL OR dr.slot_id=$3::uuid)
      AND ($4::boolean=false OR dr.driver_id=$5::uuid)
    ORDER BY ds.start_minute,dr.id,st.stop_number
   `,[c.get('organizationId'),p.data.date,p.data.slotId??null,scopedDriver,c.get('userId')]);
  return c.json(q.rows);
 });
 return app;
}
