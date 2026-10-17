# Security

## Roles

| Role | Can do |
|---|---|
| `owner` | Everything, in every product. Invite, edit and deactivate admins. Cannot demote or deactivate themselves; the last active owner cannot be removed. |
| `admin` | Everything inside the products they are assigned: view, trial/paid-day changes, whitelist, bot-removed, reminders, contacts, maintenance, CSV export, audit. Cannot manage admins. |

Anyone else cannot sign in at all. There are no read-only or support accounts.

Dangerous actions (whitelist, add/remove paid days, delete contact, maintenance, admin management) additionally need an
authenticator check younger than 10 minutes, a reason of at least 5 characters, and a typed confirmation.

## Threat model

| Threat | Control |
|---|---|
| Stranger signs in / probes the allowlist | Email + password through Supabase Auth, then the allowlist (`hub_admins.active`) is checked; wrong password, unknown email and non-allowlisted email all return the same message; public sign-up disabled in Supabase. |
| Stolen or guessed password | TOTP (Supabase MFA) required for every session (`aal2`); recovery codes are HMAC-stored and single use. |
| Brute force | Failures per email-hash and per IP counted in `hub_login_attempts`; lock for 15 minutes after 5 failures (fail closed). Applies to code, MFA and recovery attempts. |
| Session theft / forgotten tab | HttpOnly, Secure, SameSite=Lax cookies; 8-hour absolute and 30-minute idle limits enforced in middleware with signed cookies; "sign out everywhere". |
| Broken access control | Middleware plus `requireAdmin()` in every page, route and action; product access derived from assignments; deny by default. |
| CSRF | Same-origin check on every non-GET request in middleware, Next.js Server Action origin check, SameSite=Lax. |
| XSS / clickjacking | Per-request nonce CSP, no `dangerouslySetInnerHTML` (lint rule), `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, HSTS, minimal Permissions-Policy. Inline styles are allowed; inline scripts are not. |
| Secret leakage | Service-role key only in server code (`server-only`); `npm run check:bundle` greps the client bundle; logs never include payloads; audit stores masked emails only. |
| Tampering / repudiation | Every mutation runs in a SQL function that changes data and writes `hub_audit_log` in one transaction. The log is append-only (no UPDATE/DELETE grants, trigger blocks them even for the service role). Views of pages that show full emails and CSV exports are logged too. |
| Direct database access from browsers | RLS enabled on every `duolplus_admin` table with no policies; anon/authenticated have no grants; the browser never queries Supabase. |
| Lost IDs | Discord snowflakes are quoted before JSON parsing so they never lose precision. |
| CSV injection | Cells starting with `= + - @` are neutralised. |

## Known limits

- The in-database audit trail can be bypassed by someone with direct superuser access to Postgres; restrict who has the database password.
- Payment-provider write actions (refunds, cancellations) are deliberately not implemented.
- The panel's dependency audit currently reports PostCSS inside Next 15 (build-time CSS processing, not reachable at runtime); it clears with a move to Next 16.
