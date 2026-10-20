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

- **Servers have no name.** They are shown and searched by Discord server ID, and the "type to confirm" text is the ID.
- **No owner column.** The server page shows the most recent payer (`requested_by`) as "Owner / last payer".
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
