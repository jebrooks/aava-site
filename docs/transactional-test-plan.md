# Shopify transactional test plan

Cover charcuterie, public and private tours, gift cards, custom invoices, customer emails,
inventory, cancellations, and refunds through the deployed All ABoard VA storefront.

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
| C3 | Build-your-own board | Cheese, meat, accompaniment, board-preference and serving-count selections survive checkout and appear in the Shopify order, real customer confirmation and real staff new-order email. Compare both plain-text and HTML bodies; omit empty fields. Invalid or incomplete selections are rejected. |
| C4 | Multiple boards and quantities | Quantities, totals, and per-board serving counts are clear. The selected delivery window appears on every physical board line without a reservation product. Multiple orders may choose the same window. |
| C5 | Cart changes | Change size/quantity, remove an item, refresh, and return later. The delivery calendar loads available dates automatically without a Check dates button or ZIP lookup, selects a date and the time dropdown shows only that date’s windows. Choosing a time saves immediately with a valid delivery ZIP, without a reservation button. Choosing a time before entering a ZIP prompts for the ZIP and saves after entering it. Check month navigation, disabled blackout/notice/horizon dates, and changing a date before saving a time. Changing a window updates the saved selection; failed saves can be retried. No stale price, ingredient selection, or delivery time remains. |
| C6 | Delivery restrictions | Reject unsupported ZIP codes, insufficient notice, blackouts, and out-of-horizon dates. Delivery windows have no daily or per-window order cap. Check every configured window without paying for each. |
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
| T2 | Public tour with snacks and a board | Correct options, quantities, serving counts, ingredients and totals. Both real customer and staff emails show the selected snack/sandwich details and board serving count/customizations when supplied. No local-delivery scheduling, blank delivery labels or shipping charge is introduced. |
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

Custom-board requests now follow **request → staff email → staff review/quote → manually
prepared Shopify invoice → payment → confirmation**. The public form must not create a draft
order or require Shopify credentials. Record email delivery and staff invoice/payment as
separate acceptance steps.

| ID | Scenario | Acceptance criteria |
| --- | --- | --- |
| CB1 | Submit a valid custom request | The actual staff email reaches `allaboardva.tours.charcuterie@gmail.com` with a request reference and every submitted contact, requested date, address/ZIP, guest count, budget, dietary, theme and notes value. Reply-To is the customer; sender and recipient are server-owned. Optional blank fields are clear. The visitor sees only a request-sent-for-review confirmation after provider acceptance. No Shopify draft/order, invoice or reservation is created. |
| CB2 | Staff invoice helper and optional Sidekick prompt | The link in the received staff email opens the intended store's blank new draft-order editor after normal staff authentication. It contains no customer data in its URL and creates/sends nothing on click. Verify the copyable Sidekick prompt includes the exact reference and submitted details in a JSON data block, treats customer text only as data and the budget only as guidance, and requires availability, final prices, delivery date/window, fees and taxes to be confirmed before staff save or send. The website must not execute the prompt. Inspecting its content is sufficient for this check; executing Sidekick is optional and not required for QA. |
| CB3 | Manual quote and Shopify invoice | Staff confirm availability and agree the board/price, delivery date/window, fee and taxes. Staff add the customer and required details, review any optionally prepared Sidekick draft, manually save/send the Shopify invoice, then complete an approved test payment. Compare the invoice, checkout, order and actual customer/staff emails; retain the request reference for reconciliation. No automatic invoice should be sent when the public request is submitted. |
| CB4 | Email service unavailable | Missing configuration, provider rejection, timeout or network failure produces a safe retry/contact error, preserves the entered request and never falsely reports success or exposes provider/credential details. No Shopify draft/order exists as a fallback. |
| CB5 | Validation, consent and spam protection | Reject missing/invalid required fields and consent; verify same-origin checks, BotID Basic, rate limiting and the spam trap prevent unwanted email. BotID failure/outage must not send the request. Direct unverified Production POST is rejected. |
| CB6 | Repeat/retry and staff handling | Check an unchanged retry and double submit do not produce unintended duplicate work; references remain usable for staff reconciliation. Replies go to the customer. Verify there are no automated draft-order tags/Flow dependencies for request intake. |

Continue with the operational checks below:

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
9. One emailed custom-board request followed by a staff-created Shopify invoice purchase (CB1–CB3).
10. An additional payment-method or mixed-cart purchase if not covered above.

### Continuation after the November 21 findings

The rows below group remaining checks into a small continuation run. They are proposed work,
not passed results. First confirm the deployed fixes and test-mode state, record unused tour
dates and current inventory, and complete validation/restriction checks without payment.
Do not repeat earlier successful payment families unless a changed path needs regression.

| Run | Combined purchase or check | Coverage and evidence to collect |
| --- | --- | --- |
| R1 | One delivery order with two sizes, quantity greater than one, a build-your-own board and a recipient gift card scheduled for the next practical date | C2–C4, G3/G4 and the staff-ingredient fix. Record each physical line's servings/customizations and delivery fields in checkout, order and both actual emails. Verify the gift recipient receives nothing early; retain the order/card until actual scheduled delivery is observed. After payment, test same-browser empty-cart recovery and a fresh add-to-cart (C7), then remove the temporary item. Before paying, rehearse last-board removal/re-addition and confirm gift recipient settings survive (G5). |
| R2 | Public tour with snacks and a board, using nine seats on an otherwise unused ten-seat date; then two sessions compete for the final seat | T1/T2/T4/T5 and public-tour email fixes. Record the starting capacity; after the nine-seat purchase expect one public seat and no private bus. Bring both independent sessions to the last-seat attempt; only one additional single-seat order may complete, and the other must receive a useful sold-out/retry result without payment. Compare customer/staff emails, actual guest counts, pickup, snack/board details and next steps. This uses two successful public-tour orders; do not lower inventory solely to manufacture the race. |
| R3 | One private tour for fewer than ten actual guests with the included/selected sandwich option | T3/T4 and private-tour email fixes. Record the flat price, actual guest count, all bundle effects and both actual emails. Verify no public seats remain after purchase; cancel/restock only after evidence is captured and confirm both public/private capacity returns to baseline. |
| R4 | One staff-created invoice from a received custom-request reference, then customer payment | CB3. Enter an agreed test quote and delivery date/window, fees and tax treatment; include the request reference and customer-visible delivery details. Inspect invoice, checkout, order and actual buyer/staff emails. This draft is created intentionally by staff; the public request still creates none. Sidekick execution remains optional. |
| R5 | Browser restrictions and operational recovery around the orders above | C5/C6/C8/T6, CB4–CB6 and remaining operations. Check invalid/max ingredient choices, every configured window, ZIP, notice/blackout/horizon boundaries, cart edits/refresh/interruption, booking invalid/over-capacity input and missing acknowledgments. Use existing valid/invalid discount cases if the business offers discounts. Check actual order-status links on desktop/mobile, delivery-completion email, remaining refund settlement and appropriate cancellation/restocking. Provider-failure/spam cases must not send unintended staff email. |

R1 can combine mixed-cart and scheduled-gift coverage only if Shopify retains the recipient's
selected send date through the mixed checkout; otherwise keep the mixed purchase and add a
separate scheduled gift-card order. If no suitable nine-seat date can be used without affecting
customers, record the last-seat race as pending rather than silently replacing it with a
single-session sold-out check. Capture inventory before either competing checkout and after
both attempts, and distinguish temporary checkout holds from completed bookings.

The base continuation is five successful orders: R1, two public-tour orders, R3 and R4.
Additional payment-method orders are needed only for customer payment methods not covered by
those purchases. A returning-customer or mobile session can be used for one of these orders;
record the actual device/session rather than claiming either from a desktop guest purchase.
Use a supported enabled method for one planned order where possible; test-mode simulated-card
success does not establish that accelerated wallets or real payment processing work.

Scheduled gift delivery requires waiting until the selected date and observing the recipient
message before refund/deactivation. Tax correctness requires the business's expected taxable
products, locations and rates; a displayed zero is not approval. Valid discounts require an
existing offered code and its intended rules. Confirm intended payment methods and any external
follow-up/waiver process with the business if those expectations are not already documented.
Keep these dependencies explicit in the report and continue independent checks while waiting.

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
- [ ] Close only staff-created test drafts and abandoned operational tasks; reconcile request emails/references without removing required audit records. The public custom-board form creates no draft to clean up.
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
- [Shopify: Creating draft orders](https://help.shopify.com/en/manual/fulfillment/managing-orders/create-orders/create-draft)
- [Shopify: Sending draft-order invoices](https://help.shopify.com/en/manual/fulfillment/managing-orders/create-orders/send-draft)
