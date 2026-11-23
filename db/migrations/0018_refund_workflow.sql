BEGIN;
CREATE TABLE refund_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 refund_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 producer_organization_id uuid NOT NULL REFERENCES organizations(id),
 buyer_organization_id uuid NOT NULL REFERENCES organizations(id),
 invoice_id uuid NOT NULL REFERENCES finance_invoices(id),
 support_case_id uuid NOT NULL UNIQUE REFERENCES support_cases(id),
 amount_paise bigint NOT NULL CHECK(amount_paise>0),
 currency text NOT NULL DEFAULT 'INR' CHECK(currency='INR'),
 method text NOT NULL CHECK(method IN ('MANUAL','RAZORPAY','BANK_TRANSFER')),
 status text NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','APPROVED','PROCESSING','REFUNDED','REJECTED','FAILED')),
 reason text NOT NULL CHECK(length(trim(reason))>=5),
 idempotency_key text NOT NULL,
 external_reference text,
 failure_note text,
 requested_by uuid NOT NULL REFERENCES users(id),
 approved_by uuid REFERENCES users(id),
 processed_by uuid REFERENCES users(id),
 refunded_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(producer_organization_id,idempotency_key),
 CHECK((status='APPROVED' AND approved_by IS NOT NULL) OR status<>'APPROVED'),
 CHECK((status='REFUNDED' AND external_reference IS NOT NULL AND refunded_at IS NOT NULL AND processed_by IS NOT NULL) OR status<>'REFUNDED'),
 CHECK((status='FAILED' AND failure_note IS NOT NULL) OR status<>'FAILED')
);
CREATE INDEX refund_requests_producer_idx ON refund_requests(producer_organization_id,status,created_at DESC);
CREATE INDEX refund_requests_buyer_idx ON refund_requests(buyer_organization_id,created_at DESC);
ALTER TABLE support_cases ADD COLUMN resolution_type text CHECK(resolution_type IN ('RESUPPLY','REPLACEMENT','CREDIT_NOTE','REFUND','NO_ACTION'));
COMMIT;
