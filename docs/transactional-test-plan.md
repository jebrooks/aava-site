# Shopify transactional test plan

Verify the Astro-to-Shopify integration for charcuterie, public/private tours, gift cards,
custom-request email, inventory, customer/staff notifications and cart recovery.

**Scope confirmed by the owner on November 21, 2026:** Shopify owns native payments, wallets,
processor authentication, manual invoices and scheduled gift sending. Do not create additional
orders to test card brands, native payment methods, processor behavior or settlement. Our
acceptance covers correct items/totals, delivery/tour/recipient/send-date data at handoff,
inventory, emails and cart recovery. Manual Shopify invoice payment and waiting for a future
native gift send are optional operational checks, not Astro release gates.

The [November 21, 2026 results](transactional-test-results-2026-11-21.md) record focused delivery
checkout and email verification, with explicit coverage gaps. They do not mark this full plan complete.

## Approach

Run three stages:

1. Checks without payment: product choices, validation, cart changes, delivery restrictions,
   booking restrictions, and checkout totals.
2. Completed purchases: a focused set of real orders covering each purchase family and its emails.
3. Recovery: cancellations, refunds, inventory restoration, and gift-card reconciliation.

Use the deployed production site for final acceptance. Keep production prices unchanged.
Use simulated payments for declines and repeated edge cases where an isolated test environment
is available. Shopify test mode affects the whole store; use it only while the store is closed
to customers or in a separate test store. A Vercel preview connected to production Shopify does
not isolate payments, inventory, or email.

Use the owner's existing Shopify test-mode authorization for the integration regressions.
Record the observed payment mode, but do not change it or initiate further payments solely to
test Shopify-native behavior. See [Shopify test-order guidance](https://help.shopify.com/en/manual/checkout-settings/test-orders/processing-test-order).

## Preparation and evidence

- [ ] Confirm the deployed commit and Shopify store being tested.
- [ ] Confirm payment mode and enabled payment methods.
- [ ] Use two controlled inboxes: buyer and gift recipient. Use real, monitored addresses for email tests.
- [ ] Choose eligible delivery dates and two unused tour dates; record starting tour capacity.
- [ ] Confirm tests will not trigger unintended food preparation, fulfillment, or customer communications.
- [ ] Label orders in Shopify with a consistent test tag, such as `transactional-test`.
- [ ] Test primary flows on desktop and mobile; include guest checkout and returning-customer checkout if enabled.

Record each test using this template. Keep customer details and gift-card codes out of Git.

```text
Scenario ID:
Date / tester:
Site / deployed commit:
Device / browser:
Payment mode / method:
Order number:
Amount / processing fee if known:
Expected result:
Actual result / pass or fail:
Customer email received / content checked:
Staff email received / content checked:
Inventory before / after purchase / after cancellation:
Refund / gift-card balance / cleanup status:
Evidence location / issue reference:
```

For every completed order, compare the cart, checkout, Shopify order, customer email, and
order-status page. Check product/variant, quantity, price, tax, delivery fee, discounts,
serving counts, selections, and relevant booking details. Check inbox and spam folders.

## 1. Charcuterie

| ID | Scenario | Acceptance criteria |
| --- | --- | --- |
| C1 | Single-size board | Exact price, separate serving count, eligible delivery date/window, correct address and delivery fee. |
| C2 | Multi-size board | Small and Large retain correct prices and serving counts on product page, cart, checkout, order, and email. Both sizes can be combined in one purchase. |
| C3 | Build-your-own board | Cheese, meat, accompaniment, board-preference and serving-count selections survive checkout and appear in the Shopify order, real customer confirmation and real staff new-order email. Compare both plain-text and HTML bodies; omit empty fields. Invalid or incomplete selections are rejected. |
| C4 | Multiple boards and quantities | Quantities, totals, and per-board serving counts are clear. The selected delivery window appears on every physical board line without a reservation product. Multiple orders may choose the same window. |
| C5 | Cart changes | Change size/quantity, remove an item, refresh, and return later. The delivery calendar loads available dates automatically without a Check dates button or ZIP lookup, selects a date and the time dropdown shows only that date’s windows. Choosing a time saves immediately with a valid delivery ZIP, without a reservation button. Choosing a time before entering a ZIP prompts for the ZIP and saves after entering it. Check month navigation, disabled blackout/notice/horizon dates, and changing a date before saving a time. Changing a window updates the saved selection; failed saves can be retried. No stale price, ingredient selection, or delivery time remains. |
| C6 | Delivery restrictions | Reject unsupported ZIP codes and non-Virginia delivery addresses, insufficient notice, blackouts, and out-of-horizon dates. Delivery windows have no daily or per-window order cap. Check every configured window without paying for each. |
| C7 | Checkout interruption and completed-cart recovery | Abandon checkout, return, and complete once. Exactly one paid order results, with the saved delivery date/window/timezone visible on physical board lines and no reservation product. After purchase, return to the same browser's cart and refresh: show an empty cart, Cart 0 and no delivery calendar or stale-cart error. A new add-to-cart operation starts a usable cart with the correct badge and no prior ingredients or delivery selection. |
| C8 | Discount, if offered | Valid and invalid codes, eligible products, totals, and refund amounts behave correctly. |

**Email acceptance for delivery orders:** both the real customer order-confirmation email and
staff new-order notification show the saved `Delivery date`, `Delivery window`, and
`Delivery timezone` from physical board line properties. Compare these values with checkout and
the Shopify order; gift-card-only and on-tour orders must not show blank delivery labels.

**Additional email acceptance for C3:** both the real customer order-confirmation email and
staff new-order notification show `Serves`, `Board preference`, `Cheeses`, `Meats`, and
`Accompaniments` when supplied, in plain-text and HTML. Compare them with the paid order's line
properties. Empty fields are omitted. Shopify's sample notification preview is not evidence
that real order properties reached either email.

## 2. Tours

| ID | Scenario | Acceptance criteria |
| --- | --- | --- |
| T1 | Public tour for multiple guests | Correct per-person total; seat inventory decreases by guest count; date, actual guest count, pickup preference, contact information and acknowledgments are retained. The real customer and staff emails explicitly show the actual guest count, pickup preference and applicable coordination/waiver next steps. |
| T2 | Public tour with snacks and a board | Correct options, quantities, serving counts, ingredients and totals. Separately sold food fulfilled on a Virginia tour must receive the intended Virginia tax with legitimate Virginia or out-of-state billing. Both real customer and staff emails show the selected snack/sandwich details and board serving count/customizations when supplied. No local-delivery scheduling, blank delivery labels or shipping charge is introduced. |
| T3 | Private tour with fewer than ten guests | Charges one whole-bus booking, records actual guest count and consumes shared ten-seat capacity. Both real customer and staff emails explicitly show the actual guest count, pickup preference, included/selected sandwich details and applicable coordination/waiver next steps. Ten bundle seat components must not imply ten actual passengers. |
| T4 | Shared public/private availability | Buying public seats prevents a whole-bus booking on that date. Buying the bus prevents public-seat purchases on that date. |
| T5 | Last-seat competition | Two browser sessions attempt remaining capacity. Only the permitted quantity can be purchased; the other session receives a useful error. |
| T6 | Invalid booking | Reject zero/over-capacity guests, missing required fields or acknowledgments, blackouts, insufficient notice, and unavailable dates. |
| T7 | Cart independence | Starting a tour booking does not overwrite an existing ordinary delivery cart. |
| T8 | Cancellation and partial refund | Verify money and seat restoration separately. Do not assume refunding money alone reopens seats. |

For both public and private purchases, compare the actual customer and staff notifications
with the Shopify order in plain-text and HTML. Require the tour date, explicit actual guest
count, pickup preference, applicable snack/sandwich details and phone-coordination/waiver next
steps. Require board serving counts and customizations when present, and no empty delivery
labels. Bundle quantities are inventory components, not a substitute for actual guest count.
Do not treat a sample notification preview or one tour type as evidence for both types.

Verify tour follow-up emails, waiver instructions, and staff handling separately. A displayed
policy or recorded acknowledgment does not by itself establish signed-waiver collection.
See [migration verification](../MIGRATION.md#verification-needed-before-full-cutover).

## 3. Gift cards

| ID | Scenario | Acceptance criteria |
| --- | --- | --- |
| G1 | Buy for yourself | Correct denomination, issuance, usable code/link, and buyer emails. No delivery window or shipping requirement. |
| G2 | Send immediately to another recipient | Buyer receives order confirmation; recipient receives gift card with correct name, message, and value. |
| G3 | Scheduled-send handoff | The chosen future date, recipient and message survive cart/checkout/order, and the actual buyer receipt identifies the selected send date. Check no immediate recipient message is observed. Waiting for Shopify's future send is optional native-service verification, outside the Astro release gate. |
| G4 | Gift card plus physical board | Delivery is required for board; gift-card recipient settings remain intact. |
| G5 | Remove the physical board | Remaining gift-card-only cart drops delivery metadata and delivery requirements, including any legacy reservation line. |
| G6 | Partial redemption | Purchase below card balance; verify remaining balance. |
| G7 | Gift card plus credit card | Purchase above remaining balance; verify split payment and final card balance. |
| G8 | Redeem against a tour | Gift card works for intended tour checkout as well as charcuterie. |
| G9 | Refund/cancellation | Verify where each payment portion returns and what happens to issued or redeemed gift-card balances. Do not assume canceling the original purchase disables an issued card. |

Check every denomination on the product page. Purchasing every amount is unnecessary when
they use the same issuance path. Keep gift-card codes and recipient details in private evidence.

## 4. Custom requests and operations

Custom-board integration acceptance ends at **request → actual staff email → usable staff
helper/prompt**. The form must not create a draft order or require Shopify credentials. Staff
may later quote and invoice in Shopify; that native manual workflow and payment are optional
operational checks, outside the Astro release gate.

| ID | Scenario | Acceptance criteria |
| --- | --- | --- |
| CB1 | Submit a valid custom request | The actual staff email reaches `allaboardva.tours.charcuterie@gmail.com` with a request reference and every submitted contact, requested date, address/ZIP, guest count, budget, dietary, theme and notes value. Reply-To is the customer; sender and recipient are server-owned. Optional blank fields are clear. The visitor sees only a request-sent-for-review confirmation after provider acceptance. No Shopify draft/order, invoice or reservation is created. |
| CB2 | Staff invoice helper and optional Sidekick prompt | The link in the received staff email opens the intended store's blank new draft-order editor after normal staff authentication. It contains no customer data in its URL and creates/sends nothing on click. Verify the copyable Sidekick prompt includes the exact reference and submitted details in a JSON data block, treats customer text only as data and the budget only as guidance, and requires availability, final prices, delivery date/window, fees and taxes to be confirmed before staff save or send. The website must not execute the prompt. Inspecting its content is sufficient for this check; executing Sidekick is optional and not required for QA. |
| CB3 | Optional manual Shopify workflow | Outside the Astro release gate. Staff may review availability and agree price/date/window/fees/taxes, prepare a draft and send a native Shopify invoice. No additional invoice payment is required for this site's acceptance. Discard unsaved QA work; the public request must still create no draft or invoice. |
| CB4 | Email service unavailable | Missing configuration, provider rejection, timeout or network failure produces a safe retry/contact error, preserves the entered request and never falsely reports success or exposes provider/credential details. No Shopify draft/order exists as a fallback. |
| CB5 | Validation, consent and spam protection | Reject missing/invalid required fields and consent; verify same-origin checks, BotID Basic, rate limiting and the spam trap prevent unwanted email. BotID failure/outage must not send the request. Direct unverified Production POST is rejected. |
| CB6 | Repeat/retry and staff handling | Check an unchanged retry and double submit do not produce unintended duplicate work; references remain usable for staff reconciliation. Replies go to the customer. Verify there are no automated draft-order tags/Flow dependencies for request intake. |

Continue with the operational checks below:

- [ ] Complete a full cancellation/refund with intentional restocking.
- [ ] Partially refund a board or add-on while keeping the tour intact.
- [ ] Verify the actual local-delivery completion notification used by staff.
- [ ] Open order-status links from customer emails on desktop and mobile.
- [ ] Verify staff notifications and that preparation and booking details are easy to find.
- [ ] Confirm the integration's checkout handoff preserves items, totals and required properties; native payment-method/processor testing is excluded.
- [ ] Verify applicable taxes against approved business configuration.

## Focused continuation run

The November 21 continuation uses completed orders to cover changed integration paths; see
[the results](transactional-test-results-2026-11-21.md) for observed passes and remaining gaps.
Do not create more payments for Shopify-native invoice, wallet, processor or settlement tests.

| Run | Combined integration coverage | Evidence required |
| --- | --- | --- |
| R1 | Multi-size/quantity/build-your-own delivery plus self and scheduled-recipient gift cards | C2–C4, G3/G4, both actual emails, physical-line delivery/customization properties, selected future send date in the buyer receipt, and same-browser completed-cart recovery (C7). No need to wait for the native scheduled send before controlled gift cleanup. |
| R2 | Nine-seat public tour with a board, then two independent sessions competing for the final seat | T1/T2/T4/T5, actual guests/pickup/snack/board properties and both actual emails; one final-seat winner and one useful unavailable outcome without a second order. Record current inventory before/after and cleanup; do not reduce stock just to manufacture a race. |
| R3 | Private tour for fewer than ten actual guests with its included sandwich option | T3/T4, whole-bus price, explicit actual guest count rather than bundle component count, pickup/sandwich/next-step details in both actual emails, and shared-capacity restoration after cancellation. |
| R4 | Custom-request email and staff helper/prompt | CB1/CB2 and no automatic draft. A native invoice/payment is not required. Discard any unsaved exploratory draft and verify the original draft list is preserved. |
| R5 | Restrictions, recovery and tax setup without more payments | C5/C6/C8/T6 and CB4–CB6 where relevant: ingredient bounds, Virginia-only delivery/ZIP, windows, notice/blackout/horizon, cart edits, invalid booking and acknowledgment fields, existing discount rules, order-status links and actual local-delivery notification. Tax verification uses checkout estimates and authoritative expected treatment. |

Perform remaining input/boundary checks without payment. Record desktop/mobile and returning
customer coverage only when actually exercised. Discounts are relevant only if offered; use
existing business rules rather than introducing a new broad discount. The external waiver
follow-up process is an operational responsibility separate from recorded acknowledgments.

For the on-tour food sourcing fix, repeat the same unpaid checkout with Virginia, Maryland and
DC billing addresses. Under the current 11% prepared-food configuration, a $59 board must have
$6.49 Virginia food tax in all three cases; the tour-service fee remains exempt. Preserve each
buyer's genuine billing address and introduce no home delivery or public-pickup requirement.

Tax correctness still requires the business facts and actual checkout estimates: intended
Virginia-only delivery/tour service, Arlington preparation, registered Virginia collection,
non-taxable tour service versus separately sold prepared food. The active DC delivery zone
and matching schedule ZIPs conflict with the intended service area and remain unresolved.
A displayed zero is not approval.
See [Virginia tax maintenance](virginia-tax-maintenance.md) for saved configuration, actual
unpaid estimates and the failed on-tour food/DC-billing case, which remains an integration
blocker. Scheduled-send date handoff is required;
waiting for Shopify's future delivery is outside this integration gate.

## Cleanup and release gate

- [ ] Record all test order numbers, charges, refunds, and remaining gift-card balances.
- [ ] Cancel/refund designated orders and intentionally restore the correct tour capacity.
- [ ] Confirm inventory returns to the expected baseline, accounting for legitimate concurrent bookings.
- [ ] Resolve remaining test gift-card liabilities through the appropriate Shopify workflow.
- [ ] Close only staff-created test drafts and abandoned operational tasks; reconcile request emails/references without removing required audit records. The public custom-board form creates no draft to clean up.
- [ ] Remove temporary test discounts or settings; ensure live payment mode is restored if changed.
- [ ] Confirm no unintended fulfillment or scheduled recipient emails remain pending.
- [ ] Recheck storefront availability after cleanup.

Release requires correct integration handoff for each purchase family, actual customer/staff
emails, no overbooking, cart recovery, verified inventory restoration and no active QA gift
liabilities. Track submitted refund status for cleanup; native processor settlement is not an
Astro launch gate. Native manual invoice payment and future scheduled-send execution are also
outside that gate. Record unresolved integration failures and retest affected changes.

## References

- [Shopify implementation and verification runbook](../SHOPIFY.md)
- [Content management and serving-size ownership](content-management.md)
- [Migration and remaining cutover verification](../MIGRATION.md)
- [Shopify: Processing a test order](https://help.shopify.com/en/manual/checkout-settings/test-orders/processing-test-order)
- [Shopify: Testing Shopify Payments](https://help.shopify.com/en/manual/payments/shopify-payments/testing-shopify-payments)
- [Shopify: Creating draft orders](https://help.shopify.com/en/manual/fulfillment/managing-orders/create-orders/create-draft)
- [Shopify: Sending draft-order invoices](https://help.shopify.com/en/manual/fulfillment/managing-orders/create-orders/send-draft)
