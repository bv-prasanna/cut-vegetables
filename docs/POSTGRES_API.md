# PostgreSQL-backed API vertical slice (not yet production ready)

Run migrations 0001–0006 in order against a disposable local Postgres database. Configure DATABASE_URL and start with `npm run dev:pg --workspace @freshprep/api`. The old /dev UI still runs on a separate in-memory API on port 3000 and is NOT connected to this API.

Supported paths: POST /auth/login, POST /v1/logout, GET /v1/me, GET /v1/catalog, GET /v1/orders, POST /v1/orders.

To use authentication, insert an organization/user/membership with an appropriately scrypt-hashed password from the security module using a controlled seed script; no open public sign-up/bootstrap endpoint is provided. API sessions are hashed in PostgreSQL, expire after 12 hours, and have revocation support.

POST /v1/orders requires idempotencyKey, kitchenId, slotId, deliveryDate, items and an event payload validated against geoEventSchema (ORDER_CREATED). It locks the selected slot row, checks cutoff in Asia/Kolkata, zone, blackout and capacity, snapshots variant prices, reserves the slot, writes the order and geo event in a transaction.

Known limitations: login rate limiting is not yet present, no password reset/rotation, role scope beyond organization is not granular, full production transactions and inventory workflows are not connected, events on failures are not persisted, recurring order workers are absent, integration tests against real PostgreSQL have not been run, and event consent/location practices require operational review. No deployment allowed until all security/quality gates pass.
