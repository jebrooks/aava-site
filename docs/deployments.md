# Deployments and preview review

The repository is [jebrooks/aava-site](https://github.com/jebrooks/aava-site). The connected Vercel
project is [aava-site](https://vercel.com/jebrooks-projects/aava-site).

## Pull requests and previews

1. Create a branch, make the change, and run relevant local checks. `npm run build` runs Astro
   checks and produces the Vercel build output.
2. Push the branch and open a PR against `main`. Vercel's GitHub integration builds Preview
   deployments for branch pushes and updates its PR comment as deployments become ready.
3. Wait for the **Vercel** status and the separate **Catalog parity** GitHub Actions check.
   The deployment can be ready even when the Actions check fails; inspect both.
4. In the PR conversation, find the **vercel** bot comment and click **Preview** in the Actions
   column. **Ready** opens deployment details, where build status and logs can be inspected.
5. Verify the deployment commit matches the current PR head before testing. Add the preview URL,
   affected routes, and validation results to the PR handoff.
6. Provide matching local review links from `http://127.0.0.1:4330`, with the development server
   running from this worktree on the PR branch. Leave that server running for the owner's review.
   Local review is a second option alongside the Vercel preview, not a replacement for its check.

For a verified example of these links, see the [Vercel comment on PR #18](https://github.com/jebrooks/aava-site/pull/18#issuecomment-6899782748).
Use each PR's current comment rather than copying that example's hostname for another change.

If the comment is missing, open the Vercel project → Deployments, find the branch/commit with
environment **Preview**, and open its deployment URL. If protection requests authentication,
sign in with an account that has project access or ask the project owner for authorized access.
Access-protection settings are managed in Vercel and are not defined in this repository.

There is a preview per branch/deployment, rather than one fixed hostname for every PR.
`https://aava-site.vercel.app` is the primary project alias; use the actual PR preview URL to review
unmerged work. Internal navigation stays on the host being visited. Canonicals, sitemap URLs, and
social metadata deliberately use `https://www.allaboardva.com`, the intended canonical domain;
that configuration alone does not establish that DNS cutover is complete.

## Local PR review

The local site runs with **`npm run dev`** at **`http://127.0.0.1:4330`**. It serves the files
currently checked out in this worktree. A link such as `/booking` works on either host:

- Local: `http://127.0.0.1:4330/booking`
- Vercel: the current PR's Preview hostname followed by `/booking`

Unlike Vercel's per-branch deployments, the single local URL is not a permanent preview of each
PR. Switching branches changes what it serves, and uncommitted edits also appear locally. Confirm
the branch and commit before review; do not switch away from unfinished work just to start a server.
Local links work on this Mac while the server is running. The fixed `127.0.0.1` host does not expose
the site to another computer or a phone.

Use the existing worktree and one server:

1. Check the current checkout with `git status --short` and `git branch --show-current`.
   Use `git log -1 --oneline` to confirm the commit. To review an older PR, save current work
   before switching to its branch (for example, `gh pr checkout <number>`).
2. Check port 4330 with `lsof -nP -iTCP:4330 -sTCP:LISTEN`. Reuse this project's server if it is
   already running with the intended branch/configuration; do not start another instance.
3. Start only with `npm run dev`. The project fixes host/port and enables strict-port behavior.
4. After switching branches or changing `.env`, stop the existing project server with
   `npm run dev -- stop`, confirm the port is free, then start it again with `npm run dev`.
5. Open the affected local page and check that its data loads. Include that link, the Vercel
   page link, the PR link, and any configuration gaps in the handoff. Leave the local server
   running for this requested review; stop it when local review is no longer needed.

There is no extra Node API server, database, or Shopify import to start. Astro runs both pages and
same-site API routes. Use `npm run dev` for local review: this project's Vercel adapter does not
provide a portable standalone server through `npm run preview` or `.vercel/output`.

### Local environment coverage

Vercel environment variables do **not** automatically populate the ignored local `.env`. Keep
`.env.example` as the variable-name contract, copy only the needed values from an authorized
source, and restart the development server after edits. Do not overwrite a populated `.env`
with the example or commit credentials. These are the functional groups:

| Local feature | Configuration |
| --- | --- |
| Published catalog, product pages, gift amounts, carts | `PUBLIC_SHOPIFY_STORE_DOMAIN`, `SHOPIFY_STOREFRONT_ACCESS_TOKEN`; use the intended API version and collection handle |
| Announcements, gift-guide tour prices, delivery settings, tour settings and tour inventory | Same store plus `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET` (or the optional `SHOPIFY_ADMIN_ACCESS_TOKEN` fallback) |
| Catalog, delivery and tour maintenance | Correct `SHOPIFY_DELIVERY_LOCATION_ID`, `SHOPIFY_STOREFRONT_PUBLICATION_ID`, and relevant collection IDs/handle |
| Physical on-tour board fulfillment | Server-only `SHOPIFY_TOUR_BOARD_LOCATION_ID` for the dedicated bus location; required in both Vercel Preview and Production and in local/script configuration when testing or synchronizing this feature |
| Contact, inquiry and custom-board request email | `RESEND_API_KEY` and `CONTACT_EMAIL_FROM` using an approved, verified sender |
| Manual cron testing | `CRON_SECRET` and the relevant Shopify credentials/IDs; this performs catalog writes |
| Webhook verification | `SHOPIFY_WEBHOOK_SECRET` or the configured app client secret; Shopify cannot deliver to a loopback-only URL |

Browsing products and checking availability do not require Resend. A configured Admin client
credential pair does not also require the legacy Admin access token. Cron does not run on a
schedule locally; deployed webhooks and scheduled jobs continue to operate on their configured
Vercel endpoints. BotID uses development behavior locally, so test its deployed protection on
Vercel. Local checkout still hands off to Shopify-hosted checkout, and shared Shopify/email
credentials can affect the same services as Production. Use read-only checks for ordinary local
preview validation; verify service targets before any submission or reconciliation.

### Physical on-tour board rollout

Use this standing sequence for fulfillment changes to existing counterparts. It preserves
compatibility between Production checkout/sync code and Shopify data. The November 21
prototype and subsequent live rollout are recorded separately in the
[results](transactional-test-results-2026-11-21.md).

1. Create the dedicated bus/On tour board fulfillment location with the legitimate preparation
   address. Keep public pickup and local delivery disabled there. Configure the separate
   zero-cost Virginia-only board fulfillment method with the exact title **Charcuterie provided on your tour — pickup arranged by phone**; it must not offer customer home delivery. Its eligibility
   is product status ACTIVE plus variant title ENDS_WITH **On tour**, with no product-type/tag
   requirement. Preserve **Fulfillment** as the final option so titles match; fail closed if
   merchant reordering makes the intended rate unavailable.
2. Set server-only `SHOPIFY_TOUR_BOARD_LOCATION_ID` to that location's real GraphQL ID in
   **both Preview and Production**, plus the ignored local `.env`/maintenance script environment
   when used. Never invent a location ID or publish the private preparation address as a
   customer pickup point. Redeploy each affected Vercel environment after setting the variable.
   Synchronization performs a read-only location preflight before any writes: the configured
   location must exist, be active, fulfill online orders, and differ from the ordinary
   `SHOPIFY_DELIVERY_LOCATION_ID`. A setup failure must stop before shipping-flag or inventory
   location changes; sharing a legitimate preparation street does not mean reusing its ID.
3. Deploy the compatible Production checkout, cron and webhook synchronizer code **before**
   applying changes to existing active On tour variants' shipping/location flags. The
   old Production synchronizer could revert a premature physical-board migration. Preserve all product/source
   IDs, prices, inventory and booking history; use the read-only sync plan before applying.
4. Migrate/reconcile the existing counterparts only after that deployment, then verify their
   physical fulfillment and dedicated location/rate. Tour seat/bus service stays non-shipping
   and non-taxable; food stays taxable. Billing must remain the customer's genuine address.
5. Verify the same unpaid tour-plus-board checkout with Virginia, Maryland and DC billing.
   Require $6.49 food tax on a $59 board under the current 11% rule, $0 tour-service tax and $0
   tour-board fulfillment. Check selected, Arrange by phone/default and private custom Virginia
   pickup paths, all explicitly tentative and phone-coordinated on both booking and native
   checkout. Also check tour-only/included-sandwich bookings: no default NorthSide address or
   delivery address may be introduced. Missing location, wrong rate, changed address or an
   unsupported destination must fail usefully. Record the live counterpart/method checks after
   migration; the passed prototype is not evidence that all live products have been migrated.

The pre-cleanup rate audit matched 44 live variants plus one QA variant among 645 total, with
zero ordinary/service/gift matches. The QA fixture was then archived/unpublished; the rule now
covers 22 ACTIVE products/44 live targets and zero QA targets. Routine sync is
broader than the initial active migration: its observed plan included 69 targets across 35
members, with 25 inactive targets; review the actual dry run before routine maintenance.

Do not introduce a home-delivery calendar into booking or enable native public warehouse
pickup. Ordinary-board delivery zones remain separate; the owner authorized removing the ten
DC ZIPs from both native delivery and the authoritative schedule while retaining Virginia 20598;
the recorded save/readback and native checkout checks passed. Maintain both settings together
for any future service-area change. See [tax maintenance](virginia-tax-maintenance.md) and
[pickup ownership](content-management.md#tour-pickup-addresses-and-phone-coordination).


## What runs where

| Mechanism | Responsibility |
| --- | --- |
| Vercel GitHub integration | Build and host previews; deploy the production branch |
| `.github/workflows/catalog-parity.yml` | Tests, production build, Shopify catalog comparison, and internal-link crawl for PRs targeting `main`, merge groups, and manual runs |
| `vercel.json` | Redirects and production cron schedules |
| `astro.config.mjs` | Server-rendered Astro with the Vercel adapter and fixed local development address |

The Actions workflow does not publish the preview. It needs its own GitHub Actions secrets and
variables as described in [SHOPIFY.md](../SHOPIFY.md#github-catalog-parity-gate); Vercel variables
do not supply those automatically. Treat **Catalog parity** as a merge prerequisite. Branch
rulesets enforce required checks in GitHub settings; the workflow file alone does not enforce them.

Review navigation, changed layouts at desktop/mobile widths, images, and relevant forms or booking
flows. `/tour-booking-preview` is an isolated review page within a deployment, not the deployment
itself; the customer planner is on `/experiences` and continues to `/booking`.

## Environment variables — Preview and Production

**Set every required Vercel application environment variable for both Preview and Production.**
In the project, open **Settings → Environment Variables** and select both environments when
adding a shared value, or supply a deliberately different value for each. A variable scoped only
to Production is unavailable to PR previews. Redeploy the affected environments after adding or
changing values; existing deployments retain their previous configuration.

Use [`.env.example`](../.env.example) as the variable-name contract. Configure the applicable
Shopify Storefront/Admin credentials, domain, API version, collection/location/publication IDs,
Resend sender credentials, webhook secret, and cron secret. Optional fallback variables are
identified in that file. Prefer the Dev Dashboard Client ID/secret authentication path; the
Admin access-token fallback is optional. Use `.env` separately for local development and scripts.
Keep secrets server-only and out of PR descriptions, logs, screenshots, and source control.

Check which Shopify store, publication, and email sender each environment uses before tests that
write data. A Preview deployment is not a separate Shopify sandbox: with shared credentials,
forms, bookings, catalog syncs, and email can affect the same external services as Production.
Custom-board form tests send staff email through Resend but create no Shopify draft/order;
testing a staff-created invoice is a separate Shopify write. Use an explicitly configured test
store/payment setup for transaction testing.
Current environment values and isolation must be checked in Vercel; they are not recorded here.

## Production and scheduled work

Keep the Vercel Production Branch set to **`main`** under project Git settings. Merging an approved
PR into `main` triggers the production deployment. Verify its commit, Ready state, and critical
routes after the merge. Recent repository deployment records confirm production deployments for
merged PR commits; check project settings when changing the deployment arrangement.

Vercel runs configured cron jobs on Production, not automatically on PR previews:

| Endpoint | Daily UTC schedule | Purpose |
| --- | --- | --- |
| `/api/cron/materialize-tours` | 03:00 | Reconcile tour dates and then on-tour board variants |

The endpoint requires `Authorization: Bearer <CRON_SECRET>`. Calling an authenticated endpoint
manually can write to the configured store, including when called on Preview. Inspect results
and Vercel logs for failures, incomplete backfills, or lock contention. See the
[content guide](content-management.md) and [Shopify runbook](../SHOPIFY.md) before reconciliation.

## Troubleshooting and rollback

- **No preview:** inspect the Vercel check, Git integration, deployment authorization, and build logs.
- **Preview missing content or forms failing:** compare Preview variable coverage with Production,
  redeploy after correcting scope, then verify the upstream service and publication configuration.
- **Catalog parity fails:** inspect the Actions log and its separately configured Shopify credentials;
  confirm product publication/collection membership and the reported broken links.
- **Availability differs from schedule:** check the authoritative metaobjects, shared blackouts,
  and latest production tour sync result before attempting a reconciliation.
- **Regression after release:** restore a known-good production deployment using Vercel's rollback
  controls, or revert the change through a PR. Verify the active deployment and affected flows.
  Rolling back code does not undo Shopify edits, orders, inventory changes, or sent email; reconcile
  external changes separately and preserve customer history.

Update this guide whenever the branch, hosting, environment contract, deployment checks, or
review workflow changes. Do not record transient deployment URLs as a permanent staging address.

## Platform references

- [Vercel for GitHub](https://vercel.com/docs/git/vercel-for-github): branch deployments and PR links.
- [Environment variables](https://vercel.com/docs/environment-variables): environment scopes,
  branch overrides, and redeployment after edits. Ensure shared Preview variables cover all
  intended branches; a branch override can take precedence.
- [Cron jobs](https://vercel.com/docs/schedules/cron-jobs): invocation against Production deployments.
