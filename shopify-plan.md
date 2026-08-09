# Headless Shopify Charcuterie Migration

## Summary

Keep Astro as the customer-facing storefront and deploy it on Vercel. Shopify will own active
charcuterie products, variants, inventory, taxes, discounts, gift cards, orders, payments, and
hosted checkout. Vercel functions will handle delivery scheduling, Shopify webhooks, and
custom-board requests.

Shopify officially supports this custom-storefront model through its Storefront API and hosted
checkout. See the [Shopify custom storefront documentation](https://help.shopify.com/en/manual/custom-storefronts).

## Implementation Changes

### Shopify catalog and migration

- Export the Squarespace catalog, images, active orders, gift-certificate liabilities, and
  customer/order archives.
- Import only active charcuterie products, variants, add-ons, and gift cards. Preserve SKU, price,
  inventory, descriptions, imagery, SEO metadata, and existing handles where practical.
- Organize products into Shopify collections such as Quick Pick, Signature Boards, Special
  Occasions, Build Your Own, and Gift Cards.
- Add product metafields for serving count, ingredients, allergens, dietary labels, preparation
  time, featured status, and legacy URL.
- Track variant inventory in Shopify and disable “continue selling when out of stock.”
- Preserve existing `/charcuterie-menu/p/[handle]` URLs in Astro and redirect retired or renamed
  Squarespace URLs individually.

### Astro storefront and checkout

- Add Shopify’s Storefront API and the Vercel Astro adapter; prerender existing marketing pages
  while server-rendering catalog and product routes.
- Replace the hard-coded `featuredBoards` data with Shopify collection queries.
- Build branded Astro collection, product, variant-selection, cart, inventory-status, and error
  states.
- Maintain the Shopify cart ID in browser storage and send customers to the cart’s Shopify-hosted
  checkout URL for payment.
- Treat Shopify as the final authority for price and inventory; refresh the cart before checkout
  and surface any changed or unavailable items.
- Configure Shopify native local-delivery zones and fees for eligible Northern Virginia ZIP codes.
  The Astro cart performs an early ZIP check, while Shopify validates the complete address during
  checkout. See the [Shopify local-delivery documentation](https://help.shopify.com/en/manual/fulfillment/setup/delivery-methods/local-delivery).

### Delivery scheduling and capacity

- Define staff-editable Shopify metaobjects for eligible ZIP codes, weekdays, selectable time
  windows, lead time, blackout dates, and shared daily order capacity.
- Run a daily Vercel cron job that materializes a rolling 60-day calendar as hidden, zero-price
  Shopify delivery-capacity products: one product and one inventory-tracked variant per date.
- Publish slot products only to the custom storefront channel and omit them from customer catalog
  queries.
- Require the customer to select one available date and window in the Astro cart; add the date's
  capacity variant and readable window attributes to the Shopify cart.
- Let Shopify inventory enforce capacity at checkout. If the last slot sells while another
  customer is checking out, Shopify rejects the unavailable line and the storefront asks them to
  choose another window.
- On cancellation or refund, staff chooses whether to restock the delivery-slot variant so the
  capacity reopens.

### Custom requests, invoices, and gift cards

- Add an Astro custom-board form collecting contact details, requested date, ZIP/address, guest
  count, budget, dietary restrictions, theme, and notes.
- Submit through a protected Vercel endpoint with validation, rate limiting, and bot protection;
  create a tagged Shopify draft order containing the request details.
- Staff finalizes products, custom charges, discounts, delivery, taxes, and an available delivery
  slot, reserves relevant inventory, then sends Shopify’s secure invoice link. See the
  [Shopify draft-order documentation](https://help.shopify.com/en/manual/fulfillment/managing-orders/create-orders/create-draft).
- Sell all new gift cards through Shopify.
- Export outstanding Squarespace gift-certificate liabilities, verify balances, issue equivalent
  Shopify replacements, and retain a confidential reconciliation ledger outside the public Git
  repository.
- Keep full Squarespace customer and order exports as a restricted archive; import only consented
  customer records and unresolved obligations.

## Interfaces and Operations

- Public configuration: Shopify store domain and Storefront API token.
- Server-only configuration: Shopify Admin API token, webhook secret, form-protection secret, and
  scheduling cron secret.
- Add `GET /api/delivery/availability` accepting ZIP code and date range and returning eligible
  dates, windows, and Shopify slot variant IDs without exposing administrative rules or secrets.
- Add `POST /api/custom-board-request` for validated custom-order submissions.
- Add authenticated Shopify webhook endpoints for product/inventory updates, paid orders,
  cancellations, and refunds.
- Use `America/New_York` for all scheduling calculations and store machine-readable dates
  separately from display labels.
- Keep Shopify administrative credentials exclusively in Vercel server-side environment variables.

## Test and Launch Plan

- Reconcile active product, variant, image, price, SKU, and inventory counts against the
  Squarespace export.
- Test product discovery, variants, sold-out states, cart persistence, price changes, discount
  codes, taxes, local-delivery eligibility, checkout, confirmation emails, cancellation, refund,
  and inventory restoration.
- Test scheduler lead times, cutoff boundaries, daylight-saving transitions, blackout dates,
  invalid ZIP codes, full slots, simultaneous attempts to buy the final slot, and slot reopening.
- Test custom requests through draft-order editing, inventory reservation, invoice delivery,
  payment, and conversion into regular orders.
- Test new gift-card purchase/redemption and every reconciled legacy balance.
- Preview on Vercel, crawl old and new routes, add permanent redirects and sitemap entries, then
  perform test and low-value live transactions.
- Keep Squarespace reachable on a legacy hostname for a 30-day rollback and reconciliation window
  before retirement.

## Assumptions

- The initial release covers active charcuterie commerce only; tours and booking remain separate.
- Fulfillment is scheduled local delivery only—no pickup or conventional shipping.
- Shopify Basic or an equivalent non-Plus plan is sufficient; the design does not depend on
  Shopify Plus checkout customization or custom Shopify Functions.
- Staff manages schedules in Shopify Admin, product inventory in Shopify, and custom pricing
  through draft orders.
- Delivery capacity represents the number of orders accepted per date, not per window and not the
  number of individual products in those orders.
