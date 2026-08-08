# All ABoard VA website

A portable Astro rebuild of the public All ABoard VA Squarespace site. The project is developed
locally, produces a static `dist/` directory, and can be deployed to any host that serves static
files.

## Get started

Prerequisite: Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

Astro will print the local URL, normally `http://localhost:4321`.

Run the production checks and build with:

```sh
npm run build
npm run preview
```

## Deployment contract

The project intentionally has no provider-specific adapter.

- Install command: `npm ci`
- Build command: `npm run build`
- Publish/output directory: `dist`
- Required server runtime: none after the build

These settings work with common static hosts and ordinary web servers. Choose the final provider
after deciding how checkout, booking availability, and form submissions will be handled.

## Environment variables

Copy `.env.example` to `.env` for local overrides.

- `PUBLIC_LEGACY_SITE_URL` points temporary booking, checkout, product, and policy links to the
  current Squarespace site during the staged migration.
- `PUBLIC_CONTACT_FORM_ENDPOINT` connects the contact form to a hosted form endpoint. Without it,
  the form opens a pre-filled message in the visitor's email application.

Never store API keys, payment credentials, or private form secrets in a `PUBLIC_` variable. Public
variables are included in browser-delivered files.

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
  layouts/             SEO and document shell
  pages/               File-based site routes
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

The original sitemap contains 124 URLs, including 79 product pages and 13 store/catalog routes.
Those transactional pages, booking requests, waivers, and checkout still open the current
Squarespace site. See [MIGRATION.md](./MIGRATION.md) for the remaining cutover work.

## Updating content

- Shared company details and legacy integration URLs live in `src/data/site.ts`.
- Page copy lives in the matching file under `src/pages/`.
- Brand colors, typography, and layout rules live in `src/styles/global.css`.
- To refresh source images from the public Squarespace CDN, run `./scripts/fetch-assets.sh` and
  review the resulting binary changes before committing.

The images and copy in this repository were migrated from the existing All ABoard VA site and
should only be used where the site owner has the necessary rights.
