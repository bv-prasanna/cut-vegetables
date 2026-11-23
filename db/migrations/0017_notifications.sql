BEGIN;
CREATE TABLE notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 recipient_user_id uuid NOT NULL REFERENCES users(id),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 category text NOT NULL CHECK(category IN ('ORDER','DELIVERY','SUPPORT','FINANCE','LOYALTY','SYSTEM')),
 title text NOT NULL CHECK(length(title) BETWEEN 3 AND 160),
 body text NOT NULL CHECK(length(body) BETWEEN 3 AND 1000),
 subject_type text,
 subject_id text,
 dedupe_key text NOT NULL,
 metadata jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 read_at timestamptz,
 UNIQUE(recipient_user_id,dedupe_key)
);
CREATE INDEX notifications_inbox_idx ON notifications(recipient_user_id,created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications(recipient_user_id,created_at DESC) WHERE read_at IS NULL;
CREATE TABLE notification_preferences (
 user_id uuid NOT NULL REFERENCES users(id),
 category text NOT NULL CHECK(category IN ('ORDER','DELIVERY','SUPPORT','FINANCE','LOYALTY','SYSTEM')),
 in_app_enabled boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,category)
);
COMMIT;
