# FreshPrep — UAT audit and evidence (9 November 2026)

Repository: bv-prasanna/cut-vegetables; Branch: feat/typescript-platform-foundation; Draft PR #1.
Design baseline: previously approved FreshPrep premium-green website mockup, adapted to BRD v3. The reusable app-skeleton reference was consulted for role-specific navigation, safe API error handling, workflow governance and quality gates. No blanket migrations or mismatched Next.js templates were imported.

## Automated verification already implemented

| Gate | What it verifies |
| --- | --- |
| API and web | TypeScript compilation, API/web unit and negative tests, Vite production build, basic secret-output check |
| Expo mobile | React Native TypeScript, unit and negative tests |
| PostgreSQL 16 | Migrations 0001–0008, Super Admin bootstrap, 100 illustrative variants, JWT membership and role separation, customer/kitchen, checkout, replay, recurrence |
| Physical workflow | Real database procurement supplier, purchase, raw receipt, cutter/yield, QC, packed batch, dispatcher run, assigned driver proof of delivery; forbidden and invalid transitions |
| Analytics | Producer-scoped booked value, future delivery demand, requested cuts, 7-day slots, audit events; 403 for customer access |

Check the latest GitHub Actions run for the branch. These checks are automated integration evidence, NOT physical-device testing, screenshots, regulatory clearance, production deployment or a customer UAT signature.

## UI review by screen

| Screen | Current implementation | Needed before sign-off |
| --- | --- | --- |
| Marketing home | Approved screenshot-inspired green/white storefront and distinct product sections, published demo routes blocked | Visually compare desktop/mobile screenshots and sign off brand claims/graphics |
| Secure login | Professional hero + login card; safe wrong-password, timeout, expired-session and permission messages | Verify with real credentials, email invitation and accessible keyboard navigation |
| Customer catalogue & checkout | Product photo cards/fallback, distinct cut sizes, correct minimum weight increments, kitchen/date/slot, one-off orders | Actual photographed cut for every SKU, prices and service-zone approvals |
| Standing orders | Daily/weekday schedule, pause/resume/skip/cancel, duplicate-safe admin generator | Verified reliable scheduler, holiday rules, blocked-order notifications |
| Admin dashboard | Real future demand, booked order value, top preparations, slot utilisation, exceptions, audit | Check numbers against pilot ledger and operational reports |
| Product master / delivery slots | Secure Super Admin product, price, activation, zones, slot capacity and cutoff UI | Full price approvals, item details, real photo upload, holiday and capacity exceptions |
| Staff and customers | Team roles, onboarding customer organisation/first kitchen | Invites, password recovery, edits/deactivation, multiple kitchens, business approvals |
| Web procurement/cutting/QC/packing/delivery | Role-specific sidebar, initial workboards and stage summaries | Actual floor workflows, QR scans, operator input controls, exception recovery |
| Expo | Secure JWT by default, role-specific task cards, clearer consolidated cutting/packing/driver work | Build and install signed APK; test real Android, GPS permission, phone sizes, offline and touch UX |

## Status, success and negative cases

- Incorrect email/password/organisation: specific invalid credential wording, not 'session expired'.
- Expired/revoked JWT: sign in again; 403: no permission; 409/422: conflict, cutoff, stock or invalid form quantity; 429: retry later; 5xx/network: safe service/connectivity message.
- Never expose SQL, backend paths, stack traces, auth tokens or database internals in UI.
- Success feedback must follow committed response. Empty work queues must say no tasks for chosen role/date; loading state must distinguish pending requests.
- Every actual physical workflow requires a server-verified role and auditable location or explicit unavailable reason; prevent duplicate order/receipt/packing/POD transitions.

## Remaining P0 blockers for external customer UAT

1. Deploy an isolated staging website, API and Neon DB; verify HTTPS, CORS, role credentials, backups/restore and uptime after free-tier sleep.
2. Build/sign an Android APK and test on a real phone with secure API URL, actual role accounts, GPS allowed/denied, app restart and session expiration.
3. Supply *real cut-specific photographs* and approved prices/quantity/packing/handling standards. Seed catalogue photos and prices are demonstrative, not authorised product information.
4. Configure correct Bengaluru pilot service zones, 05:00–08:00 (prior-day 23:00 cutoff) and 14:00–17:00 (same-day 11:00 cutoff) with real capacity and operational fulfilment constraints.
5. Verify an always-available recurrence scheduler before every cutoff (manual operator button alone is insufficient), blocked occurrence escalation and holidays.
6. Perform screenshot and accessibility comparison on desktop/tablet/Android, role-based UAT, two-customer order isolation and physical cutting/packing/delivery trial.
7. Verify app security, operational logs, backups/restore, data retention, real emails for invitations and password reset.

## P1 BRD v3 scope outstanding before production

- GST-approved invoicing, credit terms/limits, receipts, refunds, credit notes, payment reconciliation and finance reporting.
- Contract prices and effective dates, quote approvals, marketing banners and offers, coupon stacking/quotas, immutable loyalty earned/redeemed/reversed ledger, actual notifications.
- Customer order details, reuse/reorder, complaints, shortages, substitutions with approval, returns and traceable financial corrections.
- Cold-chain temperature, label printing, scan-to-pack, full lot recall, supplier quality/grade/cost and production yield reporting.
- Real route maps, failed/partial delivery handling, photo/signature proof, customer-facing tracking, audit export.
- MFA and secure password reset, customer invitations, multi-kitchen editing, external business policy approvals, measured load/coverage and security tests.

## Sign-off

All-green CI means a candidate for PRIVATE CONTROLLED STAGING UAT only. It is not a delivered signed APK, visually inspected page, customer-accepted production build or approved legal/tax handling. Keep PR #1 in draft until documented P0 checks are accepted. Production requires P1 and commercial policy approvals.

See docs/BRD_v3.md, docs/SRS_v3.md, docs/FINAL_UAT_CHECKLIST.md, docs/JWT_DEPLOYMENT.md and docs/RECURRING_ORDERS.md for detailed workflows and steps.
