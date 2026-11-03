# DuoPlus Admin

Secure internal admin panel for a multi-product company. One login, a product switcher, and one admin per product.
The first product is **DiscoNotify** (a Discord bot that sends social-media alerts, billed per server).

- **Admins only.** Two roles: `owner` (also manages admins) and `admin`. There is no support or viewer role.
- **Stack:** Next.js 15 (App Router, TypeScript strict), TailwindCSS, Supabase (existing project), zod.
- **Desktop only** (min 1280px), light and dark theme.

## How the data is laid out

Everything lives in your **existing Supabase project** and database, in two schemas:

| Schema | Owner | Purpose |
|---|---|---|
| `disconotify` | the bot (existing) | Servers, billing, payments, contacts, platform health. The panel reads it and changes it only through audited SQL functions. |
| `duolplus_admin` | this panel (new) | `hub_admins`, `hub_admin_products`, `hub_products`, `hub_audit_log` (append-only), `hub_login_attempts`, `hub_recovery_codes`. |

## Setup

1. **Supabase Auth settings**: disable public sign-ups (Authentication > Sign In / Providers > "Allow new users to sign up" off).
2. **Run the migration** `supabase/migrations/20261017000000_hub_schema.sql` (SQL editor or `supabase db push`).
3. **Expose the schemas**: Settings > API > Exposed schemas must include `duolplus_admin` and `disconotify`.
4. **Environment**: copy `.env.example` to `.env.local` and fill it in.
5. **Create your login**: in Supabase Authentication > Users, add a user with your email and a strong password
   (tick Auto Confirm User). Set the same email as `INITIAL_OWNER_EMAIL`.
6. `pnpm install`, then `pnpm dev`. Sign in with that email and password. The first successful login for
   `INITIAL_OWNER_EMAIL`, while no admin exists, creates the first owner automatically (there is no seed step).
   You are then asked to enrol an authenticator and save the 8 recovery codes.
7. Add more admins from the Admins page (owner only). The owner chooses an initial password for each.

## Environment variables

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Used only by server-side auth calls; the browser never talks to Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only.** Bypasses RLS. Never prefix with `NEXT_PUBLIC_` |
| `HUB_URL` | Public origin of the panel (same-origin check, email redirects) |
| `SESSION_SECRET` | 32+ random characters; signs session-timing and step-up cookies |
| `INITIAL_OWNER_EMAIL` | The first password login with this email creates the first owner (only while no admin exists) |
| `DISCONOTIFY_POLAR_SANDBOX` | `true` = Polar sandbox, `false` or unset = live. Must equal the bot's own `POLAR_SANDBOX`; the token below must come from the same environment |
| `DISCONOTIFY_POLAR_ORG_SLUG` | Optional; builds Polar deep links (the slug differs between sandbox and live) |
| `DISCORD_BOT_TOKEN` | Optional; server only. Lets the panel show server names and icons (looked up read-only from Discord, cached 6 hours). Without it servers show by ID |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Run, build, serve |
| `npm run lint` / `typecheck` / `test` | CI checks |
| `npm run check:contrast` | WCAG AA (4.5:1) check of both themes from the CSS tokens |
| `npm run check:bundle` | After a build: greps `.next/static` for secrets |
| `npm run test:e2e` | Playwright flow (needs a test Supabase project, see `e2e/`) |

## Deploy (Vercel or Railway)

The project uses **pnpm** (`pnpm-lock.yaml`). Hosts that run pnpm 9 work as long as there is no `pnpm-workspace.yaml` without a `packages:` list (newer pnpm versions can create one; delete it).

Set the env vars above on the host, set `HUB_URL` to the deployed origin, build with `npm run build`, start with `npm start`.
Sign in once with `INITIAL_OWNER_EMAIL` to create the first owner.

## Documentation

- [docs/ADDING_A_PRODUCT.md](docs/ADDING_A_PRODUCT.md) - add a second product without touching the shell
- [docs/SECURITY.md](docs/SECURITY.md) - threat model and what each role can do
- [docs/DISCONOTIFY_ASSUMPTIONS.md](docs/DISCONOTIFY_ASSUMPTIONS.md) - column names assumed for the `disconotify` schema; check these first
