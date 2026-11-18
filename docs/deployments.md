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

For a verified example of these links, see the [Vercel comment on PR #18](https://github.com/jebrooks/aava-site/pull/18#issuecomment-6899782748).
Use each PR's current comment rather than copying that example's hostname for another change.

If the comment is missing, open the Vercel project → Deployments, find the branch/commit with
environment **Preview**, and open its deployment URL. If protection requests authentication,
sign in with an account that has project access or ask the project owner for authorized access.
Manage Vercel Deployment Protection in the Vercel dashboard. The Astro storefront also supports
an optional [shared password](#storefront-password) configured per environment.

There is a preview per branch/deployment, rather than one fixed hostname for every PR.
`https://aava-site.vercel.app` is the primary project alias; use the actual PR preview URL to review
unmerged work. Internal navigation stays on the host being visited. Canonicals, sitemap URLs, and
social metadata deliberately use `https://www.allaboardva.com`, the intended canonical domain;
that configuration alone does not establish that DNS cutover is complete.

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
forms, draft orders, bookings, catalog syncs, and email can affect the same external services as
Production. Use an explicitly configured test store/payment setup for transaction testing.
Current environment values and isolation must be checked in Vercel; they are not recorded here.

## Storefront password

To gate the Astro storefront, set `SITE_ACCESS_PASSWORD` as a sensitive server environment
variable in Vercel. Use a long, randomly generated password. Configure Preview before pushing
or redeploy the preview to test with the gate enabled. Set a separate value in Production before
deploying the change there. The browser prompt uses the username `visitor` and the configured
password. Use the HTTPS site URL and share the password through your password manager.

Verify in a private window that the homepage and a deep link prompt for credentials, that a wrong
password is rejected, and that the correct password opens the site. The gate covers Astro pages
and APIs. Static assets are served by Vercel, and Shopify hosts its own checkout. The signed
Shopify webhook and the two bearer-authenticated Vercel cron routes keep using their existing
credentials. To confirm those routes reach their handlers without affecting Shopify, send an
unsigned webhook POST with an `application/json` body and cron GETs without authorization. Each
should return its own rejection without a browser password challenge.

To change or remove the password, update or delete the variable and redeploy the affected
environment. Previously generated deployment URLs retain their original configuration. Manage
access to those URLs separately through Vercel Deployment Protection.

## Production and scheduled work

Keep the Vercel Production Branch set to **`main`** under project Git settings. Merging an approved
PR into `main` triggers the production deployment. Verify its commit, Ready state, and critical
routes after the merge. Recent repository deployment records confirm production deployments for
merged PR commits; check project settings when changing the deployment arrangement.

Vercel runs configured cron jobs on Production, not automatically on PR previews:

| Endpoint | Daily UTC schedule | Purpose |
| --- | --- | --- |
| `/api/cron/materialize-delivery` | 05:15 | Reconcile delivery date inventory |
| `/api/cron/materialize-tours` | 03:00 | Reconcile tour dates and then on-tour board variants |

Both endpoints require `Authorization: Bearer <CRON_SECRET>`. Calling an authenticated endpoint
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
  generated inventory, and latest production sync result before attempting a reconciliation.
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
