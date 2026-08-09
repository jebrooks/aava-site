# Shopify implementation runbook

The application code is ready to connect to a Shopify store. This runbook covers the external
configuration and data that cannot be created safely without the store owner’s credentials and
business records.

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
   Preview and Production. Never commit `.env`.

The complete variable contract and a one-line schedule example are in `.env.example`.

## 2. Configure catalog metadata and delivery rules

Create a real `DELIVERY_SCHEDULE_JSON` using approved ZIP codes, selectable windows, lead time,
shared daily capacity, and blackout dates. Weekday keys use JavaScript numbering: Sunday `0`
through Saturday `6`. Each time must use 24-hour `HH:mm` format. Capacity is the maximum number of
orders across the entire delivery date; the windows do not have separate limits.

With the server-only variables loaded in the shell, run:

```sh
npm run shopify:setup
```

This creates or updates `delivery_schedule/default` in Shopify Admin and creates product metafield
definitions. Staff can subsequently edit the schedule metaobject in Shopify Admin. Existing slot
inventory is never reset automatically because it may already represent paid orders; exceptional
changes to generated dates must be made through Shopify inventory.

Seed hidden slot products locally or after deployment:

```sh
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:4330/api/cron/materialize-delivery
```

Vercel repeats this daily for newly entering dates in the rolling horizon. Every date is a hidden,
zero-price, inventory-tracked variant published only to the custom storefront. The selected window
is stored as cart metadata, while the date variant enforces shared daily capacity. Shopify therefore
rejects a checkout when the final order for that date has already sold. Changing daily capacity in
the schedule metaobject adjusts future inventory by the capacity delta without erasing booked orders.

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
archive import. Products whose Squarespace stock is `Unlimited` remain inventory-untracked because
the hidden delivery-date product enforces the shared daily order limit. Recreate gift certificates
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

- Create a Cloudflare Turnstile widget for both production and preview domains. Configure its site
  and secret keys. Production custom requests fail closed when Turnstile is absent.
- Add a Vercel Firewall rate-limit rule for `/api/custom-board-request` (five requests per ten
  minutes per IP). The application includes a best-effort instance-local limiter, but serverless
  instances do not share that memory.
- Register the Shopify topics needed for operational visibility—product/inventory changes, paid
  orders, cancellations, and refunds—against `https://DOMAIN/api/shopify/webhooks`. Use the custom
  app client secret as `SHOPIFY_WEBHOOK_SECRET` and verify test deliveries in Vercel logs.
- Configure a Shopify Flow or staff order view for the `custom-board-request` and `needs-quote`
  draft-order tags. Staff must price the draft, choose/reserve delivery inventory, and send the
  invoice from Shopify Admin.
- Enable a Shopify gift-card product and include it in the charcuterie collection.
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
