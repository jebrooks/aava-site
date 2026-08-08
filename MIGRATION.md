# Squarespace migration notes

Audit date: 2026-08-08

## What is complete

- Rebuilt responsive header, mobile navigation, announcement bar, footer, and brand design system.
- Localized the selected Squarespace CDN images so the new content pages have no CDN dependency.
- Recreated the homepage and all top-level navigation pages as local Astro routes.
- Added page titles, descriptions, canonical URLs, social metadata, structured business data,
  robots rules, sitemap, keyboard focus styles, reduced-motion support, and a 404 page.
- Added an email fallback for the contact form and environment-based integration seams.
- Kept the build fully static and hosting-provider neutral.

## Public-site inventory

The source sitemap contains 124 URLs:

- 79 individual Squarespace Commerce product pages
- 13 store and category routes
- Primary marketing pages and experience content
- Request, signup, contact, and waiver forms
- Policies, FAQs, press, gift, launch, and campaign pages
- A handful of apparent older or duplicate routes that should be reviewed before cutover

This first pass migrates the six public-facing content pages that define the main site experience.
It does not pretend that static HTML can replace inventory, payments, availability, transactional
email, form storage, or signed waivers.

## Temporary integration boundary

Calls to `legacyUrl()` in `src/` deliberately send visitors to the live Squarespace site for:

- Winery tour availability and booking requests
- Charcuterie products, options, delivery details, cart, and checkout
- Gift certificates
- Custom tour and custom board request forms
- FAQs, current policies, and waivers
- Press and booking-update utility pages

Search for every temporary dependency with:

```sh
rg "legacyUrl" src
```

Do not point `PUBLIC_LEGACY_SITE_URL` at the new production domain during DNS cutover. Replace each
legacy workflow first or use a separately reachable legacy hostname; otherwise those links can
loop back to the new static site.

## Decisions needed before full cutover

1. **Commerce:** choose the system that will own products, size variants, delivery fields,
   inventory, taxes, discounts, gift certificates, payments, and order email.
2. **Tours:** decide whether availability is inventory-backed commerce, a scheduling platform, or a
   purpose-built booking flow. Preserve public/private/custom pricing behavior and minimum group
   rules.
3. **Forms and waivers:** choose where submissions are stored, how consent is recorded, what spam
   protection is required, and who receives notifications.
4. **Email marketing:** export newsletter consent and select the destination list before replacing
   the signup forms.
5. **Content scope:** identify which duplicate, seasonal, launch, and custom-order URLs should be
   migrated, archived, or redirected.
6. **Hosting:** choose the static host after the integration model is known. If integrations need
   server-side endpoints, confirm that the host supports the required functions or use a separate
   API service.

## Recommended cutover sequence

### 1. Export and normalize data

- Export the Squarespace product catalog, variants, SKUs, prices, descriptions, and images.
- Export form submissions, customer/order records, newsletter contacts, and discount/gift data as
  permitted by the selected destination systems.
- Create a route spreadsheet marking each current URL as migrate, redirect, or retire.

### 2. Replace transactions

- Import products into the chosen commerce system and validate delivery-date/time fields.
- Rebuild tour availability and custom estimate flows.
- Connect contact, request, newsletter, and waiver forms.
- Replace every `legacyUrl()` call with the corresponding local or hosted workflow URL.

### 3. Preserve search and analytics

- Keep current URL slugs wherever practical.
- Add permanent redirects for every retired or renamed path.
- Expand `public/sitemap.xml` to include the final canonical routes.
- Add the selected analytics and consent configuration only after reviewing privacy requirements.

### 4. Rehearse the launch

- Deploy to a preview hostname and test desktop/mobile navigation, forms, booking, cart, checkout,
  confirmation emails, refunds/cancellations, gift certificates, and redirects.
- Crawl both the old and preview sites and compare route coverage.
- Lower DNS TTL ahead of the change, preserve a rollback path, and keep Squarespace reachable until
  transactions and redirects have been verified in production.

## Definition of full migration

The Squarespace subscription is safe to retire only when no required link, asset, form, product,
checkout, policy, email, or redirect depends on it and historical data has been exported and
retained according to the business's needs.
