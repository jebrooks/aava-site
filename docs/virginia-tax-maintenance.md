# Virginia tax maintenance

Shopify owns tax registrations, product taxability, overrides and checkout calculation. Astro
passes the correct products, fulfillment/delivery context and order properties; maintain tax
rules in Shopify rather than hardcoding a rate in the cart.

## Business facts and working treatment

The owner confirmed on November 21, 2026 that the business is registered in Virginia, prepares
ready-to-eat charcuterie platters as catering in Arlington, and intends Virginia-only delivery
and tour service. An initial audit found an active DC delivery zone and matching schedule ZIPs.
The owner
subsequently authorized removal of those ten codes. Native Shopify and authoritative schedule
save/readback verification passed, leaving the same 102 Virginia ZIPs; details follow below.
These facts support the working tax
treatment below; record actual checkout estimates before calling the integration verified.

| Sale | Intended treatment | Source/maintenance |
| --- | --- | --- |
| Public seats and private whole-bus tour service | Non-taxable service, with included food incidental to the service; separately sold boards remain distinct taxable goods. | Virginia's services rule uses the transaction's true object and makes the provider responsible for tax on goods consumed in an exempt service. This application of the rule depends on the owner's service description. [23VAC10-210-4040](https://law.lis.virginia.gov/admincode/title23/agency10/chapter210/section4040/) |
| Separately sold prepared charcuterie, including tour add-ons | Prepared-food treatment. Caterers do not use the reduced grocery rate. | [Virginia grocery-tax rules](https://www.tax.virginia.gov/grocery-tax) |
| Prepared food in the current Northern Virginia service area, prepared by the Arlington business | Working collection target: 6% Virginia/Northern Virginia sales tax plus 5% Arlington meals tax, totaling 11% of the applicable food base. Reassess sourcing/rates before expanding the service area. | [Virginia rates](https://www.tax.virginia.gov/retail-sales-and-use-tax) and [Arlington meals tax effective July 1, 2025](https://www.arlingtonva.us/Government/Programs/Taxes/Business-License-and-Taxes/Meals-Food-and-Beverage-Tax-Increase-Effective-July-1-2025) |
| Separately stated delivery charge | Exempt transportation charge; the tested $5 local-delivery fee uses the saved 0% shipping override. | [23VAC10-210-6000](https://law.lis.virginia.gov/admincode/title23/agency10/chapter210/section6000/) |

Included sandwich cost within the exempt tour is a business input-tax responsibility; a separate
food add-on sale is not made exempt merely because it accompanies a tour. Delivery/handling fee
treatment must also be checked against the actual charge and applicable rule rather than
assuming the prior zero-tax test proves it correct.

The owner explicitly confirmed that separately sold on-tour boards must always use Virginia
food-tax sourcing because guests receive them in Virginia, irrespective of the payer's genuine
billing address. The required regression matrix includes Virginia, Maryland and DC billing:
a $59 on-tour board must contribute $6.49 tax under the current 11% configuration in every case,
while the tour-service fee stays exempt. This is required behavior, not a claim that the current
checkout passes. Virginia's [in-state sourcing rule](https://law.lis.virginia.gov/admincode/title23/agency10/chapter210/section2070/)
generally uses the seller's business location for in-state internet orders; a billing address
outside Virginia does not turn food received in Virginia into an interstate delivery.

## Configuration status — November 21, 2026

- Virginia collection was enabled in Shopify after the owner confirmed existing registration.
  The UI accepted an empty optional Sales tax ID field and now shows Missing ID. No registration
  number was invented or entered; the owner must maintain the real account information securely
  in Shopify as an account follow-up.
- The 338 active generated tour seat/bus service variants were changed to non-taxable and audited.
  Prices and inventory were unchanged; food remains taxable. PR #50's service-exemption
  synchronization code is included in Production `a7dd7da` and maintains the flag for new and
  existing dates. The earlier pre-merge warning about the older synchronizer is historical.
- The manual, unpublished **Arlington Prepared Food (Tax Only)** collection contains 22 board
  products (ID `496413835418`). Its Virginia override was saved at 11% as one replacement tax
  line. Keep gift cards and tour service products out of this collection.
- A Virginia shipping override was saved at 0%.
- The historical non-shipping on-tour flow sourced food tax from billing and failed with DC
  billing. The physical-board correction passed the isolated native Virginia/DC/Maryland
  matrix below. At prototype time the 44 live counterparts had not yet migrated; subsequent
  live rollout evidence is recorded separately below.

## Verified delivery-area correction

The initial audit found active **Local Delivery – D.C. (Zone 5)**, with a $20 fee and ten codes:
`20001`, `20003`, `20005`, `20006`, `20007`, `20008`, `20009`, `20024`, `20036`, `20037`. They exactly
matched the DC entries in the then-112-code authoritative
`delivery_schedule/default.eligible_zips` list. That audit identified a second configuration
mismatch with the owner's stated Virginia-only scope; it was corrected as recorded below. The owner then authorized removing exactly these ten codes
from native delivery and `delivery_schedule/default.eligible_zips`, while preserving Virginia
ZIP `20598`. Native Shopify Zone 5 removal was saved and reloaded successfully; four Virginia
zones remained unchanged: Arlington 16 ZIPs/$5, Alexandria 22/$15, Falls Church 6/$10 and Fairfax
58/$20 (102 total). The authoritative schedule API also removed exactly those ten codes,
112 → 102, preserving the order of all remaining ZIPs including 20598. Horizon 120 and every
other delivery field and the full blackout object were unchanged. Native delivery and the
schedule are aligned to the approved 102 Virginia ZIPs.

Native ordinary-board checkout rejected an official DC 20001 destination with
`address_undeliverable`, zero groups/rates and no order. Restoring the Virginia destination
with genuine Maryland billing offered only LOCAL $5, food tax $6.49 and total $70.49, ready to
complete. No payment was made; this is native checkout evidence, not a claim that every ZIP
has been exercised in a browser.

Unsupported ZIP help invites a call to **714-715-9836** to discuss delivery, with a
`tel:+17147159836` link and accessible input help. Source/local UI and read-only validation
passed; public copy deployment is documented separately in the follow-up PR handoff. The note
does not mark an address eligible or bypass schedule/checkout validation.

The unpaid estimates below all used Virginia shipping and do not verify DC delivery taxes.
The Virginia food override is not a DC-delivery tax rule; DC destinations are now outside the
configured delivery area.

## Historical unpaid estimates before physical-board correction

| Scenario | Observed estimate | Result |
| --- | --- | --- |
| $59 delivered board + $5 delivery to Virginia, Virginia billing | $6.49 food tax; $70.49 total | Passed this case. |
| Same Virginia delivery with DC billing | $6.49 food tax; $70.49 total | Passed this case; Virginia shipping controls delivery sourcing. |
| Nine public tour seats ($1,125) + $59 board, Virginia billing | $6.49 tax; $1,190.49 total | Passed this case: service is exempt and the separate board is taxed. |
| Same Virginia tour/board with DC billing | $0 tax; $1,184 total | Historical failure in the non-shipping model; corrected prototype proof follows. |

These were unpaid estimates, with no additional test payment. The later isolated prototype
proved the corrected boarding-destination approach. Subsequent live rollout observations and
the separately verified DC delivery-area correction are recorded here and in the results.
The owner confirmed that no public order-pickup location exists. Native public pickup remains
incompatible; do not enable the private warehouse or expose its address. The approved
physical-board correction uses a genuine/tentative boarding destination instead. Its prototype
and subsequent live rollout are documented separately below.
Do not ask customers to falsify billing details. Keep the historical pre-change zero-tax orders
in the results report; they do not establish correctness after configuration.

## Physical-board fulfillment and verified prototype

The owner approved supplying the actual or tentative Virginia boarding destination for a
separately sold board. The implementation makes **On tour boards physical**, keeps food
taxable, and fulfills them through a dedicated legitimate bus location with the exact $0
method **Provided on your tour — pickup arranged by phone**. Tour seats/whole-bus service remain
non-shipping and exempt. The private preparation address is not a public pickup location; no
native public warehouse pickup or home-board delivery calendar is introduced.

The destination is needed **only when a separately sold board is present**. For such a booking,
no preference/Arrange by phone uses NorthSide Social, 3211 Wilson Blvd, Arlington, VA 22201 as a
tentative default. Every pickup remains tentative and arranged by phone, with clear reassurance
that no final location choice is needed to book. Tour-only or included-sandwich service bookings
keep optional pickup preference/phone coordination with no default NorthSide/delivery address.
The owner confirmed the Reston choice as Reston Town Center; verified venue/station base
addresses live in `src/data/tour-options.ts` and the [pickup guide](content-management.md#tour-pickup-addresses-and-phone-coordination).

The new server-only `SHOPIFY_TOUR_BOARD_LOCATION_ID` is required in both Vercel Preview and
Production. Follow the [deployment sequence](deployments.md#physical-on-tour-board-rollout):
compatible Production checkout, cron and webhook code must be deployed before migrating
existing On tour shipping/location flags, because the older sync can revert them. Keep all
source IDs, prices, inventory and booking history intact. Use the real dedicated location ID;
do not treat the example value as a configured resource.

Before any synchronization write, a read-only location preflight requires the configured
location to exist, be active, fulfill online orders and differ from the ordinary delivery
origin. A configuration failure stops before counterpart shipping-flag/location changes.
Using the same legitimate preparation street is compatible with a dedicated, distinct ID.

The dedicated internal **On-tour board fulfillment** location was created in Shopify as
`gid://shopify/Location/91098611866`, using the legitimate private Arlington preparation address.
It is active and fulfills online orders; storefront visibility, public pickup and local delivery
are off. At the isolated prototype stage, the 44 existing On tour variants' shipping flags and
inventory locations had not yet migrated. See the later live rollout record below. Keep the
private preparation street out of Git; `.env.example` retains a placeholder ID.

| Isolated native unpaid case | Observed result |
| --- | --- |
| Nine public seats ($1,125) + $59 physical board; Virginia billing | $6.49 food tax, $0 tour-service tax, $0 dedicated handoff; total $1,190.49. |
| Same Virginia boarding destination; genuine DC billing | Same $6.49 tax and $1,190.49 total. |
| Same destination; genuine Maryland billing | Same $6.49 tax and $1,190.49 total. |
| Tour-only service | Zero delivery groups and no default NorthSide/delivery address. |
| Ordinary $59 Delivery board | Native LOCAL $5 method; the tour's free handoff was not offered. |

Native checkout kept billing separate from the preset boarding destination; its billing address
was observed blank before the genuine payer address was entered. No payment was made. These
results resolved the prototype sourcing failure and, at that stage, did not establish live
counterpart migration. Retain the earlier failure and prototype as history; record subsequent
migration and active-product verification separately. Selected, no-preference/phone-default, private custom Virginia and service-only
presentation remain covered by source/fixture checks and any separately recorded browser
observations, rather than inferred from a single prototype checkout.

The rate rule uses product status ACTIVE and variant title ENDS_WITH **On tour**; no
product-type or tag is needed. Keep the reserved Fulfillment option last. The pre-cleanup
645-variant audit matched 44 live variants plus the active QA target (45), with no ordinary/
service/gift matches. QA archival/unpublication subsequently left 22 ACTIVE products/44 live
targets and zero QA targets.
The native checkout also rejected a changed DC fulfillment destination as
`address_undeliverable`, with no eligible handoff and no completion; restoring Virginia restored
the valid path. The $0 tax on that undeliverable state is not a valid completed sale.

Tour-only native checkout was separately observed with no Delivery section, address,
NorthSide/default text or delivery group. Genuine DC and Maryland billing each kept the
service-only total $125 and tax $0. The billing address remains distinct from board fulfillment.

The earlier no-address/non-shipping workflow had no documented native correction; manual
invoices also fell back to billing. No tax app was installed or provider contacted. A tax
partner remains unverified fallback research, not the selected rollout. If reconsidered,
Shopify's [Tax Partner Apps platform](https://shopify.dev/docs/apps/build/tax) is restricted to
selected providers; [tax apps](https://help.shopify.com/en/manual/taxes/tax-apps) replace the
store's native tax service and can fall back to native settings during outages. Require provider
confirmation, sandbox proof, whole-store regression and correct outage behavior before adoption.

## Live rollout verification — November 21, 2026

PR [#50](https://github.com/jebrooks/aava-site/pull/50) was merged and Production commit
`a7dd7da` reached Ready. GitHub deployment `7967596560` succeeded at the
[verified Production deployment](https://aava-site-q8z4h7arp-jebrooks-projects.vercel.app).
The code deployment preceded counterpart mutation.

| Check | Verified observation |
| --- | --- |
| Live counterpart migration | Passed at 18:36:13 UTC: 44 On tour targets across 22 ACTIVE board products are physical, untracked, inventory policy CONTINUE, and active exclusively at dedicated location 91098611866. No variants were created or deleted. |
| Source/ordinary product preservation | Full before/after audit covered 645 variants: all 601 protected variants were unchanged, including 366 tour-service variants (338 active non-taxable/non-shipping; 28 archived with their historical taxable flags unchanged) and 25 inactive On tour variants. Ordinary Delivery stock, IDs, prices, taxability, serving counts, product status and history were preserved. Private audit evidence is retained outside Git. |
| Merged-source control-cart integration | Six of six service controls passed using Production-source modules and real Admin reads/Storefront carts: public blank/default, Ballston, Reston Town Center and Arrange by phone; private custom Virginia board; private included Caprese without a board. All five board carts had one physical board plus non-shipping service and the exact selected $0 method. The no-board case had zero physical lines/groups and no address/default properties. No billing override was supplied; December 3 public 10 and December 4 private 1 capacity were unchanged. This is service/cart integration, not HTTP/browser/payment acceptance. |
| Private included-sandwich native checkout | Passed for the December 4 private whole-bus booking, two actual guests: one $1,250 bundle reserves ten seats, Snack is sandwich, and there is no Delivery group/section, NorthSide/default-address text or Tentative fulfillment address. Genuine Maryland billing retained no fulfillment requirement, total $1,250 and tax $0, ready to complete. No card, payment or order was submitted. |
| Live-source unpaid native checkout | Passed on native checkout using a real migrated board: the same Virginia boarding destination with genuine Virginia, DC and Maryland billing each showed $6.49 tax on the $59 board, $0 on the $1,125 tour service and $0 fulfillment; total $1,190.49 in all three cases. This verifies the native checkout from a merged-source control cart, not a complete Astro form/public-API/payment flow. |
| QA fixture cleanup and cart boundary | Passed: the QA product was archived and unpublished without deletion; the tax-only collection was restored to its exact original 22 products; the manual QA rate source was removed. The dynamic rule now covers 22 ACTIVE board products/44 live targets and zero QA targets. The ordinary charcuterie collection retained its exact 35 members. Control carts made no orders, payments or email sends; private cart URLs stay outside Git. |

The source-service control-cart harness uses synthetic local registration validation and
strips all legal-acceptance properties before the actual Shopify CartCreate. Record its results
as source-service/cart integration, separately from browser or public-API registration and
acknowledgment acceptance. It makes no payment or order and sends no email.

These live observations are separate from the earlier isolated prototype. No new payment or
notification delivery is inferred from an unpaid checkout. The DC delivery-area removal was separately verified in native checkout and the authoritative
schedule. The owner's real Virginia tax ID remains an account follow-up.

## Routine maintenance and verification

Use **Settings → Taxes and duties → United States** for the registered Virginia collection and
food override. Product exemption flags belong on the relevant Shopify variants. A collection
override requires a manual collection and can remain unpublished. See [Shopify US tax setup](https://help.shopify.com/en/manual/taxes/us/us-tax-setup)
and [tax overrides](https://help.shopify.com/en/manual/taxes/tax-overrides).

After a new board or taxability change, verify the regular and on-tour variants, manual food
collection membership and checkout estimates. Check a Virginia delivery, a tour-only booking,
a tour with separately sold food and a legitimate non-Virginia billing address. Compare line
bases and tax amounts without creating another payment. Do not require customers to provide
an inaccurate Virginia billing address to obtain the intended tax result.

An 11% Shopify override combines collection into Shopify's tax calculation; it does not create
a separate Arlington filing or guarantee separate meals-tax reporting. Reconcile the food base
and allocate the Virginia sales-tax and Arlington meals-tax liabilities for their respective
returns. For a $100 applicable food base, that working allocation is $6 sales tax and $5 meals
tax; keep rounding/adjustments reconciled to the actual collected amounts. Shopify collection
does not replace the business's remittance responsibilities.

Track configuration changes and actual estimates in the [transactional results](transactional-test-results-2026-11-21.md).
