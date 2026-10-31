-- Location-aware activity audit. Coordinates may be absent when GPS permission is denied.
BEGIN;
CREATE TABLE event_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid REFERENCES organizations(id),
 actor_id uuid REFERENCES users(id),
 event_type text NOT NULL,
 subject_type text NOT NULL,
 subject_id text NOT NULL,
 source text NOT NULL CHECK(source IN ('DEVICE_GPS','DEVICE_NETWORK','ADDRESS_GEOCODE','MANUAL','UNAVAILABLE','SYSTEM')),
 latitude numeric(10,7) CHECK(latitude BETWEEN -90 AND 90),
 longitude numeric(10,7) CHECK(longitude BETWEEN -180 AND 180),
 accuracy_meters numeric(10,2) CHECK(accuracy_meters>=0),
 captured_at timestamptz,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 consent_status text NOT NULL CHECK(consent_status IN ('GRANTED','DENIED','NOT_REQUESTED','NOT_APPLICABLE')),
 unavailable_reason text,
 request_id text,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 CHECK ((latitude IS NULL)=(longitude IS NULL)),
 CHECK ((latitude IS NOT NULL AND source NOT IN ('UNAVAILABLE','SYSTEM')) OR (latitude IS NULL)),
 CHECK(latitude IS NOT NULL OR unavailable_reason IS NOT NULL),
 CHECK(latitude IS NULL OR captured_at IS NOT NULL)
);
CREATE INDEX event_log_subject_idx ON event_log(subject_type, subject_id, occurred_at DESC);
CREATE INDEX event_log_org_time_idx ON event_log(organization_id, occurred_at DESC);
CREATE UNIQUE INDEX event_log_request_dedupe_idx ON event_log(organization_id, request_id) WHERE request_id IS NOT NULL;
COMMIT;
