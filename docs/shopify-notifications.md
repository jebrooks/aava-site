# Shopify order notification maintenance

Shopify → **Settings → Notifications** owns the customer **Order confirmation** and staff
**New order** email templates. Astro supplies order attributes and line properties; changing
the website does not automatically change these templates. Template edits take effect in
Shopify without a Vercel deployment. Custom-board request emails are a separate Resend workflow;
see [Content management](content-management.md#custom-board-requests).

Back up the current template before editing and preserve Shopify's native order summaries,
bundle handling, payment filtering, tax/discount calculations, gift-card recipient details, and
status links. Do not replace a current template with an older backup: Shopify can change its
default markup and payment handling. Keep customer data and private email links out of Git.

## Customer email branding

The customer **Order confirmation** and **New gift card** templates use the black footer board
logo, a faint regional-map background, burgundy `#8a1538` pill buttons, Montserrat body text and
Marcellus headings. These styles are saved in Shopify notification HTML; deploying the site's
CSS does not update them. Keep them aligned with `src/styles/global.css` when the brand changes.

Shopify → **Content → Files** hosts `all-aboard-footer-logo-black.png` and
`gift-card-region-background.png`. Maintain their image URLs in the templates. The map is
already washed out in the image itself: Shopify's email formatter removes CSS transparency
overlays. Keep order summaries and customer information on white, with a white fallback when
the background image is unavailable. The fonts use version-pinned Fontsource files; email apps
that block web fonts fall back to Arial for body text and Georgia for headings. Do not turn
dynamic order details into images to force a font.

Preserve delivery date/window/timezone properties, the saved tour section and tentative
on-tour handoff wording while changing presentation. Validate ordinary delivery, on-tour food,
tour-only, gift-only and pending-payment branches, then save, reload and compare the source.
Shopify's generic preview uses sample data and does not prove real notification delivery.

## Saved delivery and board details

Both order notifications must show these nonblank physical-board line properties:

- `Delivery date`
- `Delivery window`
- `Delivery timezone`

Read the saved order values, not today's schedule or a generic shipping estimate. Delivery
windows have no reservation products or capacity limit. Gift-card-only and on-tour orders
must not receive empty delivery labels.

Preserve the buyer template's existing line/component property rendering. The staff template
also needs a board-details section with the product/variant title, quantity, and nonblank
`Serves`, `Board preference`, `Cheeses`, `Meats`, and `Accompaniments` properties. Include
`Fulfillment` when present, such as **Provided on the bus**. Render board preparation fields by
saved board properties, rather than depending on shipping flags: the approved rollout changes
on-tour boards from non-shipping to physical fulfillment at the tentative boarding destination.

Render property names and values through Liquid's `escape` filter, omit blank fields, and use
an explicit property list rather than exposing internal gift-card or other hidden properties.
Board properties are created in `src/lib/board-customization.ts`, `src/lib/serving-size.ts`,
`src/lib/cart-edit.ts`, and `src/lib/shopify/tour-booking.ts`.

## Tour booking details

Render one tour section when the saved order attribute `attributes['Tour date']` is nonblank.
Use order-level attributes for the complete booking: tour line properties contain only a
subset, and a bundle component's quantity is not a passenger count. On-tour board lines carry
serving count, fulfillment and custom ingredients; read booking details from the root attributes
or seat/bus line rather than expecting them on the board line.

The customer section uses these nonblank saved attributes:

- `Booking reference`, `Tour date`, `Tour type`, `Guest count`
- `Destination`, `Pickup preference`, `Pickup arrangements`, `Custom pickup address`
- `Tentative fulfillment address` for board bookings only
- `Snack`, `Sandwich preference`, `Board quantity`

The staff section also includes nonblank `Lead guest`, `Email`, `Mobile phone`,
`Dietary needs / allergies`, `Special requests`, and `Tour preferences` attributes.
The authoritative key list is `tourBookingAttributes` in `src/lib/tour-booking.ts`.
Use an explicit field list and escape dynamic values. For example:

```liquid
{% if attributes['Tour date'] != blank %}
  <p>Tour date: {{ attributes['Tour date'] | escape }}<br/>
     Guest count: {{ attributes['Guest count'] | escape }}</p>
{% endif %}
```

**Guest count is the number attending.** A public tour purchases one seat per guest. A private
tour purchases one whole-bus booking whose bundle reserves all ten shared seats, even when
only two guests attend. Do not derive guest count from `item_count`, line quantities, or bundle
components. For `Tour type == 'Private whole bus'`, make clear that one bus is reserved for the
saved guest count and any seat quantities in the item summary represent reserved bus capacity.

Tour next steps retain the approved booking-page wording: “We’ll coordinate destinations and
final pickup arrangements with you by phone. A travel waiver is required before your tour.”
Link to the existing [Tour Waiver & Release](https://aava-site.vercel.app/tour-waiver-release)
and [Booking updates](https://aava-site.vercel.app/booking-updates) pages. Maintain these links
when the production hostname changes. Displaying a waiver link or a recorded booking
acknowledgment does not establish signed-waiver collection; do not claim that a waiver was
signed or that an automated signature workflow exists.

### Tentative boarding destination in the physical-board rollout

All pickup preferences remain tentative and arranged by phone. A booking with a separately sold
board can show a boarding fulfillment address and the $0 method **Charcuterie provided on your tour — pickup arranged by phone**; it must not imply home-board delivery or a confirmed meeting curb. With no
preference/Arrange by phone, NorthSide Social is that board booking's tentative default only.
Keep the customer informed that the final arrangement will be made by phone.

Tour-only/included-sandwich service bookings must not acquire a default NorthSide or delivery
address. The buyer's normal-paid board confirmation uses **Your board will be provided on the bus.**
and the escaped pickup note. Its address section is **Tour board handoff address (tentative)**;
the staff heading is **Tour board handoff (tentative)**. Gate these changes on both root order
attributes `Tour date` and `Tentative fulfillment address` being nonblank. Service-only orders
must not gain default address text. Preserve pending-payment/charged-on-fulfillment branches,
all totals/tax/gift/payment loops and ordinary-delivery/gift-only output.

Rendered private fixtures cover no-preference/default and chosen-board cases, service-only
omission, ordinary delivery/gift-only equivalence, escaping and the preserved payment branches.
Template preparation or fixture success is not an external save/readback or actual email send;
record those observations separately after rollout.

## Payment labels

Use explicit text labels for gift-card and credit-card payment lines so plain-text emails and
clients that hide images remain understandable. Show **Gift card**, optionally its last four
characters, and the corresponding transaction amount. Credit-card lines should identify the
card brand (or **Credit card**), last four digits when available, and amount. Never expose a full
gift-card code or card number.

Shopify transactions can identify a gift card through
`payment_details.gift_card_last_four_digits`, `gateway == 'gift_card'`, or
`gateway_display_name == 'Gift card'`; older gift details can provide
`payment_details.gift_card.last_four_characters`. Preserve the template's existing successful/
pending transaction handling and capture/authorization deduplication. A split payment needs
distinct gift-card and remaining card-payment labels and amounts; it is not a discount.

## Verification

Saving a template, inspecting its preview, or rendering a local fixture verifies only part of
the workflow. Complete an approved test purchase and compare checkout, the Shopify order,
the order-status page, and **both actual received emails**, checking plain-text and HTML bodies.
Verify at least the affected cases:

- Delivery board with date/window/timezone and serving count.
- Build-your-own and on-tour boards with ingredient selections and serving counts.
- Public tour with sandwich/pickup preferences and a private tour with fewer than ten guests.
- Gift-card-only order and gift-card/card split payment, including amounts and readable labels.

Verify existing recipient handling and unrelated order information still appear. Record order
numbers, observed values, cleanup, and any remaining failures in the
[transactional test plan](transactional-test-plan.md) results. Template saves and offline checks
must not be reported as a passed actual-email test or completion of the full plan.

Shopify's [notification variables reference](https://help.shopify.com/en/manual/fulfillment/setup/notifications/email-variables)
documents the order attributes, line properties, and payment variables available to templates.
