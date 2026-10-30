import {Pool} from 'pg';
import {buildDemoCatalogue,buildDemoSlots} from './demo-catalog.js';
// Explicitly opt-in; never make a test catalogue look like real merchandise.
if(process.env.FRESHPREP_DEMO_DB_SEED!=='YES_I_WANT_SAMPLE_DATA')throw Error('Set FRESHPREP_DEMO_DB_SEED=YES_I_WANT_SAMPLE_DATA to insert sample data');
if(process.env.NODE_ENV==='production')throw Error('Refusing to seed a production environment');
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is required');
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const client=await pool.connect();
try{
 await client.query('BEGIN');
 const vegetableIds=new Map<string,string>();
 for(const product of buildDemoCatalogue()){
  if(vegetableIds.has(product.vegetable))continue;
  const q=await client.query<{id:string}>('INSERT INTO vegetables(name,active) VALUES($1,true) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id',[product.vegetable]);
  vegetableIds.set(product.vegetable,q.rows[0].id);
 }
 for(const v of buildDemoCatalogue()){
  const numeric=v.size.kind==='numeric';
  await client.query(`INSERT INTO product_variants(vegetable_id,method_code,sku,size_kind,size_number,size_unit,size_label,image_url,price_paise_per_kg,minimum_grams,increment_grams,active)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)
   ON CONFLICT(sku) DO UPDATE SET vegetable_id=EXCLUDED.vegetable_id,method_code=EXCLUDED.method_code,
    size_kind=EXCLUDED.size_kind,size_number=EXCLUDED.size_number,size_unit=EXCLUDED.size_unit,size_label=EXCLUDED.size_label,
    image_url=EXCLUDED.image_url,price_paise_per_kg=EXCLUDED.price_paise_per_kg,
    minimum_grams=EXCLUDED.minimum_grams,increment_grams=EXCLUDED.increment_grams,active=true`,
   [vegetableIds.get(v.vegetable),v.preparation,v.id.toUpperCase(),v.size.kind,numeric?v.size.value:null,numeric?v.size.unit:null,numeric?null:v.size.value,v.imageUrl,v.pricePaisePerKg,v.minimumGrams,v.incrementGrams]);
 }
 for(const s of buildDemoSlots()){
  const existing=await client.query<{id:string}>('SELECT id FROM delivery_slots WHERE zone_code=$1 AND label=$2 LIMIT 1',['BENGALURU_DEMO',s.label]);
  if(existing.rowCount)continue;
  await client.query(`INSERT INTO delivery_slots(zone_code,label,start_minute,end_minute,cutoff_day_offset,cutoff_minute,capacity_orders,active)
  VALUES($1,$2,$3,$4,$5,$6,$7,true)`,['BENGALURU_DEMO',s.label,s.startMinute,s.endMinute,s.cutoffDayOffset,s.cutoffMinute,s.capacityOrders]);
 }
 await client.query('COMMIT');
 console.log('Demo data seeded: 25 vegetables, 100 variants, three Bengaluru demo delivery slots. Prices and images are illustrative.');
}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();await pool.end();}
