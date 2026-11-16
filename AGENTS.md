# Project agent instructions

## Project context

- This repository contains the All ABoard VA website, built with Astro and TypeScript and deployed to Vercel.
- Astro owns the site presentation; Shopify owns products, inventory, carts, checkout, and orders.
- Read `README.md` for setup and architecture, `SHOPIFY.md` for commerce integrations, and `MIGRATION.md` for migration status when relevant to the task.
- Shared UI lives in `src/components/`, routes in `src/pages/`, commerce code in `src/lib/shopify/`, and brand styles in `src/styles/global.css`.

## Maintaining content

- Read [content management](docs/content-management.md) before changing content or operational settings. Edit the authoritative source rather than adding a code override for Shopify-managed content.
- Shopify Admin → Content → Metaobjects owns announcements (`announcement_banner`), delivery settings (`delivery_schedule/default`), tour settings and prices (`tour_schedule/default`), and shared closures (**Blackout dates → Business blackout dates**, `booking_blackouts/default`).
- Native gift-card products belong in the charcuterie collection and Headless publication; `/gift-certificates` discovers them using Shopify’s `isGiftCard` flag. Recipient and send-date prompts live in the Astro product form and use native Shopify line properties; theme settings do not configure them. See the content guide for maintenance.
- Shopify products, product metafields, collections, and publication settings own the commerce catalog. Generated date products, bundles, and on-tour variants are managed by synchronization code.
- Marketing copy lives in `src/pages/`; company details and featured boards in `src/data/site.ts`; ingredient options in `src/data/board-customizations.json`; tour choices in `src/data/tour-options.ts`; policies and source/amendment metadata in `src/data/policies.json`; and press in `src/data/press.ts`.
- Announcement edits take about a minute to appear. Schedule edits need catalog reconciliation as described in the guide; shared blackout checks read the list directly. Repository edits require deployment.
- Preserve booked inventory, bundle relationships, and order history. Schedule edits do not cancel existing bookings. Do not rerun setup/import scripts with stale defaults for routine maintenance.
- Update the relevant guide when content ownership, fields, behavior, or maintenance workflows change. Keep `README.md` as the documentation index, `SHOPIFY.md` as the integration runbook, and `MIGRATION.md` as cutover/history context. Use linked guides for detail; no separate `.ai/rules/` layer is needed for this project.

## Pull requests and deployment

- Read [deployments and preview review](docs/deployments.md) for the full workflow. Use PRs targeting `main`; Vercel deploys branch pushes as previews and `main` as Production.
- Check both the Vercel deployment status and the separate `Catalog parity` Actions check before merging.
- Open the PR's Vercel bot comment → **Preview** to review the site. **Ready** opens deployment details. Confirm the deployment matches the latest PR commit and include the preview URL, affected routes, and validation results in the handoff.
- In the final handoff, include both the PR link and a direct link to an affected page on the PR's Vercel preview site. For multiple affected pages, include the most useful review links.
- Set required Vercel environment variables for **both Preview and Production**, and redeploy each affected environment after changes. GitHub Actions credentials are configured separately.
- Confirm the configured external services before write-based preview testing: shared Shopify or email credentials can affect live services. Keep internal navigation relative so reviews stay on the preview host.

## Development and validation

- Follow the existing components, brand styles, and integration patterns.
- Use `npm run check` for Astro and TypeScript validation and `npm run build` to validate the production build.
- Run the relevant `test:*` scripts from `package.json` when changing the behavior they cover.
- Keep credentials and private data out of source control and tool output. Use `.env.example` for configuration names; server secrets must never use the `PUBLIC_` prefix.

## Local development server

- Keep at most one Astro development server running for this worktree.
- Before starting one, check port 4330 with `lsof -nP -iTCP:4330 -sTCP:LISTEN`.
- If port 4330 already has this project's server, reuse `http://127.0.0.1:4330` and do not run `npm run dev` again.
- Start the server only with `npm run dev`. Do not override its host or port; the project config fixes port 4330 and enables strict-port behavior to prevent automatic fallback to 4331 or later ports.
- When a restart is necessary, stop the existing project server first, confirm port 4330 is free, and then start its replacement.
- Stop any temporary server you started before handing the task back unless the user asked to leave it running.
