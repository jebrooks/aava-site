# Squarespace migration notes

Original source audit: 2026-08-08. Implementation notes reconciled: 2026-11-21.

Use [Content management](docs/content-management.md) for routine edits and
[Deployments](docs/deployments.md) for PR previews and releases. This document tracks migration
history and cutover verification; code coverage alone does not establish live service readiness.

## What is complete

- Rebuilt responsive header, mobile navigation, announcement bar, footer, and brand design system.
- Localized the selected Squarespace CDN images so the new content pages have no CDN dependency.
- Recreated the homepage and all top-level navigation pages as local Astro routes.
- Added page titles, descriptions, canonical URLs, social metadata, structured business data,
  robots rules, sitemap, keyboard focus styles, reduced-motion support, and a 404 page.
- Replaced the initial contact email fallback with server-side Resend delivery for contact and
  inquiry forms. Custom-board requests now email the business with Vercel BotID protection;
  staff review the request before manually preparing a Shopify invoice.
- Began with a hosting-neutral static build, then adopted the Vercel adapter for trusted commerce
  endpoints and server-rendered Shopify routes.
- Added a headless Shopify storefront, cart proxy, Vercel server runtime, delivery-slot inventory,
  custom-board draft orders, webhook verification, and catalog migration tooling. Automatic
  custom-board draft creation was replaced by request email and a staff invoice helper on
  2026-11-21; deployment and inbox verification are tracked in the transactional results.
  Delivery-slot inventory and its daily cron were retired on 2026-11-21; the old reservation products are archived.
  Delivery now uses schedule/blackout validation with no order cap. The cart calendar selects the date and a separate time dropdown saves the
  selected window directly; physical board line properties carry the date/time into Shopify checkout.

## Public-site inventory

The source sitemap contains 124 URLs:

- 79 individual Squarespace Commerce product pages
- 13 store and category routes
- Primary marketing pages and experience content
- Request, signup, contact, and waiver forms
- Policies, FAQs, press, gift, launch, and campaign pages
- A handful of apparent older or duplicate routes that should be reviewed before cutover

The local implementation now covers the public content pages, active-charcuterie commerce,
Shopify-backed public/private tour booking, and custom inquiries. Verify actual store provisioning,
catalog completeness, fulfillment, gift-certificate reconciliation, payments, and DNS separately.

## Current integration boundary

- Marketing, FAQs, policies, waivers, press, booking help, and custom-estimate inquiry pages are local.
- Tour planning on `/experiences` continues to `/booking`; Shopify seat inventory and whole-bus
  bundles enforce availability. There is no separate external tour scheduler in this implementation.
- Products, checkout, orders, and operational settings depend on Shopify; contact, inquiry and
  custom-board request email depends on Resend. The custom-board form does not write to Shopify;
  staff create any quoted invoice manually. These services remain required after Squarespace retirement.
- Policy pages are checked-in snapshots with provenance; displaying a waiver is not a signed-waiver
  collection system. Verify the required consent and operational records before cutover.
- Gift-card navigation opens the native Shopify product, with an inquiry fallback. Purchase,
  redemption, and legacy liabilities still require explicit reconciliation and live verification.
- `legacyUrl()` and `PUBLIC_LEGACY_SITE_URL` are retired. Historical URLs in migration metadata and
  asset download scripts are provenance, not active navigation.

## Verification needed before full cutover

1. **Commerce:** verify store/app configuration, imported products, inventory, taxes, discounts,
   delivery rules, gift cards, payments, and order email against approved business records.
2. **Tours:** verify public/private booking, seat/bus inventory sharing, minimum notice, closures,
   board fulfillment, cancellations, refunds, and existing reservation handling end to end.
3. **Forms and waivers:** verify email recipients, emailed custom requests and staff invoice workflow, consent records,
   spam protection, and any required signed-waiver collection or retention process.
4. **Email marketing:** reconcile newsletter consent and destination lists before retiring old forms.
5. **Content scope:** review every source route for migration, redirect, or retirement. Private-tour
   minimum and tasting-fee policy discrepancies are reconciled to the approved rules: no minimum
   private-tour guest count (maximum 10) and a 48-hour tasting-fee refund cutoff.
6. **Hosting:** verify Vercel variables for **both Preview and Production**, redeploy after changes,
   and confirm production cron security, webhooks, logs, domain assignment, and DNS cutover.

## Recommended cutover sequence

### 1. Export and normalize data

- Export the Squarespace product catalog, variants, SKUs, prices, descriptions, and images.
- Export form submissions, customer/order records, newsletter contacts, and discount/gift data as
  permitted by the selected destination systems.
- Create a route spreadsheet marking each current URL as migrate, redirect, or retire.

### 2. Replace transactions

- Import products into the chosen commerce system and validate delivery-date/time fields.
- Verify the implemented tour booking and custom estimate flows against real business rules.
- Verify contact/request delivery and complete any required newsletter or signed-waiver workflow.
- Crawl local navigation to confirm no required workflow still sends visitors to Squarespace.

### 3. Preserve search and analytics

- Keep current URL slugs wherever practical.
- Add permanent redirects for every retired or renamed path.
- Validate the dynamic `/sitemap.xml` route against the final canonical product routes.
- Add the selected analytics and consent configuration only after reviewing privacy requirements.

### 4. Rehearse the launch

- Deploy to a preview hostname and test desktop/mobile navigation, forms, booking, cart, checkout,
  confirmation emails, refunds/cancellations, gift certificates, and redirects.
- Crawl both the old and preview sites and compare route coverage.
- Lower DNS TTL ahead of the change, preserve a rollback path, and keep Squarespace reachable until
  transactions and redirects have been verified in production.

## Definition of full migration

The Squarespace subscription is safe to retire only when no required link, asset, form, product,
checkout, policy, email, or redirect depends on it and historical data has been exported and
retained according to the business's needs.
