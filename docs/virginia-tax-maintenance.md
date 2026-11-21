# Virginia tax maintenance

Shopify owns tax registrations, product taxability, overrides and checkout calculation. Astro
passes the correct products, fulfillment/delivery context and order properties; maintain tax
rules in Shopify rather than hardcoding a rate in the cart.

## Business facts and working treatment

The owner confirmed on November 21, 2026 that the business is registered in Virginia, prepares
ready-to-eat charcuterie platters as catering in Arlington, and intends Virginia-only delivery
and tour service. A later audit found an active DC delivery zone and matching schedule ZIPs,
so Virginia-only delivery is not currently established. These facts support the working tax
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
- All 338 generated tour seat/bus service variants were changed to non-taxable and audited.
  Prices and inventory were unchanged; food remains taxable. PR #50 maintains the setting for
  new and existing dates. That code still requires merge and Production deployment; the older
  Production synchronizer can create new date variants with Shopify's default taxable flag.
- The manual, unpublished **Arlington Prepared Food (Tax Only)** collection contains 22 board
  products (ID `496413835418`). Its Virginia override was saved at 11% as one replacement tax
  line. Keep gift cards and tour service products out of this collection.
- A Virginia shipping override was saved at 0%.
- The historical non-shipping on-tour flow sourced food tax from billing and failed with DC
  billing. The physical-board correction passed the isolated native Virginia/DC/Maryland
  matrix below; deploying compatible code and migrating the 44 existing live counterparts
  remain rollout work, not an unresolved prototype tax calculation.

## Open delivery-area mismatch

Shopify currently has an active **Local Delivery – D.C. (Zone 5)**, with a $20 fee and ten codes:
`20001`, `20003`, `20005`, `20006`, `20007`, `20008`, `20009`, `20024`, `20036`, `20037`. They exactly
match the DC entries in the 112-code authoritative `delivery_schedule/default.eligible_zips`
list. This conflicts with the owner's stated Virginia-only scope and is a second open
configuration/integration issue. The owner requested an audit only; no zone or schedule setting
has been changed pending their resolution. Do not remove `20598` with this DC set.

The unpaid estimates below all used Virginia shipping and do not verify DC delivery taxes.
The current Virginia food override must not be described as covering the configured DC zone.

## Historical unpaid estimates before physical-board correction

| Scenario | Observed estimate | Result |
| --- | --- | --- |
| $59 delivered board + $5 delivery to Virginia, Virginia billing | $6.49 food tax; $70.49 total | Passed this case. |
| Same Virginia delivery with DC billing | $6.49 food tax; $70.49 total | Passed this case; Virginia shipping controls delivery sourcing. |
| Nine public tour seats ($1,125) + $59 board, Virginia billing | $6.49 tax; $1,190.49 total | Passed this case: service is exempt and the separate board is taxed. |
| Same Virginia tour/board with DC billing | $0 tax; $1,184 total | Historical failure in the non-shipping model; corrected prototype proof follows. |

These were unpaid estimates, with no additional test payment. The later isolated prototype
proves the corrected boarding-destination approach; the live counterpart rollout and the
separate configured DC delivery-area decision must still be completed.
The owner confirmed that no public order-pickup location exists. Native public pickup remains
incompatible; do not enable the private warehouse or expose its address. The approved
physical-board correction below has isolated native checkout proof and still requires the
ordered migration of existing live counterparts.
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
are off. The isolated native shipping/rate prototype passed as recorded below. The 44 existing
On tour variants' shipping flags and inventory locations have **not** been migrated. Keep the
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
results resolve the prototype sourcing failure; they do not assert that the 44 active
counterparts have migrated or that every live product has been rechecked. Retain the earlier
failure as history and follow deployment-before-migration ordering, then verify the active
counterparts. Selected, no-preference/phone-default, private custom Virginia and service-only
presentation remain covered by source/fixture checks and any separately recorded browser
observations, rather than inferred from a single prototype checkout.

The rate rule uses product status ACTIVE and variant title ENDS_WITH **On tour**; no
product-type or tag is needed. Keep the reserved Fulfillment option last. The 645-variant audit
matched 44 live variants plus the active QA target (45), with no ordinary/service/gift matches.
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
