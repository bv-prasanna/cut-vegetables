BEGIN;
ALTER TABLE hero_slides
 ADD COLUMN eyebrow text NOT NULL DEFAULT 'FRESHPREP',
 ADD COLUMN description text NOT NULL DEFAULT '',
 ADD COLUMN cta_label text,
 ADD COLUMN mobile_image_url text,
 ADD COLUMN audience text NOT NULL DEFAULT 'ALL' CHECK(audience IN ('ALL','CUSTOMERS','ZONE','SEGMENT')),
 ADD COLUMN audience_value text;
ALTER TABLE announcements
 ADD COLUMN audience text NOT NULL DEFAULT 'ALL' CHECK(audience IN ('ALL','CUSTOMERS','ZONE','SEGMENT')),
 ADD COLUMN audience_value text,
 ADD COLUMN priority integer NOT NULL DEFAULT 0,
 ADD COLUMN urgency text NOT NULL DEFAULT 'INFO' CHECK(urgency IN ('INFO','IMPORTANT','CRITICAL'));
CREATE INDEX hero_slides_live_idx ON hero_slides(active,starts_at,ends_at,sort_order);
CREATE INDEX announcements_live_idx ON announcements(active,starts_at,ends_at,priority DESC);
COMMIT;
