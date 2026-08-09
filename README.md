# All ABoard VA website

A headless Astro rebuild of the public All ABoard VA Squarespace site. Marketing content and the
branded charcuterie storefront live in Astro; Shopify owns products, inventory, carts, checkout,
payments, gift cards, draft-order invoices, and orders. The production runtime targets Vercel.

## Get started

Prerequisite: Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

Astro will print the local URL, normally `http://localhost:4321`.

Run the production checks and Vercel build output with:

```sh
npm run build
```

Use `npm run dev` for local route testing; the Vercel adapter does not provide a portable
standalone preview server.

## Deployment contract

The project uses the Astro Vercel adapter because Shopify Admin API calls, delivery scheduling,
webhook verification, and custom-order requests require trusted server-side code.

- Install command: `npm ci`
- Build command: `npm run build`
- Framework preset: Astro
- Required runtime: Vercel Functions
- Scheduled task: `/api/cron/materialize-delivery` daily at 05:15 UTC

Marketing pages can still be prerendered later, but the catalog, product pages, cart API, dynamic
sitemap, and server integrations require the configured adapter.

## Environment variables

Copy `.env.example` to `.env` for local overrides.

- `PUBLIC_LEGACY_SITE_URL` points temporary booking, checkout, product, and policy links to the
  current Squarespace site during the staged migration.
- `PUBLIC_CONTACT_FORM_ENDPOINT` connects the contact form to a hosted form endpoint. Without it,
  the form opens a pre-filled message in the visitor's email application.
- The server-side Shopify Storefront token powers catalog and cart operations.
- The Shopify Admin token, webhook secret, cron secret, location/publication IDs, and Turnstile
  secret are server-only.

Never store API keys, payment credentials, or private form secrets in a `PUBLIC_` variable. Public
variables are included in browser-delivered files.

Copy `.env.example` to `.env`, then follow [SHOPIFY.md](./SHOPIFY.md) to create the Shopify custom
app, catalog collection, delivery schedule, migration exports, webhooks, and Vercel variables.

## Project structure

```text
public/
  images/              Localized brand and content assets
scripts/
  assets.curl          Reproducible public asset download manifest
  fetch-assets.sh      Asset refresh helper
src/
  components/          Shared header, footer, buttons, and page hero
  data/site.ts         Contact details, navigation, products, legacy URL helper
  lib/shopify/         Storefront/Admin clients, carts, scheduling, and draft orders
  layouts/             SEO and document shell
  pages/               File-based content, commerce, and API routes
  styles/global.css    Brand tokens and responsive design system
```

## Current migration boundary

The homepage and the five primary content routes are local:

- `/`
- `/experiences`
- `/charcuterie`
- `/experience-guide`
- `/about`
- `/contact`

The codebase now includes Shopify-backed catalog/product routes, a local cart, scheduled-delivery
selection, hosted checkout handoff, gift-card product support, and draft-order custom requests.
Until Shopify credentials and migrated products are supplied, the existing board showcase falls
back to Squarespace links. Tours, waivers, policies, and some utility content remain on Squarespace.
See [MIGRATION.md](./MIGRATION.md) for cutover status and [shopify-plan.md](./shopify-plan.md) for the
agreed architecture.

## Updating content

- Shared company details and legacy integration URLs live in `src/data/site.ts`.
- Page copy lives in the matching file under `src/pages/`.
- Brand colors, typography, and layout rules live in `src/styles/global.css`.
- To refresh source images from the public Squarespace CDN, run `./scripts/fetch-assets.sh` and
  review the resulting binary changes before committing.

The images and copy in this repository were migrated from the existing All ABoard VA site and
should only be used where the site owner has the necessary rights.
