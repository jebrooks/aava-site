# All ABoard VA website

A headless Astro rebuild of the public All ABoard VA Squarespace site. Marketing content and the
branded charcuterie storefront live in Astro; Shopify owns products, inventory, carts, checkout,
payments, gift cards, draft-order invoices, and orders. The production runtime targets Vercel.

## Documentation

- [Architecture diagrams](docs/architecture.md): graphical views of Shopify data sources,
  scheduled synchronization, runtime services, and GitHub/Vercel deployments.
- [Content management](docs/content-management.md): where to edit content, Shopify metaobjects,
  when edits take effect, and how to verify them.
- [Deployments and preview review](docs/deployments.md): PR previews, production releases,
  environment variables for **both Preview and Production**, troubleshooting, and rollback.
- [SHOPIFY.md](SHOPIFY.md): provisioning, integrations, imports, and catalog parity configuration.
- [Shopify order notifications](docs/shopify-notifications.md): saved delivery/tour details,
  board preparation fields, payment labels, and actual-email verification.
- [Transactional test plan](docs/transactional-test-plan.md): purchase, email, inventory, gift-card,
  cancellation, and refund acceptance scenarios.
- [Virginia tax maintenance](docs/virginia-tax-maintenance.md): registered collection, tour/food
  treatment, prepared-food override, and checkout verification boundaries.
- [MIGRATION.md](MIGRATION.md): migration history and remaining cutover verification.
- [AGENTS.md](AGENTS.md): project instructions for coding agents and maintenance conventions.

## Get started

Prerequisite: Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

The local URL is fixed at `http://127.0.0.1:4330`.
PR handoffs include matching local and Vercel page links. The local link follows the current
checkout and needs the development server left running; see
[local PR review and environment setup](docs/deployments.md#local-pr-review).

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
- Scheduled task: `/api/cron/materialize-tours` daily at 03:00 UTC

Marketing pages can still be prerendered later, but the catalog, product pages, cart API, dynamic
sitemap, and server integrations require the configured adapter.

## Environment variables

Copy `.env.example` to `.env` for local overrides. In Vercel, set required application variables
for **both Preview and Production**, then redeploy each affected environment after changes.
See [Deployments](docs/deployments.md#environment-variables--preview-and-production) for scope and
external-service considerations. GitHub Actions secrets are configured separately.

- `RESEND_API_KEY` and `CONTACT_EMAIL_FROM` enable contact and custom-board request email from
  the Vercel backend. Both are server-only; the sender must belong to a domain verified in Resend.
  Custom-board requests do not require Shopify credentials or draft-order API scopes.
- The server-side Shopify Storefront token powers catalog and cart operations.
- The Shopify Admin token, webhook secret, cron secret, and location/publication IDs are server-only.
- Custom-board requests use Vercel BotID Basic for invisible bot protection, with no additional
  API keys. Both the browser and API explicitly use Basic to avoid Deep Analysis charges.

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
  data/site.ts         Contact details, navigation, social links, featured boards
  lib/shopify/         Storefront/Admin clients, carts, scheduling, and synchronization
  lib/custom-board-request.ts  Custom-board request email and staff invoice link
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

The codebase includes Shopify-backed catalog/product routes, a local cart, scheduled delivery,
Shopify-backed tour booking, emailed custom-board requests, and local inquiry, policy, waiver, FAQ,
and press pages. Gift Cards links open the native Shopify gift-card product through
`/gift-certificates`, with an inquiry fallback. Product pages collect optional gift recipients and
send dates using Shopify’s native delivery properties. Purchase, redemption, and legacy balances require
separate verification. Internal navigation no longer relies on
`legacyUrl()` or `PUBLIC_LEGACY_SITE_URL`. Implementation does not prove external configuration,
payment readiness, or DNS cutover; use [MIGRATION.md](MIGRATION.md) for the remaining verification.

## Updating content

Use [Content management](docs/content-management.md) as the authoritative editing guide. It maps
Shopify announcements, delivery schedules, tour schedules, shared blackouts, products/metafields,
and repository-owned content to their editing locations and verification steps.

Shopify-managed content generally needs no redeployment, but schedule changes require catalog
reconciliation. Repository content changes go through a PR and Vercel preview. Do not rerun setup
or migration imports to make ordinary content edits; some scripts overwrite settings or inventory.

The images and copy in this repository were migrated from the existing All ABoard VA site and
should only be used where the site owner has the necessary rights.

## Tour availability and catalog sync

Edit **Shopify Admin → Content → Metaobjects → Tour schedule → default**. The default is
all weekdays, 3 minimum calendar days in advance, and a 6 calendar-month horizon, in Eastern
Time. Business closures are managed in the shared **Blackout dates → Business blackout dates**
entry, not in either schedule. Enter `YYYY-MM-DD` dates, one per line; there is no fixed
date-count limit. Invalid shared dates stop availability and synchronization. Prices are editable
in USD; initial prices use the site's advertised $125 per seat and $1,250 for the whole bus.
The shared list was seeded with November 25–30 and December 24–27, 2026 from the tour schedule.

Each eligible date gets a `tour-seat-YYYY-MM-DD` product with 10 units and a
`tour-bus-YYYY-MM-DD` bundle requiring all 10 units of that seat variant. Products require no
shipping and are published to the configured Headless publication, outside the charcuterie
collection. Shopify manages shared availability at checkout. Tags `tour` and `scheduled-tour`
identify both types; `tour-seat` and `tour-bus` separate them in saved admin product views.
The `scheduled-tour` tag and date/handle convention are reserved for the automation.

The daily authenticated Vercel job is `/api/cron/materialize-tours`, scheduled at **03:00 UTC**
(10 p.m. EST / 11 p.m. EDT). It anticipates the coming day's minimum-notice cutoff during the
last two Eastern hours of the day, so boundary dates close before midnight, including when
Vercel starts a daily invocation later in the scheduled hour. The horizon uses the configured
one to twelve calendar months from the current Eastern date (six by default). Dates closer than the minimum, blocked dates,
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
The customer planner lives on `/experiences` and continues to `/booking`;
`/tour-booking-preview` remains available for isolated review.

## Tour booking

The Experiences page now embeds the tour planner. Its “Find a tour” and “Book now” buttons
scroll to the planner, which opens `/booking` on the same site. `/tour-booking-preview` remains
available for isolated review; that page and `/booking` are noindex.

The booking flow offers Public/Private tours, actual guest count, a live month calendar, snacks,
regular catalog boards (including BYO validation), registration, required acknowledgments,
and a dedicated Shopify cart. Destinations are arranged by phone. Availability and checkout
both read `tour_schedule/default` and `booking_blackouts/default` directly, enforcing the shared
closures and current 3-day / 6-month settings independently of the nightly catalog job. A public order buys its guest quantity;
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


## Contact form email on Vercel

`/contact` submits to the Astro `/api/contact` Vercel Function, which sends through Resend to
`info.allaboardva@gmail.com`. The visitor's address is the reply-to address. The sender and
recipient are set on the server. The existing contact layout stays in place; submission shows
an inline confirmation or a retryable error and keeps the visitor's message on failure.

To enable live delivery:

1. Add the [Resend integration](https://vercel.com/marketplace/resend) to the Vercel project.
   This supplies the server-only `RESEND_API_KEY` variable.
2. [Verify a sending domain in Resend](https://resend.com/docs/dashboard/domains/introduction),
   preferably a subdomain such as `mail.allaboardva.com`, using its required DNS records.
3. Set `CONTACT_EMAIL_FROM` in Vercel to an address on that verified domain, for example
   `All ABoard VA <website@mail.allaboardva.com>`. This is the sending identity; inquiries
   still arrive in the existing Gmail inbox.
4. Configure the variables for Production and any Preview environments where real sending
   is intended, then redeploy. Copy values to the ignored local `.env` only for local sending.

There is no `mailto:` submission fallback. Missing configuration or delivery-provider failures
return an error instead of falsely reporting success. The direct email link remains available.
Submissions use server validation, same-origin checks, a honeypot, bounded input, per-instance
rate limiting, a provider timeout, and Resend idempotency keys for unchanged retries. Rate limits
are best-effort per warm function instance; Vercel firewall controls can supplement them.
Only a successful provider acceptance produces confirmation; inbox delivery is not claimed by
the API. Inquiry content and provider credentials are never logged. Native HTML submissions
also work and redirect to `/contact?sent=1` after acceptance.

`npm run test:contact` tests delivery with a mocked provider, validation, spam checks, error
handling, and native form submission. No test emails are sent by this suite. A live inbox test
is still required after configuring Resend. The retired `PUBLIC_CONTACT_FORM_ENDPOINT` variable
is no longer used and can be removed from Vercel.


## Custom-board request email

`/custom-board-request` sends a request through `/api/custom-board-request` to
`allaboardva.tours.charcuterie@gmail.com` using the same Resend sender configuration as contact
email. Staff receive the request reference, every submitted detail, the customer's reply-to
address, and a Shopify Admin link to begin an invoice. The website creates no Shopify draft,
invoice, reservation, or paid order. See [the staff workflow](docs/content-management.md#custom-board-requests).

The invoice helper opens Shopify's blank new draft-order editor for an authorized staff member.
It contains no customer details in the URL and does not save or send anything. The staff email
also includes an optional copyable Sidekick prompt with the reference and request data in JSON.
Staff can paste it into Shopify Sidekick to help prepare an unsaved draft, then review the result.
The prompt treats customer values as data, treats the budget as guidance, and requires staff to
confirm availability, final price, delivery date/window, fees and taxes before saving or sending
an invoice. The website never executes the prompt. The public form confirms that the request
was sent for review only after the email provider accepts it; it does not promise availability
or claim an invoice exists.

Run `npm run test:forms` for custom-request validation, BotID/spam protection, email delivery and
failure handling. Verify actual inbox receipt and the staff link on the PR preview before release.

## Relative site links and domain cutover

Navigation uses root-relative URLs so Preview, `aava-site.vercel.app`, and the eventual
`www.allaboardva.com` deployment stay on the host being visited. Canonical URLs, sitemap URLs,
and social metadata deliberately use the final absolute domain. Social profiles, press articles,
Shopify checkout, and service API URLs remain external.

`PUBLIC_LEGACY_SITE_URL` is retired and can be removed from Vercel. The published policy pages
are checked-in snapshots in `src/data/policies.json`, with source provenance; production does
not fetch Squarespace. Approved amendments are recorded alongside source provenance. The
cancellation policy now reflects no minimum private-tour guest count (maximum 10) and the
approved 48-hour tasting-fee refund cutoff.

Tour planning, custom estimates, booking help, and gift-certificate inquiries use local pages
and the existing Resend contact endpoint. These are inquiry workflows, not automatic booking
changes. Gift links use `/gift-certificates` to find a native Shopify gift card in the catalog
collection and open its product page, with an inquiry fallback. The old gift-product path
redirects there only while no matching Shopify product exists. FAQs describe the current region-free booking flow, and Press reuses
the existing coverage with local images.

Shopify product descriptions and announcement rich text normalize links to `allaboardva.com`
and `www.allaboardva.com` (plus the primary Vercel alias) into relative links when rendered. Historical product migration
metafields and asset download scripts retain their source URLs as provenance, not navigation.

`npm run check:links -- http://127.0.0.1:4330` crawls a running site and fails for broken
internal pages/fragments or absolute links back to the old host. Catalog parity CI also runs
this crawl while its temporary server is active. `npm run test:links` covers link normalization.


## Shared blackout dates for deliveries and tours

Edit **Shopify Admin → Content → Metaobjects → Blackout dates → Business blackout dates**
(`booking_blackouts/default`). The **Dates** field contains one `YYYY-MM-DD` date per line.
An empty field intentionally means no business-wide closures. Delivery and tour schedules
retain their own operating days, lead times, and horizons; tours retain seat capacity and prices. Both use this
single blackout list. No schedule reference needs to be selected manually.

Availability and checkout read the shared list directly with no application cache. Missing or
invalid shared configuration fails closed, including when an environment delivery schedule
fallback exists. The cart calendar displays available dates automatically, without a Check dates button.
Customers choose a delivery date, then a time in the select box; a valid delivery ZIP is required.
Choosing the time saves the window immediately without a reservation button. The date, window, and timezone appear on each physical
board line in Shopify checkout and orders. Delivery windows have no capacity limit or generated
reservation products.
The tour job archives blocked seat/bus products and reopens eligible dates without resetting
sold inventory. Removing a delivery blackout immediately restores otherwise eligible windows.
Existing orders are not canceled by schedule edits. See the [delivery maintenance guide](docs/content-management.md#delivery-schedule--delivery_scheduledefault)
for retiring old reservation products after deployment.

Migration and rollout:

```sh
npm run shopify:setup-blackouts                 # Read-only plan
npm run shopify:setup-blackouts -- --apply      # Create/seed shared entry, bridge old code, archive closures
# Merge and deploy the code, then remove the old per-schedule fields:
npm run shopify:setup-blackouts -- --retire-legacy-fields --apply
```

The initial seed copies the current tour blackout dates. A preexisting shared list is preserved,
so rerunning setup cannot overwrite its edits with stale tour data. During rollout, the old
schedule fields are labeled **legacy migration copy** and carry the same dates to protect the
previous deployment. Do not maintain those copies manually. The cleanup command verifies that
both production availability endpoints report `blackoutSource: booking_blackouts/default`
before deleting either legacy field. Use `--site=https://your-production-host` if the production
host has changed. Migration records are backed up under `/tmp` before writes.

The initial migration also archives already-generated products on the closures immediately;
new closures are enforced immediately by availability/checkout and reconciled in the catalog
by the tour job. Removing a closure restores eligible tour dates after the next catalog sync. Delivery does not need reconciliation.
New-store setup should create both schedules, then run the shared-blackout setup before enabling
bookings. The `DELIVERY_SCHEDULE_JSON.blackoutDates` fallback is no longer authoritative.

`npm run test:blackouts` covers parsing, arbitrary-length lists, delivery availability and
checkout rejection, unlimited repeated window selections without inventory queries,
and refusing missing configuration even with a fallback. Tour booking and sync tests cover
the same shared source for public seats and private buses.
