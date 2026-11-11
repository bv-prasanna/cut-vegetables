# Backend foundation — phase 2 status

## Added
- PostgreSQL DDL for organizations, memberships, kitchens, vegetables, method + size variants, local delivery-slot/cutoff configuration, reservation capacity data, orders and price snapshots, recurring schedules and idempotent occurrences, audit events.
- Marketing schema: hero sliders, announcements, offers, redemptions, loyalty wallet and immutable point ledger.
- Permission policy primitives and initial unit tests.

## Still required (release blockers)
1. Secure authentication/session lifecycle, password hashing, invitation/recovery, authorization middleware and tenant scoping in every endpoint.
2. PostgreSQL connection, Drizzle mappings, migration runner, transaction-safe slot capacity and persistence (current dev API remains in-memory).
3. Scheduler jobs and idempotent recurrence generation with blackout handling.
4. Production/inventory/QC/delivery and finance tables + workflows.
5. Customer/admin application screens, promotions/loyalty engine, API integration.
6. Type checking/test execution, coverage, security test, deployment hardening and backup restoration verification.

Do not expose the existing `/dev` endpoints publicly.
