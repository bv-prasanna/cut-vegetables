# FreshPrep PostgreSQL

Versioned migrations 0001–0008 underpin the actual PostgreSQL JWT-secured Hono API; the /dev demo app remains separate and must not be exposed publicly.
Schema migrations are tracked by SHA-256 checksums in schema_migrations. Disposable PostgreSQL 16 CI verifies migrations, Super Admin bootstrap, 100 sample cut variants, customer orders and the full procurement-to-delivery workflow.

## Developer setup
Use npm run db:migrate --workspace @freshprep/api and npm run db:bootstrap --workspace @freshprep/api with a secured DATABASE_URL, JWT_SECRET and one-time BOOTSTRAP_* variables. The bootstrap command is intentionally not a public HTTP endpoint.
Sample seed command: npm run db:seed-demo --workspace @freshprep/api, ONLY when NODE_ENV is not production and FRESHPREP_DEMO_DB_SEED=YES_I_WANT_SAMPLE_DATA is explicitly set.

Always maintain isolated dev/test/prod databases and managed backups. Do not run migrations against production data until reviewed and backed up; CI success does not prove cloud backup/restore.
See docs/JWT_DEPLOYMENT.md and docs/RECURRING_ORDERS.md for deployment and operational details.
