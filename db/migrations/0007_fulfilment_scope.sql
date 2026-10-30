-- Supplier/customer separation and recurrent-order exception controls.
-- Upgrade existing environments without destroying data; historic records may remain unassigned.
BEGIN;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'CUSTOMER'
  CHECK (kind IN ('CUSTOMER','PRODUCER'));
ALTER TABLE kitchens ADD COLUMN IF NOT EXISTS producer_organization_id uuid REFERENCES organizations(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS producer_organization_id uuid REFERENCES organizations(id);
ALTER TABLE delivery_runs ADD COLUMN IF NOT EXISTS producer_organization_id uuid REFERENCES organizations(id);
CREATE TABLE IF NOT EXISTS schedule_skips(
 schedule_id uuid NOT NULL REFERENCES recurring_schedules(id) ON DELETE CASCADE,
 delivery_date date NOT NULL,
 reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(schedule_id,delivery_date)
);
CREATE INDEX IF NOT EXISTS orders_producer_date_idx ON orders(producer_organization_id,delivery_date,state);
CREATE INDEX IF NOT EXISTS kitchens_producer_idx ON kitchens(producer_organization_id);
CREATE INDEX IF NOT EXISTS delivery_runs_producer_idx ON delivery_runs(producer_organization_id,delivery_date);
CREATE INDEX IF NOT EXISTS production_batches_order_variant_idx ON production_batches(order_id,variant_id,state);
CREATE INDEX IF NOT EXISTS raw_lots_purchase_idx ON raw_lots(purchase_id);
-- Preserve an immutable created price snapshot and prevent duplicate generated orders.
CREATE UNIQUE INDEX IF NOT EXISTS orders_source_occurrence_idx
  ON orders(source_schedule_id,delivery_date,slot_id) WHERE source_schedule_id IS NOT NULL;
COMMIT;
