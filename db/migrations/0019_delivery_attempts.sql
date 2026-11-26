BEGIN;
CREATE TABLE delivery_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 stop_id uuid NOT NULL REFERENCES delivery_stops(id),
 attempt_number integer NOT NULL CHECK(attempt_number>0),
 outcome text NOT NULL CHECK(outcome IN ('FAILED','PARTIAL')),
 reason_code text NOT NULL CHECK(reason_code IN ('CUSTOMER_UNAVAILABLE','ADDRESS_NOT_FOUND','ACCESS_BLOCKED','VEHICLE_ISSUE','ITEM_SHORTAGE','CUSTOMER_REFUSED','OTHER')),
 notes text NOT NULL CHECK(length(trim(notes))>=5),
 delivered_grams bigint NOT NULL DEFAULT 0 CHECK(delivered_grams>=0),
 recorded_by uuid NOT NULL REFERENCES users(id),
 event_id uuid NOT NULL REFERENCES event_log(id),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(stop_id,attempt_number),
 CHECK((outcome='FAILED' AND delivered_grams=0) OR (outcome='PARTIAL' AND delivered_grams>0))
);
CREATE INDEX delivery_attempts_stop_idx ON delivery_attempts(stop_id,attempt_number DESC);
COMMIT;
