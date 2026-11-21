# Transactional test results — November 21, 2026

**The full [transactional test plan](transactional-test-plan.md) is not complete.** This run
has covered delivery and customized-board checkout, declined-payment recovery, gift-card
issuance/redemption, and public/private tour purchases. The four reported cart/email findings
subsequently passed actual regressions in the continuation below. Tax and additional boundary
checks remain; this is not full release acceptance.

**Current owner-confirmed scope:** verify our Shopify handoff, item/totals and required
properties, inventory, actual notifications and cart recovery. Native wallet/card-brand,
processor/authentication, refund settlement, manual Shopify invoice payment and waiting for a
future native gift send are outside the Astro release gate. Earlier references to those tests
are historical coverage boundaries, not current launch blockers.

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

This table preserves the original purchase run. Later fixes and additional evidence are
recorded in the continuation section below; an implementation change does not by itself turn
an earlier failed email or browser case into a passed retest.

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
| Previous automatic custom-request draft flow | Historical failure; superseded by tested Preview email intake | The tested Production form failed with Shopify access denied for `draftOrderCreate`; no draft was created, and the raw internal permission error reached the customer. On November 21 the owner directed that requests email the business instead, with no automatic draft. PR #50 Preview subsequently passed actual request submission and staff-email receipt (CB1), with no new Shopify draft; helper and remaining CB1–CB6 boundaries are recorded below. No app-permission expansion is required for that form. |
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

For the replacement custom-request workflow, PR #50 code commit `1543b3b` separately passed all
**16 form tests**, Astro/TypeScript checking and the production build. Its Vercel deployment and
separate Catalog parity check passed. These checks supplement the Preview/email observations
below; they do not establish manual-invoice or full transactional-plan acceptance.

## Historical custom-request failure details

At the tested Production commit, the API called `createCustomBoardDraft` and returned success
only after Shopify returned a draft. It sent no separate request email. The failed request
therefore saved no draft and sent no draft-based staff notification or invoice. The GraphQL
access error was returned unchanged through `ShopifyApiError`/`apiError` and displayed to the
customer. The missing scope explained that former implementation's failure; adding it is not
part of the replacement email-only intake workflow below.

### November 21, 2026 — owner-directed replacement workflow

Custom-board requests now email `allaboardva.tours.charcuterie@gmail.com` through Resend,
with the customer as Reply-To and all request details plus a reference. The form creates no
Shopify draft, invoice, order or reservation and needs no Shopify credentials.
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
handling (CB6). The following Preview observations verify the replacement intake. The owner
subsequently excluded native manual invoice/payment from the site's required QA; its original
CB3 inclusion is retained as historical plan context, not a current acceptance blocker.

### November 21, 2026 — PR #50 Preview email verification

Verified [PR #50](https://github.com/jebrooks/aava-site/pull/50), code commit `1543b3b`, on its
[custom-board request Preview](https://aava-site-git-codex-custom-board-email-jebrooks-projects.vercel.app/custom-board-request).
This used the actual browser form and configured Resend service, followed by inspection of the
received Gmail message and Shopify draft list. No invoice or test payment was created.

| Check | Observed result | Remaining boundary |
| --- | --- | --- |
| CB1: request submission and staff email | Passed for the submitted case. Browser success followed the actual UI submission. Gmail received all 11 submitted values and request reference `cef9ed0a-4710-4e34-aab5-374e55fadcff`. The server-controlled From was `website@allaboardva.com`, To was the business inbox, and Reply-To matched the controlled customer alias. | Other optional-field combinations and retry cases remain separate checks. No private customer values or alias are retained in this report. |
| No automatic Shopify draft | Passed for the submitted case. Shopify's draft list contained the existing #D4 both before and after submission; no new draft appeared. | This request test did not create an invoice, reserve inventory, or execute a payment. |
| CB2: email helper and prompt content | Passed for link opening and received-prompt inspection. The actual email contains the blank-editor Admin URL and the copyable Sidekick JSON prompt with data-only, budget-guidance and review-before-save/send safeguards. The link opened the intended Shopify store's Create order screen with empty products, customer and notes, and a $0.00 total. No invoice was created or sent. | Sidekick execution was not performed; it and native CB3 manual invoice/payment are outside the current site integration gate. |
| CB3: manual quote, invoice and payment | Not performed; subsequently excluded from required site QA by the owner. | Native manual invoicing/payment is optional operations work, not an unresolved Astro acceptance case. |
| CB4: missing email configuration | Passed locally for missing Resend configuration: a safe failure appeared and the entered values were retained. | Local development has no Resend API key/sender configured. Provider rejection, timeout and network-failure browser cases on Preview remain untested. |
| CB5: validation and spam protection | The 16 form tests passed, and the protected Preview browser submission succeeded. | Separate live direct-POST rejection, rate-limit and spam cases have not been established by this successful submission. |
| CB6: repeat/retry and staff handling | Not completed. | Duplicate/retry behavior and actual reply handling remain to be verified. |

Resend configuration names were confirmed present for both Vercel Preview and Production;
the actual email evidence above comes from Preview. The local development server uses this PR
branch but lacks those local email settings, so its controlled missing-configuration result
must not be mistaken for successful email delivery.

## November 21, 2026 — continuation after the four findings

### Implemented fixes and actual purchase regressions

Cart recovery was implemented in commit `0f972c6` and reviewed on its Ready Vercel Preview.
The shared Shopify customer Order confirmation and staff New order templates were saved with
actual guest/tour attributes and coordination/waiver next steps, staff board preparation
properties and explicit payment labels. The new paid orders below exercised those changes.
Shopify Admin showed Test order and the test gateway; the payment settings UI was confirmed in
test mode before these purchases. No live card/wallet/processor acceptance is claimed or needed
for the owner-confirmed integration scope.

| Order/scenario | Observed integration result | Boundary |
| --- | --- | --- |
| #1009 — R1 mixed delivery | Passed for two Small boards ($118, serving 4 each), one Large ($175, serving 10), one Small build-your-own ($59, serving 4), and two $50 gift cards, plus $5 delivery: $457 total. The real buyer and staff emails, HTML and plain-text, retained serving counts on all three physical line groups, the submitted ingredients/preference, and November 23, 1:00–3:00 PM, America/New_York delivery fields. One gift card was for self and one was scheduled for November 22; the actual buyer receipt retained that future date, and no early recipient email was observed. | Tax was $0 before the subsequent tax configuration, not approval of tax correctness. Native future sending was not awaited and is outside the integration gate; the queued QA send was later canceled during cleanup. |
| #1009 — input and cart recovery | Passed actual browser checks: three cheeses on the Small build-your-own board were rejected with `Choose 1–2 cheeses`; six accompaniments were rejected with `Choose 1–5 accompaniments`. ZIP 99999 was rejected; retrying with 22205 saved the chosen time. Returning to the same browser's cart after payment showed an empty cart, Cart 0 and no delivery calendar or stale-cart error. A local screenshot was retained outside Git. | These specific ingredient/ZIP cases passed; other validation combinations have separate unit/API evidence and must not all be labeled browser-tested. |
| #1010 — nine-seat public tour plus board | Passed checkout and both actual buyer/staff emails in HTML/plain-text: December 3, Guest count 9, Public seats, Ballston Metro pickup, charcuterie snack, board quantity 1/Serves 4 and phone-coordination/waiver next steps. Total $1,184 ($1,125 seats + $59 board); the emails explicitly identified gift card $50 and Visa $1,134. No delivery date/window/timezone labels appeared. | Plain-text site links pointed to the correct Astro routes. The exact tracked order-status, waiver and booking-updates links were subsequently opened at 390px and 1280px widths; they reached the correct pages without horizontal overflow. The canceled order status was viewed without submissions. |
| #1011 — last-seat competition | Passed the tested T5 race. After #1010, one December 3 seat remained. Two independent browser checkout sessions were ready for that seat at $125, then completion was submitted concurrently. One completed as #1011; the other displayed `Some items are no longer available.`, with no completed order ID and no resubmission. The actual customer/staff emails also passed for December 3, Guest count 1, $125 and the explicit Mastercard payment label. | Evidence is this two-session race, not arbitrary concurrency stress. |
| #1012 — two-guest private tour | Passed checkout at the flat $1,250 whole-bus price for December 4. Both actual buyer/staff emails in HTML/plain-text explicitly showed Guest count 2, Private whole bus, an explanation that capacity components are not actual passengers, the custom pickup address, included Caprese sandwich, and phone-coordination/waiver next steps and links. No delivery labels appeared. | The QA address and private links remain outside Git. Native payment-provider behavior was not a separate test. |

The original staff build-your-own fields, public/private guest/coordination details,
split-payment labels and post-purchase cart findings are now addressed and passed by the
applicable actual regressions above. The earlier failure rows are retained as history.

### Mobile cart and email-link continuation

At a 390×844 mobile viewport, a fresh board after the completed cart had no old delivery window
or ingredients. November 23, 13:00–15:00 was saved and survived reload; changing to November 24,
15:00–17:00 saved the replacement. Returning from an unpaid checkout showed Resume and retained
the window. Keyboard quantity 3 updated the line to $177 and cleared the prior checkout-ready
state; reload retained quantity 3 and the window. Shopify's mobile order summary showed
quantity 3, $177, November 24, 15:00–17:00, America/New_York and Serves 4. The temporary line was
removed afterward, leaving an empty cart, Cart 0 and no calendar. No new payment was made.

The exact tracked order-status, waiver and booking-updates links from #1010's actual email were
opened at mobile 390px and desktop 1280px widths. All landed correctly without horizontal
overflow; the canceled order status was viewed without further submissions. This closes the
previously pending desktop/mobile link check for these actual links and the tested mobile
cart-edit/reload/interruption path.

### Cleanup of the continuation orders

| Order/item | Verified cleanup | Native settlement status, outside the integration gate |
| --- | --- | --- |
| #1009 | Local delivery was marked delivered/fulfilled and archived for QA. The actual delivered notification arrived and showed the three physical line groups/quantities; it omitted delivery/ingredient properties, so it is not evidence of those fields in that notification. Full $457 refund submitted. | Original Visa refund pending at the observation. |
| #1010 | Canceled, fulfillment not required, with intentional restocking. The full $50 gift-card portion was returned. | $1,134 original-card refund pending. |
| #1011 | Canceled, fulfillment not required, with intentional restocking. | $125 original-card refund pending. |
| #1012 | Canceled, fulfillment not required, with intentional restocking. | $1,250 original-card refund pending. |
| Test gift cards | All four test cards were verified Deactivated, including the two new $50 cards at restored $50 balances. The scheduled card explicitly showed that its November 22 recipient send was canceled, and Send gift card was disabled. No active QA gift liability or queued recipient email remains. | The native future scheduled send was deliberately canceled, not failed. G3 integration handoff passed from the selected date and actual buyer receipt. |
| Tour capacity | Shopify Admin and Production availability were checked after cleanup: December 3 and 4 each returned to ten public seats and one private bus. A separate local API recheck at 11:41 AM also showed 10/1 for both dates. | Capacity restoration is verified separately from native card-refund settlement. |
| Optional invoice exploration | The unsaved manual draft was discarded before Save; the draft list retained only the pre-existing #D4. | No manual invoice or payment was created. This native workflow is outside the site's required QA scope. |

### Tax configuration and actual unpaid estimates

The owner confirmed Virginia registration, Arlington preparation of ready-to-eat platters as
catering, and stated that delivery/tour service should be Virginia-only. The DC-zone audit
below shows that current delivery configuration does not yet enforce that scope. Virginia
collection was enabled in Shopify;
the optional Sales tax ID field was left blank and the UI shows Missing ID for owner follow-up.
No account number was invented. All 338 generated tour seat/bus variants were set non-taxable
and audited without price or inventory changes; food remains taxable.
Commit `ab0eb75` maintains this service exemption for new/existing dates, but still requires
PR merge and Production deployment. Until then, the older deployed synchronizer can create
new date variants with Shopify's default taxable flag.

The manual, unpublished **Arlington Prepared Food (Tax Only)** collection contains 22 board
products (`496413835418`). Its Virginia 11% replacement override was saved, together with a 0%
Virginia shipping override. The food rate combines 6% Northern Virginia sales tax and 5%
Arlington meals tax in one Shopify replacement line; the business must allocate/report/remit
those liabilities separately.

| Unpaid checkout case | Actual tax/total | Result |
| --- | --- | --- |
| $59 board + $5 delivery to Virginia, Virginia billing | $6.49 tax; $70.49 total | Passed the tested delivery case. |
| Same Virginia delivery, DC billing | $6.49 tax; $70.49 total | Passed; the Virginia shipping address supplies delivery sourcing. |
| Nine public seats ($1,125) + $59 board on a Virginia tour, Virginia billing | $6.49 tax; $1,190.49 total | Passed the tested split between exempt service and taxable food. |
| Same Virginia tour/board, DC billing | $0 tax; $1,184 total | Historical non-shipping failure; the later physical-board prototype below corrected this result. |

No additional payment was made for these historical tax estimates. The later isolated physical
prototype passed; live counterpart migration is a separate remaining rollout step.
The owner subsequently confirmed the required behavior: on-tour boards always use Virginia
food-tax sourcing regardless of billing. Virginia, Maryland and DC billing are the required
unpaid regression matrix; no Maryland-specific checkout pass is claimed by the earlier DC test.
The owner explicitly confirmed there is no public pickup location. Native pickup is therefore
incompatible with this workflow, and the private warehouse must not be enabled or exposed as a
shortcut. The selected physical-board approach was later proven in the isolated native
prototype while retaining genuine non-Virginia billing. Prior zero-tax orders are not tax
approval. See [Virginia tax maintenance](virginia-tax-maintenance.md) for source-backed treatment,
configuration ownership, remittance allocation, historical sourcing failure and current rollout.

### Physical boarding-address correction — implemented and isolated prototype verified

The owner approved using the actual/tentative Virginia boarding destination **only for bookings
with a separately sold charcuterie board**. On tour counterparts become physical,
with a dedicated bus fulfillment location and the exact $0 method **Provided on your tour —
pickup arranged by phone**. Tour service remains non-shipping/non-taxable; real billing remains
separate. Only board bookings with no preference/Arrange by phone receive the tentative
NorthSide Social default, 3211 Wilson Blvd, Arlington, VA 22201. Tour-only and included-sandwich
service bookings must have no default NorthSide/delivery address.

Every pickup choice remains tentative and final arrangements are made by phone on booking and
native checkout; a default is not a confirmed travel instruction. The owner confirmed the
Reston Town Center station choice; its verified WMATA base address is 12023-A Sunset Hills Rd,
Reston, VA 20190. Verified venue/station base addresses are
repository-owned in `src/data/tour-options.ts`; no boarding curb was invented. The private
warehouse must not become a public pickup location, and no home-board delivery calendar is
introduced.

The dedicated internal **On-tour board fulfillment** location was created in Shopify as
`gid://shopify/Location/91098611866`, at the real private Arlington preparation address. It is
active/online-order-enabled with storefront visibility, public pickup and local delivery off.
The dedicated native rate was exercised in the isolated prototype below. The 44 existing live
On tour shipping flags/inventory locations have not been migrated. The private street is not
retained in Git.

Server-only `SHOPIFY_TOUR_BOARD_LOCATION_ID` must be configured in both Preview and Production.
Deploy the compatible Production checkout, cron and webhook code before changing existing
On tour shipping/location flags so older sync cannot undo the migration. The isolated native
prototype passed the following unpaid checks; it does not establish that the 44 live
counterparts have migrated. See [rollout steps](deployments.md#physical-on-tour-board-rollout).

| Prototype case | Actual observation |
| --- | --- |
| Nine public seats ($1,125) plus a $59 physical board; genuine Virginia billing | Virginia food tax $6.49, exempt tour service, free dedicated handoff; total $1,190.49. |
| Same Virginia boarding destination; genuine DC billing | Same $6.49 tax and $1,190.49 total. |
| Same boarding destination; genuine Maryland billing | Same $6.49 tax and $1,190.49 total. |
| Tour-only service | Zero delivery groups; no default boarding/delivery address. |
| Ordinary $59 Delivery board | LOCAL $5 delivery; no free tour handoff offered. |

Billing stayed separate from the boarding destination and was observed blank before entering
the genuine payer address. No new payment/order was created for these checks. The original
non-shipping billing-source defect is resolved by this isolated prototype; rollout of active
counterparts remains a deployment prerequisite with its own live verification.

The rate eligibility audit covered 645 variants and matched exactly 44 live On tour targets
plus one active QA target (45); no ordinary, service or gift variants matched. The rule is
product status ACTIVE plus variant title ENDS_WITH **On tour**, with no product-type/tag
requirement. The reserved Fulfillment option must stay last; reordering that removes the
expected rate fails closed. Routine CLI/cron planning remains broader than the initial active
migration: 69 targets across 35 members, including 25 inactive targets.

In native checkout, changing the physical board's destination to DC produced
`address_undeliverable`, no eligible handoff and no completion. Restoring Virginia restored the
valid path. Its zero-tax undeliverable state is not a completed tax-free sale. Tour-only native
checkout had no Delivery section/address, NorthSide/default text or delivery group; genuine
DC and Maryland billing each showed total $125 and tax $0.

### Boarding notification update — saved and read back

The buyer and staff templates were saved in Shopify, then reloaded; full clipboard contents
exactly matched the validated private tour-pickup templates. Both native previews compiled.
The buyer's prior live editor matched the earlier pre-findings backup, so this save also
restored the already-authorized tour summary/payment-label fixes; the staff editor matched
the earlier findings-fixed base. No actual email was sent for the new native checkout.

Full-template LiquidJS fixtures passed default-No-preference and selected-Ballston board
cases, service-only omission, ordinary-delivery/gift-only output equivalence, escaping,
both-attribute gating and all pending/charged-on-fulfillment branches. Financial/tax/payment/
gift expressions were unchanged, with rendered synthetic total $315.49, tax $6.49 and split
$50 gift card/$265.49 Visa retained in both templates. These fixture and save/readback results
are distinct from an actual delivered-email observation.

### Delivery-area mismatch — owner resolution pending

The Shopify UI audit found an active **Local Delivery – D.C. (Zone 5)** with ten postal codes
and a $20 fee. Its exact ten codes also appear in the authoritative
`delivery_schedule/default.eligible_zips` list of 112 codes: `20001`, `20003`, `20005`, `20006`,
`20007`, `20008`, `20009`, `20024`, `20036`, `20037`. This is a second open configuration/integration
mismatch with the owner's previously stated Virginia-only scope. The owner asked for an audit;
no delivery-zone or schedule changes have been made in response, pending their resolution.
ZIP `20598` is not part of this DC set and has not been removed. The tax estimates above used
Virginia shipping and do not establish tax treatment for a DC delivery.

The paid QA cleanup above remains verified: #1009's full refund was submitted; #1010–#1012
were canceled/refunded with restocking, all test cards were deactivated, the queued gift send
was canceled, and December 3/4 capacity returned to 10 public seats / 1 bus. Pending native
refund settlement is outside the owner-confirmed integration gate.

### Automated evidence for the continuation

| Verification | Result | Boundary |
| --- | --- | --- |
| Cart regression suite | 40 tests passed; Astro/TypeScript check and production build passed for the cart change. | Uses local fixtures/mocks; does not prove same-browser post-payment recovery or notification delivery. |
| Booking, blackout, tour and board suites | `test:booking` 22, `test:blackouts` 3, `test:tours` 14 and `test:boards` 7 passed in this continuation: 46 tests, zero failures. | Covers invalid contact/guest/date/conditional booking input and acknowledgments, ingredient constraints/forgery, shared blackout fail-closed behavior, checkout revalidation, no delivery inventory limit and schedule/catalog rules with fixtures. It does not establish a real last-seat race. |
| Latest tour-suite rerun | `test:tours` subsequently passed 16 tests after the horizon/service-tax changes. | This later run supersedes the earlier 14-test tour run for the changed code; the earlier 46-test batch is preserved as its own observation, not added to this run. |
| Physical-board booking/sync suite | The later implementation passed 32 booking/sync tests and the full build. | Covers conditional boarding address/default, service-only omission, exact free method/destination validation and physical counterpart sync; separate from the isolated native tax proof. |
| Later complete source batch | At approximately 13:22, `test:booking` 32, `test:cart` 41, `test:tours` 16, `test:boards` 7 and `test:blackouts` 3 passed: 99 tests. The production build/Astro check passed with zero errors, warnings or hints. | This is its own observed batch, not added to earlier runs. A subsequent resolver configuration-error fix reran booking at 33 passing tests, superseding that batch's 32; maintenance preflight tests were still being added, so no final combined count is inferred. |
| Final physical-board source validation | `test:booking` 35, `test:cart` 41, `test:tours` 16, `test:boards` 7 and `test:blackouts` 3: 102 passed, zero failures/skips. Production build passed; Astro/TypeScript checked 121 files with zero errors, warnings or hints. | Includes the subsequent public configuration-error and maintenance location-preflight fixes. This final batch supersedes earlier counts; native tax proof remains separate. |
| Safe custom-request abuse checks | Empty cross-origin POSTs returned HTTP 403 locally and in Production with `Cross-origin requests are not allowed.` A same-origin Production POST without BotID verification returned HTTP 403 and a useful verify/retry error. | No email/order writes occurred. No valid local POST was attempted because the inherited email-service credentials were not conclusively isolated. Provider failures, rate limits and retry/reply handling remain separate checks. |
| Custom-request form suite | The earlier PR #50 verification passed 16 form tests, as recorded above. | This is previous evidence, not an additional fresh run or a reason to sum historical suite totals into a new total. |

The continuation suites used the existing ARM64 Node environment. An initial cart invocation
through the system x64 Node could not load the installed ARM64 Rolldown binding; that was an
environment failure, followed by the separately reported passing cart run with the correct
runtime. No dependencies or Shopify business settings were changed to run these checks.

### Read-only availability boundaries

On November 21 at approximately 11:05 AM America/New_York, **29 local HTTP GET requests and
27 assertions passed** against `http://127.0.0.1:4330`. Read-only Shopify Admin queries supplied
the authoritative schedule and shared blackout values for comparison. Unauthenticated HTTP
requests to the branch Preview redirected to Vercel login, so the following boundary evidence
is local API evidence against the shared Shopify store, not an authenticated Preview browser
or checkout test. No form emails, carts, orders or inventory writes were made by these checks.

| Input/check | Observed result | Coverage boundary |
| --- | --- | --- |
| Delivery `calendar=1`; eligible ZIP `22205` | Both returned HTTP 200 and the same 543 available slots, from November 22 at 13:00 through March 20, 2027 at 17:00. The complete key set matched Shopify's 24-hour notice, 120-calendar-day horizon and configured windows. No slot was on/after March 21. | Evaluates availability at this observed time; changing clocks and checkout enforcement are distinct checks. |
| Delivery ZIP `22205-1234` and whitespace-padded `22205` | HTTP 200, `eligible: true`, and identical slots to `22205`. | ZIP normalization at the GET API; not shipping-address validation. |
| Delivery ZIP `99999`, missing ZIP, `ABCDE`, `2220` | HTTP 200, `eligible: false`, empty slots. | Rejection is represented by eligibility, not an HTTP error; no checkout was attempted. |
| Shared business blackouts | No delivery slots or public/private tour dates on November 25–30 or December 24–27, 2026: all ten configured closures were excluded. Both APIs identify `booking_blackouts/default`. | Read-only list exclusion; the passing fixture suites separately cover server revalidation and fail-closed behavior. |
| Every configured delivery window on December 3 | All five starts/ends appeared: 09:00–11:00, 11:00–13:00, 13:00–15:00, 15:00–17:00 and 17:00–19:00. All returned slots were marked available without variant/reservation inventory. | No order was placed in these windows. |
| Tour `guests=0`, `-1`, `11`, `1.5`, `abc`; `type=vip` | HTTP 400 with a useful valid-type/guest-count error for each input. | Availability input validation; no registration/checkout POST was made. |
| Tour `month=2026-13`, `2026-2`, `invalid` | HTTP 400 with a valid-calendar-month error. Both public/private `guests=10` requests for December were accepted with HTTP 200. | Tests format/count bounds at availability GET. |
| Public/private month queries for October/November/December 2026 and May/June 2027 | October and June returned no dates; November returned only November 24, shown sold out with zero remaining. December returned 27 dates, excluding its four closures. No date before the three-day November 24 minimum or beyond the reported May 21 maximum appeared. | Missing acknowledgments and full invalid registration cases were exercised in fixtures, not browser submission. The original final-day catalog gap was subsequently fixed and reverified below. |
| Candidate unused-capacity dates | December 3, 4 and 5 each showed ten public seats at $125 and one private bus at $1,250, available for the requested group size. | A snapshot of current unreserved capacity, not proof of no historical canceled bookings. Recheck immediately before tests. |

**Catalog horizon finding — fixed and reverified:** the original read-only run reported
May 21, 2027 as the inclusive maximum, but catalog results ended on May 20 and Admin had no
May 21 seat/bus products. After the reviewed horizon synchronization, read-only Admin verification
found both May 21 products Active: seat `15538217418906` with quantity 10 and bus `15538217451674`
with quantity 1. Subsequent local public and private availability GETs for `month=2027-05`
report maximumDate May 21 and return that date available, with public remaining 10 and private
remaining 1. The original gap is resolved for the observed boundary; the initial test's no-write
scope remains historical evidence.

## Initial purchase-run cleanup observation

This subsection preserves the #1003–#1008 observations before the continuation and tax-setting
changes above. Native pending refund settlement is recorded for audit, outside the current
Astro release gate.

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

## Outstanding integration acceptance work

- Deploy compatible Production code before migrating the 44 active On tour counterparts,
  then verify their physical boarding destination/$0 method and conditional default/service-only
  behavior. The isolated native Virginia/DC/Maryland tax matrix passed; do not list its historical
  non-shipping failure as unresolved or claim the live migration is complete. Enter the owner's
  real Virginia tax ID securely as account follow-up.
- Resolve the mismatch between the stated Virginia-only delivery scope and the active DC zone
  plus ten matching schedule ZIPs. The audit made no configuration change and did not test DC
  delivery tax; await the owner's decision on the intended service area.
- Complete the remaining relevant custom-request provider-failure/rate-limit/retry checks
  (CB4–CB6), retaining the passed actual email/helper, cross-origin rejection and no-BotID
  Production rejection evidence. Existing unit tests cover the failure/validation logic;
  additional live outage/retry checks have not been claimed. Native manual invoice/payment
  (CB3) and optional Sidekick execution are outside the site's required integration QA.
- Check valid/invalid discounts only if an offered code and its business rules apply. Native
  card-brand/wallet/processor/settlement coverage and waiting for Shopify's future scheduled
  gift send are excluded by the owner, not unresolved Astro failures.

Record each result separately. Verified purchase paths do not establish full-plan completion.

Shopify test mode was not changed by this run. The email-template edits are Shopify settings
changes and do not require a Vercel deployment. Maintenance requirements are in
[Content management](content-management.md#delivery-schedule--delivery_scheduledefault).
