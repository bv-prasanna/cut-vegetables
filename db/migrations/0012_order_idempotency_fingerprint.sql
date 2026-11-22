BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS request_fingerprint text;

COMMENT ON COLUMN orders.request_fingerprint IS
  'Canonical order request payload used to reject idempotency-key reuse with different content. Legacy rows remain NULL and cannot be replay-verified.';

COMMIT;
