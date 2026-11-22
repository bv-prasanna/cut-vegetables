import type {PoolClient} from 'pg';
export type ContractPricing={
 contract:{id:string;version:number;minimum_order_value_paise:number;delivery_fee_paise:number;credit_limit_paise:number|null;payment_terms_days:number};
 rules:Map<string,{id:string;price_paise_per_kg:number;minimum_grams:number;increment_grams:number;version:number}>
};
export async function loadContractPricing(client:PoolClient,buyerOrganizationId:string,producerOrganizationId:string,kitchenId:string,serviceDate:string,variantIds:string[]):Promise<ContractPricing|null>{
 const c=await client.query("SELECT id,version,minimum_order_value_paise,delivery_fee_paise,credit_limit_paise,payment_terms_days FROM customer_contracts WHERE buyer_organization_id=$1 AND producer_organization_id=$2 AND status='ACTIVE' AND valid_from<=$4::date AND (valid_to IS NULL OR valid_to>=$4::date) AND (kitchen_id IS NULL OR kitchen_id=$3) ORDER BY (kitchen_id IS NOT NULL) DESC,version DESC LIMIT 1 FOR SHARE",[buyerOrganizationId,producerOrganizationId,kitchenId,serviceDate]);
 if(!c.rowCount)return null;
 const r=await client.query("SELECT DISTINCT ON (variant_id) variant_id,id,price_paise_per_kg,minimum_grams,increment_grams,version FROM contract_price_rules WHERE contract_id=$1 AND status='APPROVED' AND variant_id=ANY($2::uuid[]) AND effective_from<=$3::date AND (effective_to IS NULL OR effective_to>=$3::date) AND (kitchen_id IS NULL OR kitchen_id=$4) ORDER BY variant_id,(kitchen_id IS NOT NULL) DESC,version DESC",[c.rows[0].id,variantIds,serviceDate,kitchenId]);
 return {contract:c.rows[0],rules:new Map(r.rows.map((x:any)=>[x.variant_id,x]))};
}
