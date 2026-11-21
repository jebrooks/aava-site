# Shopify transactional test plan

Cover charcuterie, public and private tours, gift cards, custom invoices, customer emails,
inventory, cancellations, and refunds through the deployed All ABoard VA storefront.

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

The owner is comfortable funding real purchases from a personal credit card to the business
account. Limit redundant transactions because processing fees may remain after refunds.
Shopify supports both simulated transactions and real purchases followed by cancellation and
refund; see [Shopify test-order guidance](https://help.shopify.com/en/manual/checkout-settings/test-orders/processing-test-order).

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
| C3 | Build-your-own board | Cheese, meat, accompaniment, and board-preference selections survive checkout and appear in the order and confirmation email. Invalid or incomplete selections are rejected. |
| C4 | Multiple boards and quantities | Quantities, totals, and per-board serving counts are clear. The selected delivery window appears on every physical board line without a reservation product. Multiple orders may choose the same window. |
| C5 | Cart changes | Change size/quantity, remove an item, refresh, and return later. The delivery calendar loads available dates automatically without a Check dates button or ZIP lookup, selects a date and the time dropdown shows only that date’s windows. Choosing a time saves immediately with a valid delivery ZIP, without a reservation button. Choosing a time before entering a ZIP prompts for the ZIP and saves after entering it. Check month navigation, disabled blackout/notice/horizon dates, and changing a date before saving a time. Changing a window updates the saved selection; failed saves can be retried. No stale price, ingredient selection, or delivery time remains. |
| C6 | Delivery restrictions | Reject unsupported ZIP codes, insufficient notice, blackouts, and out-of-horizon dates. Delivery windows have no daily or per-window order cap. Check every configured window without paying for each. |
| C7 | Checkout interruption | Abandon checkout, return, and complete once. Exactly one paid order results, with the saved delivery date/window/timezone visible on physical board lines and no reservation product. |
| C8 | Discount, if offered | Valid and invalid codes, eligible products, totals, and refund amounts behave correctly. |

**Email acceptance for C3:** the real order-confirmation email shows `Serves`, `Board preference`,
`Cheeses`, `Meats`, and `Accompaniments` when supplied. Empty fields are omitted. Shopify's sample
notification preview is not evidence that real order properties reached the email.

## 2. Tours

| ID | Scenario | Acceptance criteria |
| --- | --- | --- |
| T1 | Public tour for multiple guests | Correct per-person total; seat inventory decreases by guest count; date, passenger count, pickup, contact information, and acknowledgments are retained. |
| T2 | Public tour with snacks and a board | Correct options, quantities, serving counts, ingredients, and totals. No local-delivery scheduling or shipping charge is introduced. |
| T3 | Private tour with fewer than ten guests | Charges one whole-bus booking, records actual passenger count, and consumes shared ten-seat capacity. |
| T4 | Shared public/private availability | Buying public seats prevents a whole-bus booking on that date. Buying the bus prevents public-seat purchases on that date. |
| T5 | Last-seat competition | Two browser sessions attempt remaining capacity. Only the permitted quantity can be purchased; the other session receives a useful error. |
| T6 | Invalid booking | Reject zero/over-capacity guests, missing required fields or acknowledgments, blackouts, insufficient notice, and unavailable dates. |
| T7 | Cart independence | Starting a tour booking does not overwrite an existing ordinary delivery cart. |
| T8 | Cancellation and partial refund | Verify money and seat restoration separately. Do not assume refunding money alone reopens seats. |

Check whether the customer confirmation provides enough trip information, including date,
passenger count, pickup, and next steps. The recent email-template change covers board counts
and ingredients; it does not establish that all tour details appear in the email.

Verify tour follow-up emails, waiver instructions, and staff handling separately. A displayed
policy or recorded acknowledgment does not by itself establish signed-waiver collection.
See [migration verification](../MIGRATION.md#verification-needed-before-full-cutover).

## 3. Gift cards

| ID | Scenario | Acceptance criteria |
| --- | --- | --- |
| G1 | Buy for yourself | Correct denomination, issuance, usable code/link, and buyer emails. No delivery window or shipping requirement. |
| G2 | Send immediately to another recipient | Buyer receives order confirmation; recipient receives gift card with correct name, message, and value. |
| G3 | Schedule delivery | Buyer confirmation arrives immediately; recipient delivery waits until selected date. Test a near-future date and observe actual delivery. |
| G4 | Gift card plus physical board | Delivery is required for board; gift-card recipient settings remain intact. |
| G5 | Remove the physical board | Remaining gift-card-only cart drops delivery metadata and delivery requirements, including any legacy reservation line. |
| G6 | Partial redemption | Purchase below card balance; verify remaining balance. |
| G7 | Gift card plus credit card | Purchase above remaining balance; verify split payment and final card balance. |
| G8 | Redeem against a tour | Gift card works for intended tour checkout as well as charcuterie. |
| G9 | Refund/cancellation | Verify where each payment portion returns and what happens to issued or redeemed gift-card balances. Do not assume canceling the original purchase disables an issued card. |

Check every denomination on the product page. Purchasing every amount is unnecessary when
they use the same issuance path. Keep gift-card codes and recipient details in private evidence.

## 4. Custom requests and operations

- [ ] Complete one custom-board request through request → Shopify draft → staff pricing and
  agreed delivery window → invoice email → payment → confirmation.
- [ ] Complete a full cancellation/refund with intentional restocking.
- [ ] Partially refund a board or add-on while keeping the tour intact.
- [ ] Verify the actual local-delivery completion notification used by staff.
- [ ] Open order-status links from customer emails on desktop and mobile.
- [ ] Verify staff notifications and that preparation and booking details are easy to find.
- [ ] Complete one successful purchase using each payment method intended for customers.
- [ ] Simulate a declined payment in an isolated test environment; confirm retry works without duplicate orders.
- [ ] Verify applicable taxes against approved business configuration.

## Suggested paid run and fee control

Target approximately **8–10 completed orders**, combining compatible scenarios:

1. Several board types/sizes, including build-your-own, in one delivery order.
2. Public tour with multiple guests and add-ons.
3. One private tour with fewer than ten passengers.
4. Gift card for the buyer.
5. Gift card sent immediately to a controlled recipient.
6. Gift card scheduled for a near-future date.
7. A board purchase using a gift card, with partial or split redemption.
8. A tour purchase using remaining gift-card value where practical.
9. A custom-board invoice purchase.
10. An additional payment-method or mixed-cart purchase if not covered above.

Use purchased gift-card balances toward later tests rather than funding every order again.
Keep the full-price private-tour purchase to one successful transaction because its processing
fee will likely be the largest individual testing cost. Rehearse that path in a separate test
environment first if available. Do not assume balances will move from test mode to live mode.

Do not refund all orders immediately. First capture emails, verify issuance/redemption and
scheduled gift delivery, and observe inventory. Then cancel/refund in a controlled sequence.
Do not change production prices or introduce broad discounts just to reduce testing costs.

## Cleanup and release gate

- [ ] Record all test order numbers, charges, refunds, and remaining gift-card balances.
- [ ] Cancel/refund designated orders and intentionally restore the correct tour capacity.
- [ ] Confirm inventory returns to the expected baseline, accounting for legitimate concurrent bookings.
- [ ] Resolve remaining test gift-card liabilities through the appropriate Shopify workflow.
- [ ] Close test drafts and abandoned operational tasks without removing required audit records.
- [ ] Remove temporary test discounts or settings; ensure live payment mode is restored if changed.
- [ ] Confirm no unintended fulfillment or scheduled recipient emails remain pending.
- [ ] Recheck storefront availability after cleanup.

Release requires a verified end-to-end success for every purchase family, correct customer
emails, no overbooking, and verified cancellation/refund recovery. A successful payment alone
is insufficient. Record unresolved failures and retest affected scenarios after fixes.

## References

- [Shopify implementation and verification runbook](../SHOPIFY.md)
- [Content management and serving-size ownership](content-management.md)
- [Migration and remaining cutover verification](../MIGRATION.md)
- [Shopify: Processing a test order](https://help.shopify.com/en/manual/checkout-settings/test-orders/processing-test-order)
- [Shopify: Testing Shopify Payments](https://help.shopify.com/en/manual/payments/shopify-payments/testing-shopify-payments)
