# FreshPrep Veggies — Business Requirements Document v3

**Status:** Development baseline, subject to commercial policy sign-off  
**Market:** Bengaluru, India | **Business model:** B2B prepared vegetable supply  
**Technology constraint:** zero-cost-first Node.js + TypeScript; operational and third-party costs may still occur.

## 1. Purpose and business outcomes
Provide reliable, hygienic, batch-traceable vegetable preparation and delivery for restaurants, hotels, PG kitchens, caterers and wedding venues. Reduce buyers' preparation effort, support visual exact cut selection, and enable predictable daily/weekly ordering. Key metrics: reorder rate, on-time-in-full delivery, order accuracy, yield loss, complaint rate, gross margin, average order value, and receivables aging.

## 2. Users and organization
- **Customer company:** owns one or more kitchens, delivery addresses, billing profiles, purchasing users and contract prices.
- **Customer buyer:** browses, configures carts, places one-off and standing orders, sees balances, invoices and rewards within authorization.
- **Sales/support:** manages leads, quotes, onboarding and complaints.
- **Superadmin/admin:** approves master data, service areas, slots, cutoffs, contracts, roles, campaigns and policies.
- **Procurement/store:** purchases raw vegetables, records grades, lot weights, costs, receipts and wastage.
- **Production operator/supervisor:** receives work orders grouped by vegetable/preparation/size; performs cuts, captures actual yield and exceptions.
- **QC/packing:** records hygiene/temperature checks, batch disposition, packed weights, labels, expiry and traceability.
- **Dispatch/driver:** assigns routes, scans packs, delivers, records handover and returns.
- **Finance:** manages invoices, payments, credits, refunds, adjustments and aging.

## 3. Product catalogue
A vegetable is a master item (e.g., Potato / Onion / Carrot). A **sellable variant** is defined by vegetable + preparation method + size + unit + optional processing options. Preparation types include **diced, chopped, sliced, grated, shredded, julienne, peeled**, with future extensibility. **Every method can have multiple sizes**, including numeric dimensions (e.g. 5 mm, 10 mm, 20 mm; thickness, cube edge, strip width) and descriptive grades (fine, medium, coarse). These are independent variants with unique SKU, product photo, description, active status, selling unit, yield expectation, price, minimum quantity, quantity increment and production instruction. Admin controls visibility, image order, cut tolerance, lead time, substitutions and customer eligibility.

Customers select products by tapping the picture of the **actual prepared cut**: e.g. potato diced 10 mm for sagu, onion chopped 20 mm, carrot grated fine. Admin uploads representative real photos and alt text; image accurately reflects dimensions.

## 4. Customer buying journey
Customer logs in, selects company/kitchen and delivery address, views home hero slider and current announcements, filters by vegetable, preparation and size, taps image to inspect detailed photos/price/size, chooses weight, adds items to cart, selects delivery date/slot, verifies cut-off and capacity, optionally applies eligible offers or loyalty points, reviews totals and confirms order. Confirmation records contract price and discount snapshot. Customer sees status, packing details, proof of delivery, invoice, reorder, complaints and wallet ledger.

## 5. Recurring/standing orders
Customer may schedule **daily** or **selected weekdays** (e.g. Mon/Wed/Fri) for an exact basket of preparation-size variants and delivery slot. Support start/end dates, kitchen, skip one occurrence, pause/resume, holiday exclusion, skip rules, exceptional quantities and advance amendments. Generate distinct fulfilment orders per date; avoid duplicates using unique schedule + date + slot occurrence keys. Respect the operational cut-off; changes after cut-off require an explicit authorized exception and are audited. Never silently promise unavailable slots or inventory. Future occurrences use the prevailing authorized pricing policy, while accepted orders keep a price snapshot.

## 6. Delivery slot and cut-off master
Admin defines per-zone delivery window, e.g. **05:00–08:00 with prior-day 23:00 cut-off**, and **14:00–17:00 with same-day 11:00 cut-off**. Every slot has active dates, timezone Asia/Kolkata, cutoff day-offset and local cutoff time, order/weight/route capacity, max orders, service areas, lead time, holidays, blackout windows and exception approval rules. Availability is recomputed server-side at confirmation; customers see next valid options when a deadline or capacity is missed. Boundary at exact cutoff is closed, not open.

## 7. Marketing and customer engagement
- **Hero slider CMS:** admin creates image/mobile variants, alt text, heading, CTA, target, priority/order, schedule and audience (all/customers/zone/segment). Inactive/expired banners do not display.
- **Promotions and announcements:** placement, urgency, expiry, audience, publication control and archive. Important operational notices must not depend solely on banners.
- **Offers/coupons:** fixed/percentage/cart/item/volume/first order/customer-targeted offers; date, quota, minimum cart, maximum discount, per-customer usage, stacking exclusions, credit/contract restrictions and eligibility. No negative totals or double-discounts.
- **Loyalty points:** configurable earning, redemption conversion, expiry, caps, excluded SKUs/customer contracts; immutable ledger with award, redeem, reversal and adjustment entries. Earn only after qualifying fulfilment/settlement; reverse on refund/return; prevention of double redemption and unauthorized manual adjustment.
- **Notifications:** order accepted/changed/packed/dispatch/delivered, schedule anomalies, cutoff reminders, payment alerts and campaign opt-in, via free/low-cost eligible in-app/email mechanisms with delivery status and consent controls.

## 8. Operations and finance
Procurement receipts retain supplier, grade, quantity, cost, quality and raw-material lot. Production planning aggregates confirmed orders by vegetable/preparation/size and time window, models expected yields and allocates stock. Capture actual input, usable output, trim waste and QC disposition. Label each packed batch with lot references, variant, packed quantity, packed-on/use-by and handling instructions. Refrigerated holding and delivery controls must be specified and verified operationally. Dispatch routes support manifests, status, proof of delivery, shortages, substitutions (only with approval), returns and complaints. Finance supports B2B credit terms, payment reference, credit limit, invoice/credit-note lifecycle, GST configurations reviewed by a professional, and reconciliation.

## 9. Business rules and risk controls
Customer contract overrides must be authorized and effective-dated. Never bill based on an unsaved catalog price. Restrict production to confirmed orders and approved exceptions; reserve/allocate inventory transactionally. Maintain audit history for sensitive changes to prices, rewards, cutoffs, approval, adjustments and refunds. Provide recall queries from raw lot through production batch to deliveries. Exception dashboards: delayed procurement, capacity shortfall, QC failed, undelivered, missing POD, overdue collections and failed recurring occurrence.

## 10. Reporting and administration
Reports by customer, kitchen, region, item/variant, preparation and size, slot, delivery performance, revenue, discount, points liability, wastage, yield, contribution margin, sales rep, aging, complaints and supplier quality. Admin supports role-permission matrix with explicit view/create/edit/approve actions and server-enforced separation of duties.

## 11. Release sequencing and acceptance
1. Secure tenants, role matrix, master catalogue, photographed variants and customer accounts.
2. Verified cutoffs/capacity and idempotent one-off and recurring orders.
3. Procurement, batches, QC, packing, delivery and invoice chain.
4. Campaign/offer/loyalty controls and finance reporting.
5. Full customer/admin UX, negative/security tests, backup/restore and live pilot.

**Go-live criteria:** no unauthenticated admin actions; no duplicate recurrence orders; exact cutoff closures; correct variant sizing; safe weight and inventory ledger; delivery traceability; authenticated financial adjustment; working backup/restore; acceptable on-time and yield pilot metrics.

## 12. Pending business approvals
Confirm launch service zones, actual cut-size tolerances, product prices and effective dates, minimum quantities, substitutions, billing/GST rules, credit policy, delivery charges, schedule notice period, blackout/holiday policy, promotion stacking, loyalty rate/expiry, customer acceptance and return/dispute timelines.
