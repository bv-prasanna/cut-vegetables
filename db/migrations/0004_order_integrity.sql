-- Strengthen order invariants. The application must still enforce capacity
-- and cutoffs in serializable/locked transactions before public deployment.
BEGIN;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS orders_org_idempotency_uniq ON orders(organization_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
ALTER TABLE orders ADD CONSTRAINT order_source_occurrence_unique UNIQUE(source_schedule_id,delivery_date,slot_id);
ALTER TABLE slot_reservations ADD CONSTRAINT slot_reservation_order_unique UNIQUE(order_id);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS line_total_paise bigint NOT NULL DEFAULT 0 CHECK(line_total_paise>=0);
CREATE INDEX IF NOT EXISTS orders_org_date_idx ON orders(organization_id,delivery_date);
COMMIT;
