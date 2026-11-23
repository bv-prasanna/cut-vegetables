-- Reversed coupon redemptions stop consuming promotion quota after an eligible order cancellation.
BEGIN;
ALTER TABLE offer_redemptions ADD COLUMN reversed_at timestamptz;
CREATE INDEX offer_redemptions_active_quota_idx ON offer_redemptions(offer_id,buyer_organization_id) WHERE reversed_at IS NULL;
COMMIT;
