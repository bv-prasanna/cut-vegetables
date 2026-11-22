-- Quote request, proposal and acceptance lifecycle with immutable commercial snapshots.
BEGIN;
CREATE TABLE quotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 quote_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 buyer_organization_id uuid NOT NULL REFERENCES organizations(id),
 producer_organization_id uuid NOT NULL REFERENCES organizations(id),
 kitchen_id uuid NOT NULL REFERENCES kitchens(id),
 slot_id uuid NOT NULL REFERENCES delivery_slots(id),
 delivery_date date NOT NULL,
 contract_id uuid NOT NULL REFERENCES customer_contracts(id),
 contract_version integer NOT NULL,
 state text NOT NULL DEFAULT 'REQUESTED' CHECK(state IN ('REQUESTED','PROPOSED','ACCEPTED','REJECTED','EXPIRED','CANCELLED')),
 valid_until timestamptz NOT NULL,
 subtotal_paise bigint NOT NULL CHECK(subtotal_paise>=0),
 delivery_fee_paise bigint NOT NULL CHECK(delivery_fee_paise>=0),
 discount_paise bigint NOT NULL DEFAULT 0 CHECK(discount_paise>=0),
 total_paise bigint NOT NULL CHECK(total_paise>=0),
 request_fingerprint text NOT NULL,
 idempotency_key text NOT NULL,
 note text,
 created_by uuid REFERENCES users(id),
 responded_by uuid REFERENCES users(id),
 accepted_order_id uuid UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(buyer_organization_id,idempotency_key),
 CHECK(discount_paise<=subtotal_paise),
 CHECK(total_paise=subtotal_paise-discount_paise+delivery_fee_paise)
);
CREATE INDEX quotes_buyer_idx ON quotes(buyer_organization_id,created_at DESC);
CREATE INDEX quotes_producer_state_idx ON quotes(producer_organization_id,state,created_at DESC);
CREATE TABLE quote_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE RESTRICT,
 variant_id uuid NOT NULL REFERENCES product_variants(id),
 grams integer NOT NULL CHECK(grams>0),
 contract_price_rule_id uuid NOT NULL REFERENCES contract_price_rules(id),
 price_paise_per_kg bigint NOT NULL CHECK(price_paise_per_kg>=0),
 line_total_paise bigint NOT NULL CHECK(line_total_paise>=0),
 pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 UNIQUE(quote_id,variant_id)
);
ALTER TABLE orders ADD COLUMN quote_id uuid UNIQUE REFERENCES quotes(id);
ALTER TABLE orders ADD COLUMN discount_paise bigint NOT NULL DEFAULT 0 CHECK(discount_paise>=0);
ALTER TABLE quotes ADD CONSTRAINT quotes_accepted_order_fk FOREIGN KEY(accepted_order_id) REFERENCES orders(id);
COMMIT;
