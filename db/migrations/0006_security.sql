BEGIN;
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_role_check;
ALTER TABLE memberships ADD CONSTRAINT memberships_role_check CHECK(role IN ('SUPERADMIN','ADMIN','SALES','CUSTOMER_ADMIN','CUSTOMER_BUYER','CUSTOMER_VIEWER','PROCUREMENT','STORE','OPERATOR','PRODUCTION_SUPERVISOR','QC','PACKER','DISPATCH','DRIVER','FINANCE','MARKETING','AUDITOR'));
CREATE TABLE IF NOT EXISTS auth_sessions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES organizations(id),
 token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id,expires_at);
COMMIT;
