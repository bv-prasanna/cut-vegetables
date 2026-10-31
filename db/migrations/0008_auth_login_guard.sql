-- Persistent login throttling for the JWT-backed API. Requires PostgreSQL.
BEGIN;
CREATE TABLE IF NOT EXISTS auth_login_attempts(
 scope_hash text PRIMARY KEY,
 failures integer NOT NULL DEFAULT 0 CHECK(failures>=0),
 window_started timestamptz NOT NULL DEFAULT now(),
 locked_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_login_attempts_updated_idx ON auth_login_attempts(updated_at);
COMMIT;
