# Database
PostgreSQL 15+ schema baseline; migrations are ordered plain SQL.
Local apply (development database): `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/0001_core.sql` then `0002_marketing.sql`.

**Not yet integrated into the Hono API.** This schema is preparatory, not a functioning persistence layer. Provision separate dev/test databases; do not run unreviewed migrations on production. Add migration tracking, rollback/forward migration policy, integrity tests and secure database access before deployment.
