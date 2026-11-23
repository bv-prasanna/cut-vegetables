-- Offers and loyalty ledger. Program rates are disabled until explicitly configured and approved.
BEGIN;
-- 0002_marketing.sql created a legacy offer_redemptions table for the retired offer model.
-- Preserve its history under an explicit legacy name before creating the buyer/supplier-scoped ledger.
ALTER TABLE offer_redemptions RENAME TO legacy_offer_redemptions;
ALTER TABLE legacy_offer_redemptions RENAME CONSTRAINT offer_redemptions_pkey TO legacy_offer_redemptions_pkey;
ALTER TABLE legacy_offer_redemptions RENAME CONSTRAINT offer_redemptions_order_id_key TO legacy_offer_redemptions_order_id_key;

CREATE TABLE IF NOT EXISTS customer_offers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 producer_organization_id uuid NOT NULL REFERENCES organizations(id),
 code text NOT NULL,
 name text NOT NULL,
 description text,
 discount_type text NOT NULL CHECK(discount_type IN ('FIXED_PAISE','PERCENT_BPS')),
 discount_value bigint NOT NULL CHECK(discount_value>0),
 max_discount_paise bigint CHECK(max_discount_paise IS NULL OR max_discount_paise>0),
 minimum_subtotal_paise bigint NOT NULL DEFAULT 0 CHECK(minimum_subtotal_paise>=0),
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 max_redemptions integer CHECK(max_redemptions IS NULL OR max_redemptions>0),
 per_buyer_limit integer NOT NULL DEFAULT 1 CHECK(per_buyer_limit>0),
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ACTIVE','PAUSED','EXPIRED')),
 stacking_allowed boolean NOT NULL DEFAULT false,
 created_by uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(producer_organization_id,code),
 CHECK(ends_at>starts_at),
 CHECK(discount_type<>'PERCENT_BPS' OR discount_value<=10000)
);
CREATE INDEX IF NOT EXISTS customer_offers_active_idx ON customer_offers(producer_organization_id,status,starts_at,ends_at);
CREATE TABLE IF NOT EXISTS offer_redemptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 offer_id uuid NOT NULL REFERENCES customer_offers(id),
 producer_organization_id uuid NOT NULL REFERENCES organizations(id),
 buyer_organization_id uuid NOT NULL REFERENCES organizations(id),
 order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
 discount_paise bigint NOT NULL CHECK(discount_paise>0),
 redeemed_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(offer_id,order_id)
);
CREATE INDEX IF NOT EXISTS offer_redemptions_buyer_idx ON offer_redemptions(offer_id,buyer_organization_id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promotion_id uuid REFERENCES customer_offers(id);
CREATE TABLE IF NOT EXISTS loyalty_programs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 producer_organization_id uuid NOT NULL UNIQUE REFERENCES organizations(id),
 points_per_100_rupees integer NOT NULL CHECK(points_per_100_rupees>0),
 paise_per_point integer NOT NULL CHECK(paise_per_point>0),
 minimum_redeem_points integer NOT NULL DEFAULT 1 CHECK(minimum_redeem_points>0),
 maximum_discount_bps integer NOT NULL DEFAULT 1000 CHECK(maximum_discount_bps BETWEEN 1 AND 10000),
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ACTIVE','PAUSED')),
 approved_by uuid REFERENCES users(id),
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((status='ACTIVE' AND approved_by IS NOT NULL AND approved_at IS NOT NULL) OR status<>'ACTIVE')
);
CREATE TABLE IF NOT EXISTS loyalty_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 producer_organization_id uuid NOT NULL REFERENCES organizations(id),
 buyer_organization_id uuid NOT NULL REFERENCES organizations(id),
 balance_points bigint NOT NULL DEFAULT 0 CHECK(balance_points>=0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(producer_organization_id,buyer_organization_id)
);
CREATE TABLE IF NOT EXISTS loyalty_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES loyalty_accounts(id),
 entry_type text NOT NULL CHECK(entry_type IN ('EARN','REDEEM','REVERSAL','EXPIRY','ADJUSTMENT')),
 points_delta bigint NOT NULL CHECK(points_delta<>0),
 order_id uuid REFERENCES orders(id),
 idempotency_key text NOT NULL,
 note text,
 created_by uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(account_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS loyalty_ledger_account_idx ON loyalty_ledger(account_id,created_at DESC);
COMMIT;
