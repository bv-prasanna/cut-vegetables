# FreshPrep production quality baseline

## User roles / separation of duties
SUPERADMIN, ADMIN, SALES, CUSTOMER_ADMIN, CUSTOMER_BUYER, CUSTOMER_VIEWER, PROCUREMENT, STORE, OPERATOR, PRODUCTION_SUPERVISOR, QC, PACKER, DISPATCH, DRIVER, FINANCE, MARKETING, AUDITOR.

Every user can have one or more verified roles, always scoped to an organization and assigned delivery/kitchen resources. Driver must see only assigned routes. Customer users must see only their own account and authorized kitchens. QC cannot create self-approved production completion without separate policy. Finance has ledger adjustment rights, not catalogue administration.

## Coverage gates (targets, not current measured results)
- 90%+ lines and 85%+ branches in the core domain/order/slot/recurrence/pricing/loyalty modules; 80%+ global lines.
- Cover invalid data, exact cutoff boundaries, timezone, holidays, paused schedules, idempotency, double booking, pricing changes, parallel redemptions, inventory movements and cross-tenant access.
- API integration tests with real isolated PostgreSQL and migration verification.
- Real browser smoke and E2E tests for customer, buyer, operator, packer, QC, driver, admin, sales, finance.
- Security tests for authorization, object ownership (IDOR), brute force, SSRF via images/URLs, injection, rate limiting, upload validation, tampering and auditing.
- Accessibility, mobile keyboard behaviour, offline/poor network, and delivery location-permission denial.
- No merge if compilation/tests fail; never count tests as passed unless executed.

## Current limitations
This repository remains a developer prototype: in-memory ordering, no verified authenticated identities, no transaction-safe SQL order path, no production UI or mobile release. Coverage is not currently measured. Unit test additions alone do not establish production readiness.
