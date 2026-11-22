-- Effective-dated buyer contracts and approved per-variant price rules.
BEGIN;
CREATE TABLE customer_contracts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 producer_organization_id uuid NOT NULL REFERENCES organizations(id),
 buyer_organization_id uuid NOT NULL REFERENCES organizations(id),
 kitchen_id uuid REFERENCES kitchens(id),
 contract_code text NOT NULL,
 name text NOT NULL,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ACTIVE','SUSPENDED','EXPIRED')),
 valid_from date NOT NULL,
 valid_to date,
 minimum_order_value_paise bigint NOT NULL DEFAULT 0 CHECK(minimum_order_value_paise>=0),
 delivery_fee_paise bigint NOT NULL DEFAULT 0 CHECK(delivery_fee_paise>=0),
 credit_limit_paise bigint CHECK(credit_limit_paise IS NULL OR credit_limit_paise>=0),
 payment_terms_days integer NOT NULL DEFAULT 0 CHECK(payment_terms_days BETWEEN 0 AND 180),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_by uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(producer_organization_id,contract_code),
 CHECK(valid_to IS NULL OR valid_to>=valid_from),
 CHECK(kitchen_id IS NULL OR kitchen_id IS NOT NULL)
);
CREATE INDEX customer_contract_buyer_idx ON customer_contracts(buyer_organization_id,producer_organization_id,status,valid_from,valid_to);
CREATE TABLE contract_price_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 contract_id uuid NOT NULL REFERENCES customer_contracts(id),
 variant_id uuid NOT NULL REFERENCES product_variants(id),
 kitchen_id uuid REFERENCES kitchens(id),
 price_paise_per_kg bigint NOT NULL CHECK(price_paise_per_kg>=0),
 minimum_grams integer NOT NULL CHECK(minimum_grams>0),
 increment_grams integer NOT NULL CHECK(increment_grams>0),
 effective_from date NOT NULL,
 effective_to date,
 status text NOT NULL DEFAULT 'PROPOSED' CHECK(status IN ('PROPOSED','APPROVED','REJECTED')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_by uuid REFERENCES users(id),
 approved_by uuid REFERENCES users(id),
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(effective_to IS NULL OR effective_to>=effective_from),
 CHECK((status='APPROVED' AND approved_by IS NOT NULL AND approved_at IS NOT NULL) OR status<>'APPROVED')
);
CREATE INDEX contract_price_lookup_idx ON contract_price_rules(contract_id,variant_id,status,effective_from,effective_to);
CREATE INDEX contract_price_kitchen_idx ON contract_price_rules(contract_id,kitchen_id,variant_id,status);
ALTER TABLE orders ADD COLUMN contract_id uuid REFERENCES customer_contracts(id);
ALTER TABLE orders ADD COLUMN contract_version integer;
ALTER TABLE orders ADD COLUMN subtotal_paise bigint NOT NULL DEFAULT 0 CHECK(subtotal_paise>=0);
ALTER TABLE orders ADD COLUMN delivery_fee_paise bigint NOT NULL DEFAULT 0 CHECK(delivery_fee_paise>=0);
ALTER TABLE orders ADD COLUMN total_paise bigint NOT NULL DEFAULT 0 CHECK(total_paise>=0);
ALTER TABLE orders ADD COLUMN pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE order_items ADD COLUMN contract_price_rule_id uuid REFERENCES contract_price_rules(id);
ALTER TABLE order_items ADD COLUMN pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX orders_contract_idx ON orders(contract_id,delivery_date);
COMMIT;
