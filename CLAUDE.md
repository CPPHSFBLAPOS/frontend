# CPPHS FBLA Store App: frontend

Point of sale and back office for the Corning-Painted Post High School FBLA school store: register and cash shifts, inventory, Sam's Club pre-auth purchasing with signatures, gift cards, an append-only transaction log, and Treasurer reports.

This repo is the React app. The database, its rules, and the Netlify Functions are in `CPPHSFBLAPOS/backend`; the app reaches the functions at `/api/*`, which this site's `netlify.toml` proxies to the backend site.

Full spec: `docs/SPEC.md`. Read the section for your task before planning.

## Stack
- React 19 + TypeScript + Vite, Tailwind 4, React Router 7, TanStack Query 5, `motion` for animation. Installable PWA (`vite-plugin-pwa`).
- Supabase JS for sign-in (email one-time codes), RPC calls, reads through RLS, and Storage uploads.
- pdf-lib for the closeout, tally sheet, Treasurer and year-end PDFs. signature_pad for signatures, qrcode for gift cards, zod to check function responses.

## Commands
- `npm run dev`: the app at http://localhost:5173 (proxies `/api` to `netlify dev` in the backend repo on :8888)
- `npm run typecheck` and `npm run lint`
- `npm test`: Vitest unit tests (money, cash, ROI, scanner, CSV, offline queue, cart)
- `npm run e2e`: Playwright against a mocked backend (`e2e/mock.ts`). Without Playwright's own browser, set `PW_CHROMIUM_PATH`.
- `E2E_FULLSTACK=1 npm run e2e`: Playwright against the real local stack (`supabase start` + `netlify dev`); needs `SUPABASE_SERVICE_ROLE_KEY`.

## Layout
- `src/routes/` one folder per screen; `src/components/` shared UI; `src/api/` typed wrappers for every RPC, table read and function; `src/lib/` money, dates, cash, ROI and other unit-tested logic; `src/hooks/` auth and shared queries.

## Rules that must never break
- IMPORTANT: Money is integer cents. Show it only through `formatCents`, read it only through `parseDollars`. Components never do math on dollars.
- Every data call goes through a typed wrapper in `src/api/`. Screens never build queries themselves. Writes are always RPCs; the browser never inserts or updates tables.
- Hiding a button is a convenience, not security. The database rejects anything a role can't do.
- The register works by keyboard and scanner alone, with large tap targets.
- Receipt photos and signature images upload straight from the browser to Supabase Storage, never through a function.
- Never store or send a buyer's name. Notes say so in their placeholder.
- Only `VITE_` variables reach the browser bundle; never put a secret in one.

## Motion
- Presets live in `src/components/motion.ts`. `MotionConfig reducedMotion="user"` in `App.tsx` honors the OS setting; keep it.
- Animate to explain a change (a line landing in the cart, a total counting, a signature drawing in), never to delay a cashier. Keep transitions under ~350 ms on the register.

## Workflow
- When you finish a change, run typecheck, lint, `npm test` and `npm run e2e`, and show the output.
- Work on a branch per phase and open a PR into `main`. Ask before adding a dependency.

## Gotchas
- Time zone is America/New_York (`src/lib/dates.ts`). The school year runs September 1 to June 30.
- TanStack mutations use `networkMode: 'always'` so an offline sale fails fast and lands in the IndexedDB queue instead of pausing.
- Each production deploy uses 15 of Netlify's 300 free monthly credits. Test on deploy previews and deploy production about once a week.
