# CPPHS FBLA Store: app

The web app for the Corning-Painted Post High School FBLA school store: register and cash shifts, inventory, Sam's Club pre-auth purchasing with signatures, gift cards, the transaction log, and Treasurer reports. One React app runs on the store laptop, Chromebooks, phones and the Advisor's browser, and installs like an app (PWA).

The database, its rules, and the server functions live in [`CPPHSFBLAPOS/backend`](https://github.com/CPPHSFBLAPOS/backend); daily operations are in its [RUNBOOK.md](https://github.com/CPPHSFBLAPOS/backend/blob/main/RUNBOOK.md). The full spec is [docs/SPEC.md](docs/SPEC.md).

## Screens

| Path | Who | What |
| --- | --- | --- |
| `/` | Everyone | Status checks (database, functions), quick actions, what needs you |
| `/register` | Register account, cashiers, officers | Open a shift with a PIN and counted drawer, product grid with search and USB scanner, cart, cash/gift/promo split payments, voids, refunds, handoffs, outage entry, training mode, close with over/short, offline queue |
| `/inventory` | Officers | Products, prices, costs, stock adjustments, quick and full counts, movements, categories, Base44 CSV import |
| `/preauth`, `/preauth/:id` | Officers, Advisor | The Preauthorization Purchase Order Form: Sam's Club lookup, ROI per line, the $300 meter, signatures, purchase, receipts, receiving, closing, PDF |
| `/gift-cards` | Everyone who sells | Look up, issue promo or blank cards, deactivate and transfer, print with QR codes, Base44 import |
| `/reports` | Officers | Dashboard vs last year, forecast, Products, Restock, Cash, Gift cards, Shrink, Purchasing, Staff and comps, CSV everywhere, Monthly Treasurer Report and year-end PDFs |
| `/log` | Officers (cashiers see their own) | Filterable transaction log, Check Log (hash chain), CSV and PDF |
| `/members` | Super Admin, Advisor | People, roles, PINs |
| `/settings` | Super Admin, Advisor | Store rules, open days, device name |

## Motion and look

The app follows the pre-auth demo's look: a navy band with a gold rule, white paper cards on a gray desk, condensed Archivo headings, Public Sans text and IBM Plex Mono numbers, with a matching dark mode. Motion is used to explain what just happened:

- Page transitions, a nav pill and tab underlines that glide to the selection, staggered lists and tables.
- Register: tiles lift on hover and pop a “+1” when tapped, sold-out tiles shake, cart lines slide in and out, quantities and totals count, the checkout success draws a checkmark and counts up the change due, a floating cart bar slides up on phones, training mode slides in a striped banner.
- Pre-auth: the stepper fills as the form moves along, the $300 meter springs and turns amber then red, ROI chips update in place, saved signatures replay as if being written.
- Reports: KPIs count up, chart bars grow in sequence, gift cards tilt toward the pointer.
- Everything respects the OS “reduce motion” setting.

## Set up

```sh
npm install
cp .env.example .env.local   # VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from `supabase start` in the backend repo
npm run dev                  # http://localhost:5173
```

Run `netlify dev` in the backend repo too; the dev server proxies `/api/*` to it on port 8888. Sign in as one of the seeded test people (see the backend README); codes show up in Mailpit at http://localhost:54324.

## Tests

```sh
npm run typecheck && npm run lint
npm test                      # Vitest
npm run e2e                   # Playwright, mocked backend: sign-in, register, scanner, offline queue, pre-auth, reports
E2E_FULLSTACK=1 npm run e2e   # Playwright on the real local stack: a shift to $0.00, a pre-auth from draft to closed
```

The full-stack run needs `supabase start` and `netlify dev` running in the backend repo and `SUPABASE_SERVICE_ROLE_KEY` set (it mints sign-in codes through the local admin API). The "E2E (full stack)" workflow runs it in GitHub Actions on demand.

## Deploying

1. Create a Netlify site from this repo on the store's team. Build command and publish directory come from `netlify.toml`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the site's build settings. They are public by design; never add a secret with a `VITE_` prefix.
3. In `netlify.toml`, point the `/api/*` redirect at the backend site's URL.
4. Pull requests get deploy previews (free). Merge to `main` about once a week to save credits.
