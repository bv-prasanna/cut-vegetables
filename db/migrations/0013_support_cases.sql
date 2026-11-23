-- Customer support, complaints, shortage and return-request lifecycle.
BEGIN;
CREATE TABLE support_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 case_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 buyer_organization_id uuid NOT NULL REFERENCES organizations(id),
 producer_organization_id uuid NOT NULL REFERENCES organizations(id),
 order_id uuid NOT NULL REFERENCES orders(id),
 kitchen_id uuid NOT NULL REFERENCES kitchens(id),
 category text NOT NULL CHECK(category IN ('QUALITY','SHORTAGE','WRONG_ITEM','LATE_DELIVERY','PACKAGING','BILLING','RETURN_REQUEST','OTHER')),
 description text NOT NULL CHECK(length(trim(description)) BETWEEN 10 AND 4000),
 requested_resolution text CHECK(requested_resolution IS NULL OR length(requested_resolution)<=1000),
 state text NOT NULL DEFAULT 'OPEN' CHECK(state IN ('OPEN','IN_REVIEW','WAITING_CUSTOMER','RESOLVED','REJECTED','CLOSED')),
 resolution_note text CHECK(resolution_note IS NULL OR length(resolution_note)<=2000),
 created_by uuid NOT NULL REFERENCES users(id),
 assigned_to uuid REFERENCES users(id),
 resolved_by uuid REFERENCES users(id),
 resolved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((state IN ('RESOLVED','REJECTED','CLOSED') AND resolved_at IS NOT NULL) OR state NOT IN ('RESOLVED','REJECTED','CLOSED'))
);
CREATE INDEX support_cases_buyer_idx ON support_cases(buyer_organization_id,created_at DESC);
CREATE INDEX support_cases_producer_idx ON support_cases(producer_organization_id,state,created_at DESC);
CREATE INDEX support_cases_order_idx ON support_cases(order_id);
CREATE UNIQUE INDEX support_case_open_duplicate_idx ON support_cases(order_id,category)
 WHERE state IN ('OPEN','IN_REVIEW','WAITING_CUSTOMER');
COMMIT;
