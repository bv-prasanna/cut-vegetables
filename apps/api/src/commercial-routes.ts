import {Hono} from 'hono';
import {z} from 'zod';
import type {Pool} from 'pg';
import {canAny,type Role} from './authorization.js';
import {BusinessFailure,inTransaction,recordEvent,systemEvent,respondError} from './ops-db.js';
import {geoEventSchema} from './geo-events.js';
type Env={Variables:{userId:string;organizationId:string;roles:Role[]}};
const uuid=z.string().uuid();
const date=z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/);
const event=geoEventSchema.optional();
const contractInput=z.object({
 buyerOrganizationId:uuid,kitchenId:uuid.optional(),
 contractCode:z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/),
 name:z.string().trim().min(3).max(160),validFrom:date,validTo:date.optional(),
 minimumOrderValuePaise:z.number().int().nonnegative().max(1_000_000_000),
 deliveryFeePaise:z.number().int().nonnegative().max(1_000_000_000),
 creditLimitPaise:z.number().int().nonnegative().max(10_000_000_000).nullable().optional(),
 paymentTermsDays:z.number().int().min(0).max(180).default(0),event
}).refine(v=>!v.validTo||v.validTo>=v.validFrom,{path:['validTo'],message:'Contract end date precedes start date'});
const priceInput=z.object({
 variantId:uuid,kitchenId:uuid.optional(),
 pricePaisePerKg:z.number().int().nonnegative().max(1_000_000_000),
 minimumGrams:z.number().int().positive().max(1_000_000_000),
 incrementGrams:z.number().int().positive().max(1_000_000_000),
 effectiveFrom:date,effectiveTo:date.optional(),event
}).refine(v=>!v.effectiveTo||v.effectiveTo>=v.effectiveFrom,{path:['effectiveTo'],message:'Price end date precedes start date'});
const stateInput=z.object({status:z.enum(['ACTIVE','SUSPENDED','EXPIRED']),event});
function idParam(c:{req:{param:(key:string)=>string}},key:string){const parsed=uuid.safeParse(c.req.param(key));if(!parsed.success)throw new BusinessFailure(400,'Invalid resource ID');return parsed.data;}
function parse<T extends z.ZodTypeAny>(value:unknown,schema:T):z.infer<T>{const result=schema.safeParse(value);if(!result.success)throw new BusinessFailure(400,'Invalid request: '+result.error.issues.map(i=>i.path.join('.')).join(', '));return result.data;}
function overlaps(aFrom:string,aTo:string|null,bFrom:string,bTo:string|null){return aFrom<=(bTo??'9999-12-31')&&bFrom<=(aTo??'9999-12-31');}
async function assertNoApprovedOverlap(tx:any,contractId:string,variantId:string,kitchenId:string|null,from:string,to:string|null,excludeId?:string){
 const q=await tx.query("SELECT id,effective_from::text,effective_to::text FROM contract_price_rules WHERE contract_id=$1 AND variant_id=$2 AND status='APPROVED' AND kitchen_id IS NOT DISTINCT FROM $3 AND ($4::uuid IS NULL OR id<>$4)",[contractId,variantId,kitchenId,excludeId??null]);
 if(q.rows.some((r:any)=>overlaps(r.effective_from,r.effective_to,from,to)))throw new BusinessFailure(409,'An approved price already covers part of this effective date range');
}
export function createCommercialRoutes(pool:Pool){
 const app=new Hono<Env>();
 app.onError((err,c)=>{const e=respondError(err);if(e.status===500)console.error('Commercial API failed',err);return c.json({error:e.message},e.status);});
 app.get('/admin/contracts/customers',async c=>{
  if(!canAny(c.get('roles'),'contracts:read')&&!canAny(c.get('roles'),'contracts:manage')&&!canAny(c.get('roles'),'contracts:propose'))throw new BusinessFailure(403,'Permission denied');
  const q=await pool.query("SELECT org.id AS organization_id,org.name AS organization_name,k.id AS kitchen_id,k.name AS kitchen_name,k.address,k.zone_code FROM kitchens k JOIN organizations org ON org.id=k.organization_id WHERE k.producer_organization_id=$1 AND k.active=true AND org.kind='CUSTOMER' ORDER BY org.name,k.name LIMIT 1000",[c.get('organizationId')]);
  return c.json(q.rows);
 });
 app.get('/admin/contracts',async c=>{
  if(!canAny(c.get('roles'),'contracts:read')&&!canAny(c.get('roles'),'contracts:manage')&&!canAny(c.get('roles'),'contracts:propose'))throw new BusinessFailure(403,'Permission denied');
  const q=await pool.query("SELECT cc.id,cc.contract_code,cc.name,cc.buyer_organization_id,org.name AS buyer_name,cc.kitchen_id,k.name AS kitchen,cc.status,cc.valid_from::text,cc.valid_to::text,cc.minimum_order_value_paise,cc.delivery_fee_paise,cc.credit_limit_paise,cc.payment_terms_days,cc.version,cc.created_at FROM customer_contracts cc JOIN organizations org ON org.id=cc.buyer_organization_id LEFT JOIN kitchens k ON k.id=cc.kitchen_id WHERE cc.producer_organization_id=$1 ORDER BY cc.created_at DESC LIMIT 500",[c.get('organizationId')]);
  return c.json(q.rows);
 });
 app.post('/admin/contracts',async c=>{
  const roles=c.get('roles'),canManage=canAny(roles,'contracts:manage');
  if(!canManage&&!canAny(roles,'contracts:propose'))throw new BusinessFailure(403,'Permission denied');
  const data=parse(await c.req.json().catch(()=>null),contractInput);
  const result=await inTransaction(pool,async tx=>{
   const buyer=await tx.query("SELECT kind FROM organizations WHERE id=$1",[data.buyerOrganizationId]);
   if(!buyer.rowCount||buyer.rows[0].kind!=='CUSTOMER')throw new BusinessFailure(422,'Select an approved customer organisation');
   if(data.kitchenId){
    const kitchen=await tx.query("SELECT id FROM kitchens WHERE id=$1 AND organization_id=$2 AND producer_organization_id=$3",[data.kitchenId,data.buyerOrganizationId,c.get('organizationId')]);
    if(!kitchen.rowCount)throw new BusinessFailure(422,'Kitchen does not belong to this customer and producer');
   }
   const duplicate=await tx.query("SELECT 1 FROM customer_contracts WHERE producer_organization_id=$1 AND contract_code=$2",[c.get('organizationId'),data.contractCode]);
   if(duplicate.rowCount)throw new BusinessFailure(409,'Contract code already exists');
   const inserted=await tx.query("INSERT INTO customer_contracts(producer_organization_id,buyer_organization_id,kitchen_id,contract_code,name,status,valid_from,valid_to,minimum_order_value_paise,delivery_fee_paise,credit_limit_paise,payment_terms_days,created_by) VALUES($1,$2,$3,$4,$5,'DRAFT',$6::date,$7::date,$8,$9,$10,$11,$12) RETURNING id",[c.get('organizationId'),data.buyerOrganizationId,data.kitchenId??null,data.contractCode,data.name,data.validFrom,data.validTo??null,data.minimumOrderValuePaise,data.deliveryFeePaise,data.creditLimitPaise??null,data.paymentTermsDays,c.get('userId')]);
   const id=inserted.rows[0].id;
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),data.event??systemEvent('CUSTOMER_CONTRACT_CREATED','CONTRACT',id),'CUSTOMER_CONTRACT_CREATED','CONTRACT',id);
   return {id,status:'DRAFT'};
  });
  return c.json(result,201);
 });
 app.get('/admin/contracts/:id/prices',async c=>{
  if(!canAny(c.get('roles'),'contracts:read')&&!canAny(c.get('roles'),'contracts:manage')&&!canAny(c.get('roles'),'contracts:propose'))throw new BusinessFailure(403,'Permission denied');
  const id=idParam(c,'id');
  const contract=await pool.query("SELECT id FROM customer_contracts WHERE id=$1 AND producer_organization_id=$2",[id,c.get('organizationId')]);
  if(!contract.rowCount)throw new BusinessFailure(404,'Contract not found');
  const q=await pool.query("SELECT r.id,r.variant_id,pv.sku,v.name AS vegetable,pv.method_code,pv.size_kind,pv.size_number,pv.size_unit,pv.size_label,r.kitchen_id,r.price_paise_per_kg,r.minimum_grams,r.increment_grams,r.effective_from::text,r.effective_to::text,r.status,r.version FROM contract_price_rules r JOIN product_variants pv ON pv.id=r.variant_id JOIN vegetables v ON v.id=pv.vegetable_id WHERE r.contract_id=$1 ORDER BY pv.sku,r.effective_from DESC LIMIT 2000",[id]);
  return c.json(q.rows);
 });
 app.post('/admin/contracts/:id/prices',async c=>{
  const roles=c.get('roles'),canApprove=canAny(roles,'pricing:approve');
  if(!canApprove&&!canAny(roles,'pricing:propose'))throw new BusinessFailure(403,'Permission denied');
  const id=idParam(c,'id'),data=parse(await c.req.json().catch(()=>null),priceInput);
  const result=await inTransaction(pool,async tx=>{
   const contract=await tx.query("SELECT id,buyer_organization_id,kitchen_id,status FROM customer_contracts WHERE id=$1 AND producer_organization_id=$2 FOR UPDATE",[id,c.get('organizationId')]);
   if(!contract.rowCount)throw new BusinessFailure(404,'Contract not found');
   if(!['DRAFT','ACTIVE'].includes(contract.rows[0].status))throw new BusinessFailure(409,'Contract is not editable');
   if(contract.rows[0].kitchen_id&&data.kitchenId&&contract.rows[0].kitchen_id!==data.kitchenId)throw new BusinessFailure(422,'Price kitchen conflicts with contract scope');
   if(data.kitchenId){
    const kitchen=await tx.query("SELECT id FROM kitchens WHERE id=$1 AND organization_id=$2 AND producer_organization_id=$3",[data.kitchenId,contract.rows[0].buyer_organization_id,c.get('organizationId')]);
    if(!kitchen.rowCount)throw new BusinessFailure(422,'Kitchen does not belong to this contract');
   }
   const variant=await tx.query("SELECT id FROM product_variants WHERE id=$1 AND active=true",[data.variantId]);
   if(!variant.rowCount)throw new BusinessFailure(422,'Variant is not active');
   const status=canApprove?'APPROVED':'PROPOSED';
   if(status==='APPROVED')await assertNoApprovedOverlap(tx,id,data.variantId,data.kitchenId??null,data.effectiveFrom,data.effectiveTo??null);
   const inserted=await tx.query("INSERT INTO contract_price_rules(contract_id,variant_id,kitchen_id,price_paise_per_kg,minimum_grams,increment_grams,effective_from,effective_to,status,created_by,approved_by,approved_at) VALUES($1,$2,$3,$4,$5,$6,$7::date,$8::date,$9,$10,$11,CASE WHEN $9='APPROVED' THEN now() ELSE NULL END) RETURNING id",[id,data.variantId,data.kitchenId??contract.rows[0].kitchen_id??null,data.pricePaisePerKg,data.minimumGrams,data.incrementGrams,data.effectiveFrom,data.effectiveTo??null,status,c.get('userId'),canApprove?c.get('userId'):null]);
   const ruleId=inserted.rows[0].id;
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),data.event??systemEvent('CONTRACT_PRICE_RULE_'+status,'PRICE_RULE',ruleId),'CONTRACT_PRICE_RULE_'+status,'PRICE_RULE',ruleId);
   return {id:ruleId,status};
  });
  return c.json(result,201);
 });
 app.patch('/admin/contracts/:id/prices/:ruleId/approve',async c=>{
  if(!canAny(c.get('roles'),'pricing:approve'))throw new BusinessFailure(403,'Only an authorised pricing approver may approve a price');
  const id=idParam(c,'id'),ruleId=idParam(c,'ruleId');
  const result=await inTransaction(pool,async tx=>{
   const contract=await tx.query("SELECT id FROM customer_contracts WHERE id=$1 AND producer_organization_id=$2 FOR UPDATE",[id,c.get('organizationId')]);
   if(!contract.rowCount)throw new BusinessFailure(404,'Contract not found');
   const rule=await tx.query("SELECT id,variant_id,kitchen_id,effective_from::text,effective_to::text,status FROM contract_price_rules WHERE id=$1 AND contract_id=$2 FOR UPDATE",[ruleId,id]);
   if(!rule.rowCount)throw new BusinessFailure(404,'Price rule not found');
   if(rule.rows[0].status!=='PROPOSED')throw new BusinessFailure(409,'Only proposed price rules can be approved');
   await assertNoApprovedOverlap(tx,id,rule.rows[0].variant_id,rule.rows[0].kitchen_id,rule.rows[0].effective_from,rule.rows[0].effective_to,ruleId);
   await tx.query("UPDATE contract_price_rules SET status='APPROVED',approved_by=$2,approved_at=now() WHERE id=$1",[ruleId,c.get('userId')]);
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),systemEvent('CONTRACT_PRICE_RULE_APPROVED','PRICE_RULE',ruleId),'CONTRACT_PRICE_RULE_APPROVED','PRICE_RULE',ruleId);
   return {id:ruleId,status:'APPROVED'};
  });
  return c.json(result);
 });
 app.patch('/admin/contracts/:id/status',async c=>{
  if(!canAny(c.get('roles'),'contracts:manage'))throw new BusinessFailure(403,'Only contract administrators may change contract status');
  const id=idParam(c,'id'),data=parse(await c.req.json().catch(()=>null),stateInput);
  const result=await inTransaction(pool,async tx=>{
   const contract=await tx.query("SELECT id,status FROM customer_contracts WHERE id=$1 AND producer_organization_id=$2 FOR UPDATE",[id,c.get('organizationId')]);
   if(!contract.rowCount)throw new BusinessFailure(404,'Contract not found');
   if(data.status==='ACTIVE'){
    const other=await tx.query("SELECT 1 FROM customer_contracts WHERE producer_organization_id=$1 AND buyer_organization_id=(SELECT buyer_organization_id FROM customer_contracts WHERE id=$2) AND kitchen_id IS NOT DISTINCT FROM (SELECT kitchen_id FROM customer_contracts WHERE id=$2) AND id<>$2 AND status='ACTIVE' AND valid_from<=COALESCE((SELECT valid_to FROM customer_contracts WHERE id=$2),'9999-12-31'::date) AND COALESCE(valid_to,'9999-12-31'::date)>=(SELECT valid_from FROM customer_contracts WHERE id=$2) LIMIT 1",[c.get('organizationId'),id]);
    if(other.rowCount)throw new BusinessFailure(409,'Another active contract already covers this customer and kitchen date range');
    const rules=await tx.query("SELECT 1 FROM contract_price_rules WHERE contract_id=$1 AND status='APPROVED' LIMIT 1",[id]);
    if(!rules.rowCount)throw new BusinessFailure(409,'Approve at least one price rule before activating this contract');
   }
   await tx.query("UPDATE customer_contracts SET status=$2,version=version+1,updated_at=now() WHERE id=$1",[id,data.status]);
   await recordEvent(tx,c.get('organizationId'),c.get('userId'),data.event??systemEvent('CUSTOMER_CONTRACT_STATUS_CHANGED','CONTRACT',id),'CUSTOMER_CONTRACT_STATUS_CHANGED','CONTRACT',id);
   return {id,status:data.status};
  });
  return c.json(result);
 });
 return app;
}
