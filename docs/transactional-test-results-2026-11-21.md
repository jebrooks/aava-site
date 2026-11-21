# Transactional test results — November 21, 2026

**The full [transactional test plan](transactional-test-plan.md) is not complete.** This run
has covered delivery and customized-board checkout, declined-payment recovery, gift-card
issuance/redemption, and public/private tour purchases. Several email and operational gaps
remain. It is not full release acceptance.

## Environment and evidence

- Initial storefront review: PR [#49](https://github.com/jebrooks/aava-site/pull/49), commit
  `2dd8bb34667daaec4da81a8e46ac095c630ce812`, on its Vercel preview. Local UI review used
  `http://127.0.0.1:4330`. Orders #1005 onward used Production at
  `https://aava-site.vercel.app`, commit `f040dfbfcf4120286ad96efa5d7c3beaa696fe17`.
- Shopify: shared `allaboardva` store, with Shopify Payments test mode already enabled by the
  owner. The test-mode banner was confirmed in Admin. Simulated cards were used; this run did
  not use a real card or verify live payment processing.
- Test orders: **#1003–#1008**. Tests used controlled business email aliases and QA names
  explicitly marked not to fulfill. Gift-card codes and authenticated gift-card links remain
  private and are not recorded here.
- Verification compared checkout/confirmation content, the Shopify order, and actual received
  buyer and staff emails. Both plain-text and HTML MIME bodies were checked. Private email
  links, customer contact/address details, and payment credentials are excluded from this report.

## Results and coverage boundaries

| Area | Result | Verified scope and remaining boundary |
| --- | --- | --- |
| Delivery checkout | Pass for tested selections; plan coverage partial | #1003 and #1004 each purchased one Small / Delivery Quick Pick board, serving 4, at $59 plus $5 local delivery, total $64. Selected November 23, 2026, 1:00–3:00 PM, America/New_York appeared as board line properties in checkout and the confirmation page. No reservation product was added. Other sizes, multiple-board quantities, and combinations remain untested. |
| Delivery email content | Initial failure corrected and retested | Both #1003 emails omitted delivery date/time. Shopify's customer Order confirmation and staff New order templates were edited. For #1004, both received emails contain `Delivery date: 2026-11-23`, `Delivery window: 1:00–3:00 PM`, and `Delivery timezone: America/New_York` in plain-text and HTML. The buyer email still shows `Serves: 4`; the Shopify order matches. This is actual-purchase evidence, not a sample preview. |
| Declined card and retry | Pass for tested card path | A simulated declined card showed a useful rejection. Retrying with the successful simulated card produced confirmed order #1003. Other payment methods, authentication challenges, returning-customer checkout, and live payments remain untested. |
| Delivery capacity | Partial | Both verification orders selected the same delivery date/window without a reservation line. This is a limited repeated-order check, not exhaustive validation of every window or boundary. |
| Customized board (C3) | Buyer email and required-selection case passed; staff email gap | #1007 purchased a Small build-your-own board for $59 plus $5 delivery, fully paid with gift-card value. Actual buyer email retained Serves: 4, Board preference: With meat, Cheeses: Brie; Cheddar, Aged, Meats: Prosciutto, and Accompaniments: Honey; Olives; Fresh Baguette; Dried Figs; Fresh Apples. All three delivery fields matched November 23, 1:00–3:00 PM. Staff email retained delivery fields but omitted serving count, board preference, and all ingredients in both plain-text and HTML. An empty-ingredient attempt was rejected with `Choose 1–2 cheeses`; full invalid-choice and maximum-limit browser cases remain untested. |
| Cart and delivery restrictions (C5–C7) | Partial; post-purchase cart failure found | The tested cart carried its date/time into checkout. Choosing a time before a ZIP correctly prompted for the ZIP; entering 22205 then auto-saved. Unsupported ZIP 99999 was rejected. Full cart-edit/refresh/interruption cases, notice/horizon boundaries, every window, and blackout enforcement have not all been exercised in this browser run. |
| Returning to the cart after purchase | Failed; workaround observed, not fixed | After completed #1007, Production `/cart` displayed `Cart not found.`, retained a stale Cart 1 badge, and rendered the delivery calendar despite having no items. Adding a new Quick Pick through the UI recovered the cart. That temporary item was then removed; the final cart was empty with Cart 0. This workaround does not resolve the post-purchase cart/session bug. |
| Cancellation/refund/restock | Tested inventory and gift-card recovery passed; simulated card settlements pending | #1003/#1004/#1006/#1007/#1008 were canceled with intentional restocking where applicable. Both tour dates returned to their original 10 public seats / 1 bus. #1007's $64 refund to the original gift card completed; #1008 returned its $61 gift-card portion. The #1005 purchase's full $175 refund was submitted and both issued cards were verified deactivated. Simulated credit-card refunds remain pending at their last observations; see cleanup details below. No orders were permanently deleted. |
| Tax and discounts | Not validated | The tested checkout displayed $0 tax. This was observed, not approval of business tax configuration. Valid/invalid discounts and refund calculations remain untested. |
| Private tour and shared inventory (T3/T4) | Tested path passed; emails incomplete | #1006 booked December 2 for two actual guests at the flat $1,250 whole-bus price, with $0 shipping. Baseline was 10 public seats / 1 private bus. After purchase both became unavailable with 0 remaining. A brief initial bundle-availability propagation delay resolved on recheck. After cancellation with restocking, Production returned to 10 public seats / 1 bus. This was verified through the live availability endpoint, separately from refund status. |
| Public tour with board (T1/T2/T4) | Tested checkout and restocking passed; email gaps remain | #1008 purchased two December 1 public seats ($250) plus a Small Quick Pick board ($59), total $309 with $0 shipping. Payment used $61 gift-card value plus a $248 simulated card payment. The buyer email retained the board serving count. Before cancellation, Production availability changed from 10 public seats / 1 bus to 8 public seats / 0 buses. Full cancellation/restocking then restored 10 public seats / 1 bus. No delivery-date/window fields or shipping-address section appeared. |
| Board-only partial refund, tour retained (T8/operations) | Tested inventory separation and gift-card restoration passed | #1008's $59 board was refunded to the original gift card with board restocking selected. Admin showed Partially refunded, with only two tour seats unfulfilled for $250. A separate Production availability check still showed 8 public seats / 0 private buses for December 1, proving this board refund did not release the tour seats. The remaining $2 gift-card portion returned on full cancellation; the balance page then showed the original $61 restored. The separate $248 simulated-card refund remains pending. |
| Tour email content | Gap confirmed | Buyer and staff emails for #1006/#1008 identify the date in the tour product title, but omit explicit actual guest count, pickup preference, snack/sandwich details, and phone-coordination/waiver next steps. #1006 buyer email lists ten public-seat bundle components, which could be confused with actual passengers without an explicit two-guest field. Staff #1008 email also omits the board serving count. The tested Production commit had no region selector and no region preference was supplied, so region content was not an email acceptance item for these orders. |
| Tour/cart independence (T7) | Tested path passed | The ordinary $175 gift-card cart for #1005 remained intact while tour checkout was created separately. Starting the tour flow did not overwrite that ordinary cart. |
| Gift-card purchase/issuance (G1/G2) | Tested paths passed | #1005 purchased a $125 card for the buyer and a $50 card sent immediately to a controlled recipient, total $175. Buyer confirmation, staff notification, self gift-card email, recipient gift-card email, and buyer recipient receipt all arrived. Correct values, recipient name and exact message were verified. Gift emails contain codes and gift-card links; code/link presence alone was not treated as redemption proof. No delivery fields or shipping-address section appeared; generic shipping was $0. |
| Gift-card redemption (G6/G7/G8) | Tested payments and gift-card refund recovery passed | #1007 redeemed $64 against the $125 buyer card; its balance page was verified at $61 afterward. #1008 then applied $61 toward a tour/board purchase with a $248 simulated-card remainder. Actual buyer email shows both payment portions and the $309 total. Canceling #1008 restored $61 to the original gift card; canceling #1007 then restored the other $64, returning the buyer card to $125. Staff #1008 email includes the amounts but does not label the gift-card payment clearly. |
| Gift-card purchase refund/deactivation (G9) | Tested native path passed; simulated-card refund pending | The full $175 refund for #1005 was submitted. Shopify's gift-card list then showed both issued cards Deactivated, with restored balances $125 of $125 and $50 of $50. In this tested native refund flow Shopify deactivated the cards automatically; no manual deactivation was needed. No active test gift cards remain. This observed result must not replace checking card status in future refund cases. |
| Mixed gift/board cart and last-board removal (G4/G5) | Tested cart path passed; mixed paid purchase not completed | A cart containing two recipient gift-card lines plus a physical board required a delivery ZIP/window. Removing the last board cleared delivery requirements and retained both gift-card recipient lines. This verifies the observed cart transition; a completed mixed physical/gift order and its emails were not tested. |
| Remaining gift-card scenarios | Not completed | Scheduled recipient delivery (G3) remains untested. The mixed-cart behavior above was inspected before payment, not through a mixed-order purchase. |
| Previous automatic custom-request draft flow | Historical failure; superseded by email intake | The tested Production form failed with Shopify access denied for `draftOrderCreate`; no draft was created, and the raw internal permission error reached the customer. On November 21 the owner directed that requests email the business instead, with no automatic draft. The replacement request-email and staff invoice-helper flow is pending deployment and live verification under CB1–CB6 in the updated plan. No app-permission expansion is required for that form. |
| Other operations | Not completed | Delivery-completion notification, remaining recovery scenarios, and intended alternative payment methods still require end-to-end testing. |

The delivery-template diff retained existing serving/ingredient and gift-card handling. The
buyer template's four existing property lists now also allow the three delivery keys. The
staff template displays nonblank delivery properties per order line only when a delivery date
or window exists. The subsequent gift-card-only, on-tour, bundled, and customized-board emails
confirmed delivery-label omission where appropriate and exposed the additional gaps above.

## Automated validation

All six relevant local suites passed: `test:cart` 32, `test:boards` 7, `test:booking` 23,
`test:tours` 14, `test:forms` 7, and `test:blackouts` 3: **86 tests, zero failures**. These use
local fixtures/mocked Shopify services, with no external Shopify writes. They cover ingredient
and registration validation, recipient/date mapping, cart preservation, blackout checks, and
tour synchronization rules; they do not replace actual checkout/email/inventory evidence.

## Historical custom-request failure details

At the tested Production commit, the API called `createCustomBoardDraft` and returned success
only after Shopify returned a draft. It sent no separate request email. The failed request
therefore saved no draft and sent no draft-based staff notification or invoice. The GraphQL
access error was returned unchanged through `ShopifyApiError`/`apiError` and displayed to the
customer. The missing scope explained that former implementation's failure; adding it is not
part of the replacement email-only intake workflow below.

### November 21, 2026 — owner-directed replacement workflow

Custom-board requests are being changed to email `allaboardva.tours.charcuterie@gmail.com`
through Resend, with the customer as Reply-To and all request details plus a reference. The
form will create no Shopify draft, invoice, order or reservation and needs no Shopify credentials.
The staff-only helper link opens Shopify's blank new draft-order editor, without customer data
in the URL; staff must review availability and price, enter the agreed delivery details, and
manually prepare/send any invoice. Clicking the link alone saves or sends nothing.

The owner also approved an optional copyable Sidekick prompt in the staff email. It carries the
request reference and submitted details in a JSON data block, treats customer fields as data
and the budget as guidance, and requires staff to confirm availability, final prices, delivery
date/window, fees and taxes before saving or sending. Staff may paste it into Shopify to prepare
an unsaved draft, then review it; the website does not run it or create a draft. Inspection of the
received prompt is part of CB2; executing Sidekick is not a required QA step.

The updated plan separates actual request-email receipt (CB1), helper-link/prompt behavior (CB2),
manual invoice/payment (CB3), provider failures (CB4), validation/spam controls (CB5) and retry/staff
handling (CB6). This section records the changed requirement, not a passed live test. Deployment,
received-email verification and the new manual invoice path remain pending.

## Final cleanup observation

| Test order | Verified cleanup | Remaining settlement boundary |
| --- | --- | --- |
| #1003 | Canceled; fulfillment not required; restocking selected | $64 simulated-card refund pending at last observation |
| #1004 | Canceled; fulfillment not required; restocking selected | $64 simulated-card refund pending at last observation |
| #1005 | Full $175 purchase refund submitted; both issued cards verified Deactivated at full restored balances ($125/$50) | $175 simulated-card refund pending |
| #1006 | Canceled; fulfillment not required; December 2 restored to 10 public seats / 1 bus | $1,250 simulated-card refund pending |
| #1007 | Canceled, Refunded, fulfillment not required, archived; $64 returned to original gift card | Gift-card refund completed |
| #1008 | Canceled; fulfillment not required; $61 gift-card value returned ($59 board partial refund + $2 final); December 1 restored to 10 public seats / 1 bus | $248 simulated-card refund pending |

No test gift cards remain active, and neither tested tour date remains reserved by this run.
Existing orders **#1001 and #1002 were left unchanged**. No production prices, schedules,
permissions, or payment-mode settings were changed. Pending simulated-card settlement is
recorded separately from verified inventory and gift-card restoration.

## Outstanding acceptance work

- Resolve the staff customized-board email and customer/staff tour email gaps, then repeat
  affected actual notifications.
- Fix and retest the post-purchase `Cart not found.`/stale badge/calendar behavior.
- Verify final simulated-card refund settlements for #1003/#1004/#1005/#1006/#1008. Inventory,
  gift-card refunds, restored balances, and issued-card deactivation were verified separately.
- Complete last-seat competition (T5), full multi-size combinations (C2), multiple-board/quantity
  cases (C4), invalid booking/cart/browser boundary cases, scheduled gift delivery (G3), and
  a completed mixed physical/gift purchase. The selected mixed-cart/removal transition (G4/G5)
  has passed at the cart stage.
- Verify the replacement emailed custom request and staff invoice helper (CB1–CB6), then the
  manually created Shopify invoice/payment and actual emails. Do not add draft-order app access
  to restore the retired automatic draft workflow.
- Complete the delivery-completion notification and intended alternative payment methods.
  Business tax correctness still requires approval.

Record each result separately. Verified purchase paths do not establish full-plan completion.

Shopify test mode was not changed by this run. The email-template edits are Shopify settings
changes and do not require a Vercel deployment. Maintenance requirements are in
[Content management](content-management.md#delivery-schedule--delivery_scheduledefault).
