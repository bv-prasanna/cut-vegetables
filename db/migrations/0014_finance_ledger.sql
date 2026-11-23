-- Finance foundation: provisional invoices and an auditable payment-allocation ledger.
-- Tax invoices are intentionally not issued until the producer's GST profile and policy are approved.
BEGIN;
CREATE TABLE finance_invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 invoice_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 producer_organization_id uuid NOT NULL REFERENCES organizations(id),
 buyer_organization_id uuid NOT NULL REFERENCES organizations(id),
 order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
 status text NOT NULL DEFAULT 'PROVISIONAL' CHECK(status IN ('PROVISIONAL','ISSUED','VOID')),
 currency text NOT NULL DEFAULT 'INR' CHECK(currency='INR'),
 subtotal_paise bigint NOT NULL CHECK(subtotal_paise>=0),
 delivery_fee_paise bigint NOT NULL CHECK(delivery_fee_paise>=0),
 discount_paise bigint NOT NULL DEFAULT 0 CHECK(discount_paise>=0),
 tax_paise bigint NOT NULL DEFAULT 0 CHECK(tax_paise>=0),
 total_paise bigint NOT NULL CHECK(total_paise>=0),
 tax_policy_status text NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK(tax_policy_status IN ('PENDING_APPROVAL','APPROVED','NOT_APPLICABLE')),
 snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_by uuid REFERENCES users(id),
 issued_by uuid REFERENCES users(id),
 issued_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(discount_paise<=subtotal_paise),
 CHECK(total_paise=subtotal_paise-discount_paise+delivery_fee_paise+tax_paise),
 CHECK((status='ISSUED' AND issued_by IS NOT NULL AND issued_at IS NOT NULL AND tax_policy_status IN ('APPROVED','NOT_APPLICABLE')) OR status<>'ISSUED')
);
CREATE INDEX finance_invoice_buyer_idx ON finance_invoices(buyer_organization_id,created_at DESC);
CREATE INDEX finance_invoice_producer_idx ON finance_invoices(producer_organization_id,status,created_at DESC);
CREATE TABLE finance_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 receipt_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 producer_organization_id uuid NOT NULL REFERENCES organizations(id),
 buyer_organization_id uuid NOT NULL REFERENCES organizations(id),
 amount_paise bigint NOT NULL CHECK(amount_paise>0),
 currency text NOT NULL DEFAULT 'INR' CHECK(currency='INR'),
 payment_method text NOT NULL CHECK(payment_method IN ('UPI','BANK_TRANSFER','CASH','CHEQUE','CARD','OTHER')),
 reference text,
 received_on date NOT NULL,
 note text,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(producer_organization_id,reference)
);
CREATE INDEX finance_receipt_buyer_idx ON finance_receipts(buyer_organization_id,received_on DESC);
CREATE TABLE finance_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 receipt_id uuid NOT NULL REFERENCES finance_receipts(id),
 invoice_id uuid NOT NULL REFERENCES finance_invoices(id),
 amount_paise bigint NOT NULL CHECK(amount_paise>0),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(receipt_id,invoice_id)
);
CREATE INDEX finance_allocation_invoice_idx ON finance_allocations(invoice_id);
CREATE TABLE finance_credit_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 credit_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 invoice_id uuid NOT NULL REFERENCES finance_invoices(id),
 amount_paise bigint NOT NULL CHECK(amount_paise>0),
 reason text NOT NULL CHECK(length(trim(reason))>=5),
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED','VOID')),
 created_by uuid NOT NULL REFERENCES users(id),
 approved_by uuid REFERENCES users(id),
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((status='APPROVED' AND approved_by IS NOT NULL AND approved_at IS NOT NULL) OR status<>'APPROVED')
);
COMMIT;
