# FreshPrep approved screenshot — implementation status (29 Oct 2026)

The screenshot supplied by the user is the **visual acceptance reference** for the public website. The React storefront uses a horizontal navigation header, image-led rotating hero, preparation/size cards, recurring-order day picker, delivery-slot cutoff panels, offers/rewards treatment, and benefits/footer. Existing catalogue, cart, standing-order and local operations screens remain accessible through matching top navigation.

## Functional in the local development server
- Hero slider arrows and dots; homepage can load administrator-authored slides and announcements through GET /home/slides and GET /home/announcements.
- Development-only banner and announcement creation/deletion at /dev/admin/slides and /dev/admin/announcements, exposed in Operations Setup.
- Product tiles route to catalogue, configured items can be added to the basket.
- Weekly day selection passed to recurring-order form; customer can create demo recurring schedules (not yet materialized as orders).
- Configured delivery slot cutoff labels shown.
- Local order creation via existing /dev/orders, subject to local demo limitations.

## Release blockers — do not deploy as a business platform
1. Local development API stores everything in memory and has no real auth. /dev routes must never be publicly exposed.
2. The separate PostgreSQL API is not integrated into the web frontend. No customer onboarding, account switcher or full RBAC on the web.
3. Real marketing/promotion CMS, effective-dated campaign rules, coupon redemption, loyalty ledger and full hero asset uploads remain incomplete.
4. Procurement, stock allocation, processing batches, QC, packing, dispatcher, driver, invoice and settlement screen flows remain incomplete.
5. Scheduled recurring-order materialization, transactional cutoffs and slot capacity are incomplete in the local demo.
6. Actual product-specific cutting photos, brand assets, licensing, prices and business claims must be approved before release.
7. Automated build, database migrations, unit/integration/E2E test execution and coverage measurement are **not verified** in this environment.

## Recommended checks locally
```powershell
cd C:\Projects\cut-vegetables
git checkout feat/typescript-platform-foundation
git pull
npm install
npm run typecheck
npm test
npm run build --workspace @freshprep/web
npm run dev
# separate terminal:
npm run dev --workspace @freshprep/web
```

Verify viewport sizes 1440px, 1024px and 390px; then ensure images load and all visible actions operate. No GitHub Actions workflow was triggered.
