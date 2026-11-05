# DiscoNotify schema notes

Checked against the live `disconotify` schema column list (October 2026). Table names live in
`src/products/disconotify/db.ts`; write-side column names live in `supabase/migrations/20261017000000_hub_schema.sql`.

## What the real schema looks like

| Table | Columns the panel relies on |
|---|---|
| `notify_guilds` | `guild_id, enabled, bot_present, created_at, updated_at` (no name, no owner) |
| `notify_billing` | `guild_id, trial_ends_at, paid_until, whitelisted, whitelist_note, whitelisted_by (bigint), whitelisted_at, card_*, reminders_sent, last_reminder_at` (no `last_email_at`) |
| `notify_payments` | `id, guild_id, provider, external_id, months, amount_usd, status, requested_by, channel_id, created_at, paid_at` |
| `notify_platform_accounts` | `guild_id, platform, username, display_name, enabled, status, last_error, ...` |
| `notify_notification_channels` | `guild_id, channel_id, name, is_valid` (`webhook_url` is never shown) |
| `notify_alert_configurations`, `_account_channels`, `_live_states` | `guild_id`, `is_live` for live streams |
| `notify_events` | `guild_id, platform, event_type, detected_at, notified` |
| `notify_audit_logs` | `guild_id, actor_id, action, target, metadata, created_at` |
| `notify_bot_settings` | per-server settings (not a global key/value store) |

## Consequences

- **Servers have names now** (bot migration 0015: `notify_guilds.name, icon_url, owner_id, member_count`). The panel reads them from the `notify_guild_plans` view first and falls back to Discord, then to the ID, until the bot has restarted once.
- **Owner** comes from `owner_id`; before the bot fills it, the server page shows the most recent payer (`requested_by`).
- **`notify_user_contacts` does not exist yet.** Apply the bot's migration that creates it
  (`discord_user_id, email, discord_username, email_verified, consented_at, reminders_opt_out, opted_out_at`).
  Until then the Customers page says so, and contact actions fail with a generic error.
- **Whitelisting** cannot store the admin email in `whitelisted_by` (it is a bigint); the admin email is appended to
  `whitelist_note` and the full before/after is in the audit log.
- **Maintenance flag.** The migration creates `disconotify.notify_bot_state(key, value)` and the toggle writes key
  `maintenance_mode`. **The bot must read it** for the toggle to have any effect.
- **`last_email_at`** is not in the billing table, so "Last email" shows a dash.
- Bounces are not stored, so the reminders page lists opt-outs only.

"Send a reminder now" **resets** `reminders_sent` and `last_reminder_at` so the bot's own schedule fires the next
reminder; it does not send anything itself. It is limited to once per hour per server.

MRR is an estimate: paid ledger rows whose paid period still covers today, divided by their months.
Churn this month counts non-whitelisted servers whose `paid_until` passed this month.
Possible duplicate card subscriptions is a heuristic: two distinct Polar charges for one server within 35 days.


## Free plan and dashboard (November 2026)

The trial is gone: every server is **Free**, **Paid**, **Grace** or **Whitelisted**. Run the bot's migration 0015, then
`supabase/migrations/20261106000000_free_plan_ops.sql` (replaces "extend trial" with grant/remove paid time and adds the
account support action).

| Thing | How the panel uses it |
|---|---|
| `notify_guild_plans` view | The only source of a server's plan (`free / paid / grace / whitelisted`), names, icons, card status. The panel never re-derives it from dates, except as a fallback in `planFromBilling` (3 grace days, keep equal to `BILLING_GRACE_DAYS`). |
| `notify_dashboard_jobs` | Read-only "Dashboard jobs" page. Only `status` and `result.code` are shown, never `payload`. |
| `notify_audit_logs` | "Dashboard changes" tab on the Audit page (actor = a customer's Discord ID). |
| `notify_platform_accounts.paused_by_plan` | **Assumed boolean column** marking accounts the free plan keeps switched off. If the bot names it differently, change `pausedByPlan()` in `state.ts` and `accountStatsByGuild()` in `queries/servers.ts`. |
| `notify_platform_accounts.id`, `last_checked_at`, `last_error` | Used by the accounts table and the pause / resume / remove support actions (`dn_account_change`). |
| `notify_platform_health.quota_limit / quota_remaining` | YouTube "API budget" tile (limit defaults to 10,000). |

Not read or written any more: `trial_ends_at`, `activation_required`, `trial_activated_at`, `activated_by`, `invited_by`.
The only DM left is `welcome`.

**Granted paid time** is `billing.grant_days` in the audit log plus `notify_billing.paid_until`. No `notify_payments` row is
written, so revenue and MRR stay real. **Remove paid time** sets `paid_until` to now (`billing.remove_paid`).

**Over the free limit** = a Free server with more than one account on any platform (counted from `notify_platform_accounts`).
**Free to paid conversion (30 days)** = servers whose first real payment is in the last 30 days and that existed and were not
paid 30 days ago, divided by all servers that existed and were not paid 30 days ago.
