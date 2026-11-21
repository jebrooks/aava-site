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
- On-tour food remains an **open integration blocker**: its non-shipping fulfillment makes
  Shopify source tax from billing. A legitimate DC billing address produces $0 tax for food
  served on a Virginia tour, while Virginia billing produces the intended $6.49 on a $59 board.

## Open delivery-area mismatch

Shopify currently has an active **Local Delivery – D.C. (Zone 5)**, with a $20 fee and ten codes:
`20001`, `20003`, `20005`, `20006`, `20007`, `20008`, `20009`, `20024`, `20036`, `20037`. They exactly
match the DC entries in the 112-code authoritative `delivery_schedule/default.eligible_zips`
list. This conflicts with the owner's stated Virginia-only scope and is a second open
configuration/integration issue. The owner requested an audit only; no zone or schedule setting
has been changed pending their resolution. Do not remove `20598` with this DC set.

The unpaid estimates below all used Virginia shipping and do not verify DC delivery taxes.
The current Virginia food override must not be described as covering the configured DC zone.

## Actual unpaid checkout estimates

| Scenario | Observed estimate | Result |
| --- | --- | --- |
| $59 delivered board + $5 delivery to Virginia, Virginia billing | $6.49 food tax; $70.49 total | Passed this case. |
| Same Virginia delivery with DC billing | $6.49 food tax; $70.49 total | Passed this case; Virginia shipping controls delivery sourcing. |
| Nine public tour seats ($1,125) + $59 board, Virginia billing | $6.49 tax; $1,190.49 total | Passed this case: service is exempt and the separate board is taxed. |
| Same Virginia tour/board with DC billing | $0 tax; $1,184 total | Failed: non-shipping food is sourced from billing. |

These were unpaid estimates, with no additional test payment. Tax acceptance is incomplete
until on-tour food has the correct Virginia sourcing for legitimate out-of-state billing and
the configured DC delivery area is reconciled with the intended service area.
The owner explicitly confirmed that no public order-pickup location exists. Native pickup
is incompatible with the operating workflow; do not enable the private warehouse or expose
its address as a workaround. A supported alternative is still under investigation.
Do not ask customers to falsify billing details. Keep the historical pre-change zero-tax orders
in the results report; they do not establish correctness after configuration.

## Supported resolution still required

Research has not identified a documented native fix for the current no-address, non-shipping
onboard-food workflow. Manual Shopify invoices also fall back to billing for sourcing, so they
are not a verified solution. No tax app has been installed and no provider/support message has
been sent. Avalara or another provider must not be presented as a verified fix.

Shopify's [Tax Partner Apps platform](https://shopify.dev/docs/apps/build/tax) is restricted to
selected tax providers. A [third-party tax app](https://help.shopify.com/en/manual/taxes/tax-apps)
replaces the store's native tax service and can fall back to the existing native settings during
an outage. Before adopting that route, obtain explicit provider confirmation, demonstrate this
case in a sandbox, regress all store purchase types, and resolve the outage/fallback behavior.

Use this support question:

> Can Shopify Basic source Virginia onboard prepared food correctly for taxable non-shipping
> variants when the customer has a genuine out-of-state billing address and there is no public
> pickup location or customer shipping address? Can legitimate event/fulfillment facts or line
> properties supply that sourcing while preserving separate meals/sales-tax reporting and
> correct refund treatment? Please confirm supported configuration, sandbox verification and
> behavior when the tax provider is unavailable.

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
