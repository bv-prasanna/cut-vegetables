# FreshPrep Veggies — Browser, Mobile, Security and UAT Review

**Review date:** 10 November 2026  
**Branch:** `feat/typescript-platform-foundation` · **Draft PR:** #1

## Evidence actually gathered

- Visually inspected exported full-page Chromium screenshots of desktop marketing (1280 px), responsive mobile marketing (390 px), mobile navigation, business login, admin dashboard, customer catalogue, cutting, procurement, QC and packing workboards. Source: successful Playwright GitHub Actions run `42684406723`, artifact `freshprep-browser-uat-31` (ID `13703249612`).
- Automated Playwright suite exercises marketing, navigation, login errors, admin, customer, driver, procurement, cutting, QC, packing, auditor permissions, workboard date reloading and same-idempotency-key checkout retry under simulated server error. The tests use stubbed browser APIs; **not live hosting and not physical Android UAT**.
- Existing PostgreSQL 16 CI gate verifies schema migrations, bootstrap, 100 illustrative variants, one-off and recurring ordering, role checks, procurement, production, QC, packing, dispatch and assigned-driver delivery.
- Expo mobile TypeScript and unit/negative tests validate physical form fields, catalogue search/subtotals and checkout compatibility/minimum/step/date input.

## UI improvements made in this review

| Surface | Corrective changes |
| --- | --- |
| Public marketing | Responsive accessible hamburger and clear nav targets; no real-booking promise from local demo; daily recurring frequency no longer marks only Mon/Wed/Fri as selected |
| Secure login | Password show/hide, correct UUID validation, removal of spurious 12-character login minimum, safer guidance for unconfigured password recovery |
| Admin overview | Streamlined KPI rows, real analytics, honest empty order-stage state instead of unused role card |
| Role workspaces | Eliminate empty non-admin overview and double sign-out; no unverified 'database connected' label; proper read-only role explanation |
| Work queues | Data automatically follows selected date/role and has truthful loading/empty/errors; success from write isn't reversed by a failed subsequent dashboard refresh |
| Mobile operations | Prevent stale operation tab from submitting wrong workflow, replace typed QC bool with Pass/Reject, suggest batch/stop IDs from actual current queue and validate grams/UUIDs/temperatures/use-by/stop numbers |
| Mobile catalogue | Branded, searchable prepared-variant cards with image fallback, pagination, size/SKU/price, quantities and indicative basket subtotals |
| Checkout | Same idempotency key on an unchanged basket after uncertain network result (web and Expo); guard incompatible kitchen/zone/slot, invalid dates and wrong quantities before submission |

## Screenshot observations and remaining UX constraints

- Desktop marketing is visually coherent and responsive. However demo cards show **raw potatoes, onions, carrots and cabbage** while describing diced/chopped/grated/shredded variants. These pictures are explicitly illustrative and must be replaced by **real photographs of the prepared cuts** before customer UAT signoff.
- User interface contains sample offers, generic claims of hygiene/delivery and provisional slot policies. Client must validate all claims and SKU pricing.
- Staff workboards with empty mock data render professional empty states, but an empty board screenshot cannot validate actual production volume, scrolling, photos, errors under load or touchscreen controls.
- Mobile Expo catalogue implementation has been code-reviewed/typechecked but **not visually inspected on a physical phone**.
- Browser tests include desktop and mobile viewport checks and browser console errors, but are not a complete accessibility audit. Conduct keyboard/screen reader checks and capture actual staging screenshots.

## Automated release gates

1. API/Web TS compilation, unit/negative tests and Vite production build.
2. Expo TS compilation and negative tests.
3. Disposable PostgreSQL 16 bootstrap/migrations and true multirole order-to-delivery integration.
4. Chromium role/page/negative smoke tests, screenshot capture, trace artifacts.

**For the current head**, inspect Actions before marking any gate green. A successful CI build is not an actual hosted customer session.

## Blocking gaps before external customer acceptance

1. Deployed isolated staging with API `VITE_API_BASE_URL` pointing to actual HTTPS backend; configure `EXPO_PUBLIC_API_URL` and exact `ALLOWED_ORIGINS`. Vite local `/api` proxy only exists in dev.
2. Signed UAT APK installed on real Android devices; test keyboard, permission-denied GPS, first login, expiry, long work queues, photography, offline recovery, driver POD.
3. Approved cut-specific SKU photographs, minimum/step/price, packaging/hygiene text, actual Bengaluru service-zone, availability and cutoff rules.
4. Reliable recurring-order trigger, blocked-date escalation and alerts before operational cutoffs. A sleeping free backend cannot be assumed to run jobs on time.
5. Backup/restore rehearsal, staging operational logs, staging RBAC/accounts and measured performance/security/accessibility tests.
6. BRD v3 incomplete modules: finance/GST/invoice/credit/payments, campaign/loyalty, complaints/returns/shortages, secure invitations/password recovery/MFA and advanced packing/route/POD capture.

**UAT gate:** Current code is suitable for internal review once CI passes, **not certified for customer UAT or production**. PR #1 should remain draft until independent P0 acceptance is recorded.
