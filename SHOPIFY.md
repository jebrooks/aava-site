# Shopify implementation runbook

This runbook covers Shopify provisioning, integrations, and catalog migration. For routine edits,
use [Content management](docs/content-management.md); for PR review, environment scoping, and
release procedures, use [Deployments](docs/deployments.md). Setup steps below are for initial
provisioning or deliberate repairs, not a checklist to rerun against an operating store.

## 1. Create the Shopify resources

1. Create the Shopify store and complete legal business, payout, tax, notification, refund, and
   policy settings.
2. Add the Arlington fulfillment location and configure Shopify local delivery for the approved
   Northern Virginia ZIP codes and fees. Do not enable conventional shipping or pickup for the
   initial charcuterie catalog.
3. Create a manual collection with handle `charcuterie`. Record its GraphQL ID.
4. Create a custom storefront/publication and a Storefront API token with product, inventory, and
   cart access. Record the publication GraphQL ID.
5. Create a Dev Dashboard Admin API app with the minimum scopes needed for products, inventory,
   locations, publications, metaobject definitions, metaobjects, draft orders, and webhook
   subscriptions. The application exchanges its Client ID and secret for a cached 24-hour Admin
   token automatically.
6. Put the IDs and tokens into `.env` locally and Vercel’s encrypted environment variables for
   **both Preview and Production**. A Production-only variable is unavailable to PR previews.
   Redeploy each affected environment after changing variables. Never commit `.env`. Configure
   GitHub Actions credentials separately; see the catalog parity gate below.

The complete variable contract and a one-line schedule example are in `.env.example`.

## 2. Configure catalog metadata and delivery rules

Serving counts use `custom.serving_count` on products (single size) or variants (multiple sizes),
with Storefront `PUBLIC_READ` access on both definitions. Maintain counts as fields, not in names
or descriptions. For the staged snapshot → populate fields → deploy → clean copy workflow, see
[Serving sizes](docs/content-management.md#serving-sizes). Do not remove serving copy before the
field-aware site is deployed, and do not rerun the catalog importer for this maintenance.

Create a real `DELIVERY_SCHEDULE_JSON` using approved ZIP codes, selectable windows, lead time,
and horizon. Manage closures in `booking_blackouts/default`, not this environment fallback.
Weekday keys use Sunday `0` through Saturday `6`; times use 24-hour `HH:mm`.
Delivery windows have no daily or per-window capacity limit.

```sh
npm run shopify:setup
```

This initial setup creates or updates `delivery_schedule/default` and product metafield definitions.
It overwrites an existing schedule with environment values; do not rerun it with stale defaults.
Staff subsequently edit the schedule metaobject in Shopify Admin. Create the tour schedule and
shared blackout entry as described in the [content guide](docs/content-management.md).

Availability and checkout validate ZIP, schedule, lead time, horizon, and Shopify's shared blackouts
directly. Customers choose a date in the cart calendar, then a time in the select box. Choosing the time
saves the window immediately without a reservation button. The chosen delivery date/window/timezone is stored as cart metadata and visible physical
board line properties in Shopify checkout and orders. Delivery does not consume inventory or need generated products or a cron job.
The legacy `daily_capacity` metaobject field is ignored and no longer provisioned on new stores.

Deploy the reservation-free code to Production **before** retiring old reservation products:

```sh
npm run shopify:retire-delivery                 # Read-only plan, shows configured store/count
npm run shopify:retire-delivery -- --apply      # Verify Production, archive old reservation products
```

Use `--site=https://your-production-host` if the primary host changes. The guard requires eligible
windows with no variant IDs and the shared-blackout marker. If all windows are closed, wait until
an eligible window exists rather than bypassing the guard. Archiving preserves orders, variant
IDs, and inventory history. Saved carts are migrated when choosing a window or checking out;
already-open Shopify checkouts are left untouched. Do not delete old products or reset inventory.

## 3. Normalize and import the Squarespace catalog

Store exports under `migration-private/`; that directory and common export filenames are ignored
by Git. First normalize the Squarespace product CSV:

```sh
npm run shopify:normalize -- migration-private/squarespace-products.csv \
  migration-private/charcuterie.normalized.json
```

Review every normalized product before import. Confirm that only active charcuterie products are
present and correct option names, handles, prices, SKUs, image URLs, inventory, categories,
allergens, serving counts, and legacy URLs. The normalizer cannot infer ambiguous business data.
By default it excludes hidden products, titles marked `(former)`, obvious test products, and
Squarespace gift certificates. Use `--include-former` or `--include-tests` only for an intentional
archive import. Products whose Squarespace stock is `Unlimited` remain inventory-untracked. Recreate gift certificates
as native Shopify gift cards instead of ordinary shippable catalog products.

Run the importer without `--apply` first:

```sh
npm run shopify:import -- migration-private/charcuterie.normalized.json
npm run shopify:import -- migration-private/charcuterie.normalized.json --apply
```

The importer upserts by handle, attaches products to the charcuterie collection, denies oversell,
sets inventory at the configured location, and publishes to the custom storefront. Re-running it
is intentional but resets imported product inventory to the reviewed file, so do not re-run it
after live sales without a fresh reconciliation.

## 4. Forms, webhooks, and gift cards

- Custom-board requests use Vercel BotID Basic, explicitly selected in both browser and API code.
  No Cloudflare widget or keys are needed. Vercel handles the challenge routes automatically.
  Keep Vercel OIDC enabled in the project settings so the server can authenticate BotID checks.
  Redeploy after installing the integration, then verify a browser submission creates a draft
  order and a direct POST without a browser challenge is rejected. Check BotID results in the
  project's Firewall traffic view. Verification failures block draft creation.
  Local `npm run dev` uses the SDK's development behavior (allows humans without a live check);
  production protection must be tested on a Vercel deployment, including Preview.
  Run `npm run test:forms` for API regression tests with simulated verification results and drafts.
- Add a Vercel Firewall rate-limit rule for `/api/custom-board-request` (five requests per ten
  minutes per IP). The application includes a best-effort instance-local limiter, but serverless
  instances do not share that memory.
- Register the Shopify topics needed for operational visibility—product/inventory changes, paid
  orders, cancellations, and refunds—against `https://DOMAIN/api/shopify/webhooks`. Use the custom
  app client secret as `SHOPIFY_WEBHOOK_SECRET` and verify test deliveries in Vercel logs.
- Configure a Shopify Flow or staff order view for the `custom-board-request` and `needs-quote`
  draft-order tags. Staff must price the draft, record the agreed delivery date and window, and send the
  invoice from Shopify Admin.
- Enable a native Shopify gift-card product, include it in the charcuterie collection, and publish
  it to the Headless storefront. `/gift-certificates` redirects to the first native gift card in
  collection order; no product-type or tag conventions are required. Amounts, copy, and images
  stay in Shopify. Customers can select Send as a gift on the Astro product page to specify a
  recipient email, optional name/message, and a send date up to 90 days ahead. The cart carries
  Shopify’s native recipient properties through checkout. Shopify’s Online Store theme settings
  do not configure this custom form. Verify that New gift card and Gift card receipt notification
  templates support recipients, then verify paid issuance and scheduled delivery with an approved
  end-to-end test. Gift-card-only carts skip delivery scheduling; cart edits and checkout remove
  delivery metadata and any legacy reservation lines when no physical products remain. An already-open
  checkout is preserved and the site saves the replacement cart ID. See the
  [content guide](docs/content-management.md#gift-cards) for maintenance and fallback behavior.
- Export outstanding Squarespace gift-certificate liabilities, verify each balance, issue an
  equivalent Shopify replacement, and retain the confidential crosswalk outside Git. Finance or
  the business owner must approve the reconciliation before Squarespace redemption is disabled.

## 5. Verification and cutover

### GitHub catalog parity gate

The `Catalog parity` GitHub Actions workflow builds each pull request, queries every Storefront-visible
product in the configured Shopify collection, renders `/charcuterie-menu`, and compares the exact
product handles. Configure these repository values under **Settings → Secrets and variables →
Actions**:

- Secret: `SHOPIFY_STOREFRONT_ACCESS_TOKEN`
- Variables: `PUBLIC_SHOPIFY_STORE_DOMAIN`, `SHOPIFY_API_VERSION`, and
  `SHOPIFY_CHARCUTERIE_COLLECTION_HANDLE`

Run the same check locally with `npm run check:catalog`.

After the workflow has completed once, create an active ruleset under **Settings → Rules →
Rulesets** targeting the default branch. Require a pull request and the `Catalog parity` status
check before merging. Vercel production deployments should continue to track only `main`.

1. Run `npm run build`, deploy a Vercel preview, and use Shopify test mode.
2. Reconcile product/variant/image/SKU/price/inventory counts against the approved export.
3. Test eligible and rejected ZIP codes, lead-time boundaries, blackout dates, every delivery
   window, the final unit of slot inventory, regular inventory, discounts, taxes, email, refunds,
   cancellations, and intentional restocking.
4. Submit a custom request, edit its draft order, reserve inventory, send the invoice, and pay it.
5. Buy and redeem a new gift card, then test every legacy replacement case.
6. Crawl Squarespace and the preview domain, add redirects for all renamed/retired routes, and
   validate the dynamic sitemap.
7. Complete a low-value live payment before DNS cutover. Keep Squarespace reachable on a legacy
   hostname for the agreed 30-day rollback and reconciliation window.
