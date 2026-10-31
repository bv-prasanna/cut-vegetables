# FreshPrep PostgreSQL setup and migration gate

Only use a dedicated local/test database initially.

```sh
cd apps/api
# Set DATABASE_URL in the terminal environment
npm run db:migrate
# Set BOOTSTRAP_ORG, BOOTSTRAP_EMAIL and a strong BOOTSTRAP_PASSWORD in terminal environment
npm run db:bootstrap
npm run dev:pg
```

Migration runner uses PostgreSQL advisory lock and SHA-256 checksums, refuses changed already-applied migrations, and runs SQL scripts in filename order. Existing older migrations include transaction boundaries; validate every migration in a disposable database before use.

Bootstrap creates the first SUPERADMIN only once. It is CLI-only. Do not commit credentials. Production release still needs tested login throttling, user invitation/reset, audit coverage, resource-level restrictions and all business workflows.
