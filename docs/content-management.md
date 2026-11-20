# Content management

Use this guide to find the authoritative source for an edit. Shopify supplies commerce data and
operational settings; Astro supplies marketing content, presentation, and the booking interface.
Repository changes go through the [PR and deployment workflow](deployments.md).

## Where to edit

| Content | Authoritative source | Deployment needed? |
| --- | --- | --- |
| Announcement messages and display dates | Shopify → Content → Metaobjects → Announcement banner | No; allow about a minute on new page loads |
| Delivery service area, capacity, notice, horizon, windows | Shopify → Content → Metaobjects → Delivery schedule, handle `default` | No; reconcile generated date products after edits |
| Tour operating days, notice, horizon, enabled state, prices | Shopify → Content → Metaobjects → Tour schedule, handle `default` | No; reconcile generated date products after edits |
| Business closures for both tours and delivery | Shopify → Content → Metaobjects → Blackout dates → Business blackout dates | No; availability checks use the list directly; catalog reconciliation follows |
| Products, descriptions, product images, variants, prices, inventory | Shopify → Products; charcuterie collection and Headless publication | No; verify storefront visibility |
| Serving counts | Shopify product/variant `custom.serving_count`; see Serving sizes below | No |
| Ingredients, allergens, dietary labels, preparation hours | Shopify product metafields under `custom` | No |
| Marketing copy, FAQs, inquiry prompts, page-specific SEO | Matching files in `src/pages/`; shared components in `src/components/` | Yes |
| Company contact details, navigation, social links, featured boards | `src/data/site.ts` | Yes |
| Build-your-own ingredient options and size limits | `src/data/board-customizations.json` | Yes |
| Tour pickup locations, sandwiches, preferences, terms version | `src/data/tour-options.ts` | Yes |
| Policy and waiver wording | `src/data/policies.json`, rendered by policy pages | Yes |
| Press coverage | `src/data/press.ts` and `src/pages/press.astro` | Yes |
| Brand colors, typography, responsive layout | `src/styles/global.css`, layouts and components | Yes |
| Local images | `public/images/` and their component/page references | Yes |

Product metafields are fields attached to products, distinct from the four metaobject types below.
Featured-board links and images are curated in code even though the linked product is managed in
Shopify. Editing a product does not automatically update that curated showcase.

## Shopify metaobjects

Open Shopify Admin → Content → Metaobjects. Edit the existing entries below rather than creating
replacement schedule handles: application queries depend on `default`.

### Announcement banner — `announcement_banner`

Each entry has a Name for staff identification, rich-text Content, an enabled switch, and optional
start/end dates. Name is not displayed. Format links, bold, and italics within Content.

Dates are inclusive in `America/New_York`; blank dates are unrestricted. Reversed dates hide the
entry. When enabled entries overlap, the latest start date wins, then latest edit, then
alphabetical handle; undated entries have lowest priority. The application caches entries for
60 seconds and evaluates dates on each request. Verify the banner after a new page load and allow
about a minute for edits to appear. Invalid or unavailable configured content hides the banner.
Local development without Admin credentials displays a sample announcement.

`npm run shopify:setup-announcement` provisions or migrates the definition. It is a schema/setup
operation, not the routine way to edit a message. Verify rendering with `npm run test:announcement`.

### Delivery schedule — `delivery_schedule/default`

Edit eligible ZIP codes, daily order capacity, lead time in hours, horizon in days, and weekly
windows JSON. Weekday keys use Sunday `0` through Saturday `6`; window times use 24-hour `HH:mm`.
Capacity is shared across all windows on the same date. Delivery uses Eastern Time.

Closures belong in the shared Blackout dates entry. `DELIVERY_SCHEDULE_JSON` is a setup/local
fallback, not the routine content source. `npm run shopify:setup` writes its values into the
schedule, including an existing entry; do not rerun it with stale environment defaults.

The daily job `/api/cron/materialize-delivery` runs at **05:15 UTC**, creates hidden date inventory,
and reconciles capacity changes by a delta so booked orders remain accounted for. A date must
have generated inventory to be bookable. After changing the schedule, reconcile through the
authenticated endpoint if the change must appear before the next job. See [SHOPIFY.md](../SHOPIFY.md).

### Tour schedule — `tour_schedule/default`

Edit Enabled, Minimum days in advance, Months ahead to create products, Operating days, Public
seat price, and Whole bus price. Prices are in USD. Booking dates use Eastern Time. The horizon
defaults to six calendar months and accepts one to twelve months.

The Experiences page's public/private starting prices and the gift-card price guide read these
prices from Shopify on each page request, using the shop currency. Maintain them here rather
than in page copy. The Experiences page shows an availability message when tours are disabled
or prices cannot be loaded; the gift-card guide omits unavailable tour rows.

The shared ten-seat capacity is defined by `TOUR_CAPACITY` in `src/lib/tour-schedule.ts`; it is not
an editable metaobject field. Changing capacity requires reviewing bundle and fulfillment behavior.

The daily job `/api/cron/materialize-tours` runs at **03:00 UTC**. It maintains date-specific seat
products and whole-bus bundles sharing those seats, and then reconciles on-tour board variants
when the date sync completes. For a manual tour catalog sync:

```sh
npm run shopify:sync-tours -- --dry-run
npm run shopify:sync-tours
```

These commands use the store configured in local `.env`. The second command writes to Shopify.
Repeat a backfill when `pending > 0` (CLI exit code 2). Use the authenticated job for the combined
tour and board reconciliation, or the board sync described in the [README](../README.md#tour-booking).
Verify `/experiences`, `/booking`, affected dates, and prices after reconciliation.

### Blackout dates — `booking_blackouts/default`

Open **Blackout dates → Business blackout dates**. Enter one `YYYY-MM-DD` date per line in Dates.
An empty field intentionally means no closures. Both schedules read this one list; do not edit
legacy per-schedule blackout fields or an environment fallback for closures.

Availability and checkout read the shared list directly without an application cache. Missing or
invalid shared configuration blocks availability. Jobs archive blocked generated products;
removing a closure lets eligible dates reopen after reconciliation without resetting sold inventory.

Schedule changes and closures do not cancel or refund existing reservations. Staff must handle
affected bookings separately in Shopify and contact customers through the established process.

## Product maintenance

Edit normal catalog products in Shopify. Ensure intended products belong to the configured
charcuterie collection and are published to the configured Headless storefront. Check product
details and the menu after edits. Automated delivery dates, tour seats, bus bundles, and on-tour
board variants are maintained by synchronization code; do not use them as ordinary editable content.

Do not rerun the Squarespace importer to make routine product edits: applying an import resets
imported inventory to the input file. Preserve inventory, bundle relationships, order history,
and migration provenance. Provisioning and reconciliation details live in [SHOPIFY.md](../SHOPIFY.md).

### Serving sizes

Keep serving counts in Shopify **Serving count** (`custom.serving_count`), as a positive whole
number such as `4`, not `Serves 4`. Both definitions use `single_line_text_field` and must have
Storefront access set to `PUBLIC_READ`.

- Single-size boards: set the product metafield. All its fulfillment variants inherit that count.
- Multi-size boards: leave the product field blank and set each variant's metafield. For example,
  both Delivery and On tour variants of Small serve `4`; both Large variants serve `10`.
- Spell out size names such as Small, Medium, Large, and Extra Extra Large where they distinguish choices; remove serving
  counts from titles, size-option names, and descriptions. Do not infer counts from size names:
  existing Medium custom boards have different documented counts.

The site renders counts from these fields on product cards, the selected product option, the cart,
and tour board selectors. Variant counts take precedence over product counts. The gift-card guide
also uses these fields; it does not parse titles or option names. Product pages update the count
when the selected variant changes. On-tour synchronization copies variant serving counts from
delivery variants to their counterparts. Maintain the delivery source and let synchronization
maintain generated counterparts; see the Shopify runbook.

New cart and tour add-on lines receive a server-derived **Serves** line property, per board, so
the count travels with the Shopify checkout/order line. Before handoff, older carts missing the
property are copied with current counts while preserving delivery, gift and ingredient selections;
the original open checkout is left intact. Previously placed orders are not edited. Custom email
notification templates may need separate review to ensure they display line properties.

#### Migrating existing copy

Use `scripts/shopify/migrate-serving-sizes.mjs`, rather than rerunning setup/import scripts.
It derives counts only from explicit existing serving statements and stops for missing or
conflicting data. Review its snapshot and proposed title/description/option changes before writes.

```sh
node --env-file=.env scripts/shopify/migrate-serving-sizes.mjs --phase=plan --snapshot=/absolute/path/serving-sizes.json
node --env-file=.env scripts/shopify/migrate-serving-sizes.mjs --phase=fields --snapshot=/absolute/path/serving-sizes.json
```

The plan step is read-only in Shopify and creates a new local snapshot without overwriting an
existing file. The fields step creates/exposes the definitions and populates counts while keeping
all copy unchanged. Verify the counts through Storefront and review the new site display in a PR.
**Deploy the site support before removing the old copy**; the older production gift-card guide
and tour selector still depend on names. Then run:

```sh
node --env-file=.env scripts/shopify/migrate-serving-sizes.mjs --phase=cleanup --snapshot=/absolute/path/serving-sizes.json --production-url=https://aava-site.vercel.app
```

Use the verified production host. Cleanup checks production product pages for field-aware display,
confirms the populated fields, and preserves product handles, option-value IDs, variant IDs,
prices, inventory settings, and tour source relationships. It changes existing option values in
place with `LEAVE_AS_IS`; it does not recreate variants. Re-running the same snapshot resumes
completed cleanup steps, but unrelated catalog edits stop it for review. Keep the snapshot outside
source control for recovery. Verify catalog cards, product choices, cart, gift guide and tour
board choices after cleanup. `npm run test:cart` and `npm run test:booking` cover this behavior.

## Repository content changes

Edit the source listed above, use existing components and styles, and review changed routes on
desktop and mobile in the PR preview. Run the checks appropriate to the change, including relevant
behavior tests. Keep internal links relative so reviewers stay on the preview host.

Policies are checked-in snapshots with source provenance. Preserve approved wording unless the
task authorizes a policy change. Approved amendments retain source/capture provenance and record
`amendedAt` and `amendmentNote`. Private tours have no minimum guest count (maximum 10); the
approved tasting-fee refund cutoff is 48 hours.
Policy pages display the wording; they do not independently collect signed waivers.
The `cleaning-damage` snapshot in `src/data/policies.json` supplies the Experience Guide’s
Cleaning & Damage section; booking links directly to `/experience-guide#cleaning-damage`.

Use `./scripts/fetch-assets.sh` only when refreshing migrated source images, and review resulting
binary changes.

### Gift cards

Manage native gift-card products, amounts, descriptions, and images in Shopify → Products.
Include the gift-card product in the configured charcuterie collection and publish it to the
Headless storefront. The site uses Shopify’s native `isGiftCard` flag; no tags or product type
are needed. The Gift Cards navigation and homepage/charcuterie links go to `/gift-certificates`,
which redirects to the first native gift card in the collection’s manual order. If unavailable
or unconfigured, the page offers a gift-certificate inquiry instead.

Gift-card amount choices are read directly from the product's Shopify variants and sorted by
price; add or remove denominations in Shopify, with no code change needed. The price guide on
the gift-card product page also reads Shopify on each page request. Charcuterie prices come
from available, published delivery variants grouped by variant `custom.serving_count`, falling
back to the product's `custom.serving_count`. Gift cards, delivery
slots, scheduled tours, and on-tour variants are excluded. The displayed groups are serves 4,
8, 10, and 15. All charcuterie groups show approximate guidance: the midpoint of the current
price range, rounded to the nearest $25 (minimum $25).
Tour prices come from `tour_schedule/default` (`seat_price` and `bus_price`) in the shop currency;
disabled tours are omitted. Missing sources omit their rows rather than displaying fixed fallback
prices, and do not prevent gift-card purchases. See `src/components/GiftCardPriceGuide.astro`
and `src/lib/gift-card-guide.ts`. `npm run test:cart` covers the guide's grouping and calculations.

Customers choose an amount and can select **Send as a gift** on the product page before adding
it to the cart. That option collects a required recipient email, optional name (255 characters),
message (200 characters), and send date up to 90 days ahead. Blank send dates mean sending after
purchase; leaving the option unchecked sends to the buyer’s checkout email. Shopify sends
scheduled emails approximately 4–10 a.m. in the purchasing customer’s timezone, captured from
the browser; customers cannot select an exact time. Quantity applies to that same recipient.
Add cards separately for different recipients. The cart shows the recipient and date; to change
them, remove the card and add it again. Saved dates that have passed must be updated before checkout.

Recipient fields are implemented in `src/components/GiftCardRecipient.astro` and validated in
`src/lib/gift-card.ts`. The server creates Shopify’s native line properties, including
`__shopify_send_gift_card_to_recipient` and `__shopify_offset`, rather than accepting arbitrary
attributes. Cart copies preserve them. `npm run test:cart` includes recipient validation,
date/timezone boundaries, and cart-copy preservation. Theme recipient settings in Shopify
Online Store do not affect this Astro storefront. Maintain the **New gift card** and **Gift card
receipt** notification templates in Shopify → Settings → Notifications → Customer notifications;
customized templates must support recipient details. See Shopify’s
[recipient form documentation](https://shopify.dev/docs/storefronts/themes/product-merchandising/gift-cards)
and [notification guidance](https://help.shopify.com/en/manual/online-store/themes/customizing-themes/common-customizations/add-gift-card-recipient-fields).

Gift-card-only purchases skip local delivery scheduling; orders that also contain physical boards
still require a delivery window. When the last physical item is removed, the cart discards its
unused delivery-capacity line and delivery metadata. Checkout also repairs older saved digital-only
carts this way, creating a clean cart rather than changing an already-open checkout. Recipient
properties and other customer items are preserved. This prevents leftover delivery reservations
from showing a shipping address or free shipping rate for a gift-card-only purchase. Shopify may
still request a billing address for payment.
Shopify owns checkout, payment, gift-card issuance, and redemption. Verify purchase, notification,
and redemption separately before cutover; the website does not reconcile legacy balances.

When a source of content, metaobject field, or editing workflow changes, update this guide and
the compact map in `AGENTS.md` in the same PR. Keep live credentials and customer data out of docs.
