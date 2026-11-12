# All ABoard VA website

A headless Astro rebuild of the public All ABoard VA Squarespace site. Marketing content and the
branded charcuterie storefront live in Astro; Shopify owns products, inventory, carts, checkout,
payments, gift cards, draft-order invoices, and orders. The production runtime targets Vercel.

## Get started

Prerequisite: Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

The local URL is fixed at `http://127.0.0.1:4330`.

Run the production checks and Vercel build output with:

```sh
npm run build
```

Run the build-your-own selection validation tests with `npm run test:boards`.

Use `npm run dev` for local route testing; the Vercel adapter does not provide a portable
standalone preview server.

## Deployment contract

The project uses the Astro Vercel adapter because Shopify Admin API calls, delivery scheduling,
webhook verification, and custom-order requests require trusted server-side code.

- Install command: `npm ci`
- Build command: `npm run build`
- Framework preset: Astro
- Required runtime: Vercel Functions
- Scheduled task: `/api/cron/materialize-delivery` daily at 05:15 UTC

Marketing pages can still be prerendered later, but the catalog, product pages, cart API, dynamic
sitemap, and server integrations require the configured adapter.

## Environment variables

Copy `.env.example` to `.env` for local overrides.

- `PUBLIC_LEGACY_SITE_URL` points temporary booking, checkout, product, and policy links to the
  current Squarespace site during the staged migration.
- `PUBLIC_CONTACT_FORM_ENDPOINT` connects the contact form to a hosted form endpoint. Without it,
  the form opens a pre-filled message in the visitor's email application.
- The server-side Shopify Storefront token powers catalog and cart operations.
- The Shopify Admin token, webhook secret, cron secret, location/publication IDs, and Turnstile
  secret are server-only.

Never store API keys, payment credentials, or private form secrets in a `PUBLIC_` variable. Public
variables are included in browser-delivered files.

Copy `.env.example` to `.env`, then follow [SHOPIFY.md](./SHOPIFY.md) to create the Shopify custom
app, catalog collection, delivery schedule, migration exports, webhooks, and Vercel variables.

## Project structure

```text
public/
  images/              Localized brand and content assets
scripts/
  assets.curl          Reproducible public asset download manifest
  fetch-assets.sh      Asset refresh helper
src/
  components/          Shared header, footer, buttons, and page hero
  data/site.ts         Contact details, navigation, products, legacy URL helper
  lib/shopify/         Storefront/Admin clients, carts, scheduling, and draft orders
  layouts/             SEO and document shell
  pages/               File-based content, commerce, and API routes
  styles/global.css    Brand tokens and responsive design system
```

## Current migration boundary

The homepage and the five primary content routes are local:

- `/`
- `/experiences`
- `/charcuterie`
- `/experience-guide`
- `/about`
- `/contact`

The codebase now includes Shopify-backed catalog/product routes, a local cart, scheduled-delivery
selection, hosted checkout handoff, gift-card product support, and draft-order custom requests.
Until Shopify credentials and migrated products are supplied, the existing board showcase falls
back to Squarespace links. Tours, waivers, policies, and some utility content remain on Squarespace.
See [MIGRATION.md](./MIGRATION.md) for cutover status and [shopify-plan.md](./shopify-plan.md) for the
agreed architecture.

## Updating content

- Manage announcements in **Shopify Admin → Content → Metaobjects → Announcement banner**.
  Each entry has a **Name** for identification, **Content** with Shopify's rich-text editor,
  an enabled switch, and optional start/end dates. Format Content with bold, italics, and links
  anywhere in the text; the Name is not displayed. There are no separate link label/URL fields.
  Both dates are inclusive in Eastern Time (`America/New_York`); blank dates have no limit.
  Reversed dates hide the entry. When entries overlap, latest start date wins (undated entries
  have lowest priority), then latest edit, then alphabetical handle order.
  Changes appear on new page loads within about a minute without redeploying. Run
  `npm run shopify:setup-announcement` to create or migrate the definition; existing messages
  and links become rich text before the old link fields are removed. Existing rich content is
  preserved. Missing, disabled, invalid, or unavailable configured content hides the banner.
  Local development without Admin credentials uses a sample announcement.
  Run `npm run test:announcement` for scheduling and safe rich-text rendering tests.
- Shared company details and legacy integration URLs live in `src/data/site.ts`.
- Page copy lives in the matching file under `src/pages/`.
- Brand colors, typography, and layout rules live in `src/styles/global.css`.
- Build-your-own ingredient lists and size limits live in `src/data/board-customizations.json`.
  Update that file and redeploy to change the available selections. Each board's choices are
  validated by the cart API and stored as Shopify cart-line attributes for checkout and fulfillment.
  Small allows up to 2 cheeses and 1 meat, or 3 cheeses without meat; Large allows up to 3 cheeses
  and 2 meats, or 5 cheeses without meat. Both allow up to 5 accompaniments. Customers must choose
  at least one cheese and accompaniment, and at least one meat when selecting the meat option.
- To refresh source images from the public Squarespace CDN, run `./scripts/fetch-assets.sh` and
  review the resulting binary changes before committing.

The images and copy in this repository were migrated from the existing All ABoard VA site and
should only be used where the site owner has the necessary rights.

## Tour availability and catalog sync

Edit **Shopify Admin → Content → Metaobjects → Tour schedule → default**. The default is
all weekdays, 3 minimum calendar days in advance, and a 6 calendar-month horizon, in Eastern
Time. Enter blackout dates as `YYYY-MM-DD`, one per line; the parser imposes no date-count
limit. Invalid dates stop the sync rather than silently opening blocked days. Prices are editable
in USD; initial prices use the site's advertised $125 per seat and $1,250 for the whole bus.
November 25–30, 2026 is initially blocked to match the Thanksgiving closure announcement.

Each eligible date gets a `tour-seat-YYYY-MM-DD` product with 10 units and a
`tour-bus-YYYY-MM-DD` bundle requiring all 10 units of that seat variant. Products require no
shipping and are published to the configured Headless publication, outside the charcuterie
collection. Shopify manages shared availability at checkout. Tags `tour` and `scheduled-tour`
identify both types; `tour-seat` and `tour-bus` separate them in saved admin product views.
The `scheduled-tour` tag and date/handle convention are reserved for the automation.

The daily authenticated Vercel job is `/api/cron/materialize-tours`, scheduled at **03:00 UTC**
(10 p.m. EST / 11 p.m. EDT). It anticipates the coming day's minimum-notice cutoff during the
last two Eastern hours of the day, so boundary dates close before midnight, including when
Vercel starts a daily invocation later in the scheduled hour. The horizon never exceeds six
calendar months from the current Eastern date. Dates closer than the minimum, blocked dates,
disabled weekdays, dates beyond a reduced horizon, and all dates when Enabled is off are
**archived, not deleted**. Bookings and historical order data remain intact. Changing a schedule
or blocking a booked day does not cancel or refund existing reservations.

Syncs never reinitialize existing inventory, including sold-out or reactivated dates. Every bus
bundle is verified against its date's seat variant before activation. Initial products remain
Draft until the pair is verified. A compare-and-set Shopify metafield lease serializes concurrent
syncs. Failures leave resumable products; an execution budget allows large initial backfills to
resume on the next invocation. The job reports `pending` dates when another run is needed.

The endpoint reuses `CRON_SECRET`, `SHOPIFY_DELIVERY_LOCATION_ID`, and
`SHOPIFY_STOREFRONT_PUBLICATION_ID`. No new production secrets are needed.

```sh
npm run shopify:setup-tours          # Create definition/defaults; preserve existing settings
npm run shopify:sync-tours -- --dry-run
npm run shopify:sync-tours           # Apply immediately after editing the schedule
npm run test:tours
```

Schedule edits take effect at the next job or manual sync. The initial six-month backfill can
require several manual runs; repeat while the result reports `pending > 0` (CLI exit code 2).
The website's existing tour booking links remain unchanged by this catalog-management feature.

## Tour booking

The Experiences page now embeds the tour planner. Its “Find a tour” and “Book now” buttons
scroll to the planner, which opens `/booking` on the same site. `/tour-booking-preview` remains
available for isolated review; that page and `/booking` are noindex.

The booking flow offers Public/Private tours, actual guest count, a live month calendar, snacks,
regular catalog boards (including BYO validation), registration, required acknowledgments,
and a dedicated Shopify cart. Destinations are arranged by phone. Availability and checkout
both read `tour_schedule/default` directly, enforcing blackouts and the current 3-day / 6-month
settings independently of the nightly catalog job. A public order buys its guest quantity;
a private order buys one whole-bus bundle and records the actual number of passengers.

Tour charcuterie uses the existing **Charcuterie collection** and its current delivery-variant
prices, not a separate collection or tour price list. A generated `Fulfillment = On tour` variant
within each product mirrors the regular variant's options, price, compare-at price, and tax
settings, and requires no shipping. Normal menu/product queries hide these variants and the
normal cart API rejects them. Shopify local pickup is not enabled or required. Each counterpart
has a `tour.source_variant` metafield containing its original variant ID. The synchronizer can
also pair new option combinations generated by Shopify, and removes counterparts whose source
has been removed. It activates counterparts at the source's fulfillment locations without
copying stock quantities. Current boards are made to order with inventory tracking off; tracked
board inventory is deliberately rejected until a shared-stock design is implemented.

**Rollout order matters:** deploy the storefront/cart guards before provisioning on-tour variants.
Do not apply the provisioning command against the live collection while reviewing this PR.
The preview can display the real catalog before provisioning; checkout with a board gives a
setup message until that board has a counterpart. Tour-only checkout already works. End-to-end
board checkout was verified with an isolated temporary product/collection, then those fixtures
were removed. No real charcuterie products or prices were changed for preview testing.

After merging/deploying the guards:

```sh
npm run shopify:sync-tour-boards             # Dry run by default
npm run shopify:sync-tour-boards -- --apply  # Provision counterparts; preserve original IDs
npm run shopify:register-tour-webhooks -- https://aava-site.vercel.app/api/shopify/webhooks
```

Product-create/update and collection-update webhooks keep counterparts current. Shopify app
webhooks are verified using `SHOPIFY_CLIENT_SECRET`; existing manual webhooks continue to use
`SHOPIFY_WEBHOOK_SECRET`. The handler checks the store's canonical myshopify domain as well as
the configured alias, and acknowledges promptly with work retained using Vercel `waitUntil`.
Per-product compare-and-set leases prevent duplicate variants. A no-change plan performs no
writes, preventing self-triggered webhook loops. Background errors are logged; the existing
nightly tour job supplies a bounded reconciliation fallback. Checkout also checks the latest
regular price and repairs price drift on an existing counterpart before creating the cart.

Contact details, meal/pickup preferences, requests, passenger count, and acknowledgment timestamps
are saved as cart attributes for Shopify order details. Only trip/board details appear on the
cart lines. Client drafts use tab-scoped session storage with a two-hour expiration; personal
details are never put in the booking URL. The tour flow does not alter the ordinary delivery
cart. Warnings, reduced quantities, missing lines, price mismatches, or unexpected shipping
requirements block checkout handoff rather than silently accepting a partial booking.

`npm run test:booking` covers registration, schedule/stock checks, fulfillment mapping, price
mirroring, partial-cart rejection, source protection, and idempotent synchronization. The existing
booking emails, waiver delivery, and staff workflow remain in the operations PR.
