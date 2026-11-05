import 'server-only';
import { auditFilters, orTerm, queryAudit } from '@/lib/audit-query';
import { PAGE_SIZE, splitCsv } from '@/lib/validation';
import { polarSandbox } from '@/lib/polar-env';
import { parseFlag } from '../state';
import { botSettingsSchema, type BotSettings } from '../bot-settings';
import { hubDb } from '@/lib/supabase-server';
import { accountStatsByGuild } from './servers';
import { pn, T, daysFrom, iso, must, type Row } from '../db';
import { SLUG } from '../db';

// ---------------------------------------------------------------- subscriptions health
export interface WorkList { key: string; title: string; hint: string; rows: Row[] }

export async function getSubscriptionHealth(): Promise<WorkList[]> {
  const db = pn();
  const now = iso(new Date());
  const [pastDue, cancelling, pending, failed, polarPaid, cardRows, freePlans, cardButFree, grants, stats] = await Promise.all([
    db.from(T.billing).select('guild_id,card_status,paid_until').eq('card_status', 'past_due').limit(50),
    db.from(T.billing).select('guild_id,card_status,card_cancels_at,paid_until').not('card_cancels_at', 'is', null).gt('paid_until', now).limit(50),
    db.from(T.payments).select('*').eq('status', 'pending').eq('provider', 'nowpayments').lt('created_at', iso(new Date(Date.now() - 3600_000))).order('created_at').limit(50),
    db.from(T.payments).select('*').eq('status', 'failed').gte('created_at', iso(daysFrom(-30))).order('created_at', { ascending: false }).limit(50),
    db.from(T.payments).select('guild_id,external_id,created_at').eq('provider', 'polar').eq('status', 'paid').limit(20000),
    db.from(T.billing).select('guild_id,card_subscription_id,card_status').not('card_subscription_id', 'is', null).limit(5000),
    db.from(T.plans).select('guild_id,paid_until').eq('plan', 'free').eq('bot_present', true).limit(50000),
    db.from(T.plans).select('guild_id,card_status,paid_until').eq('plan', 'free').eq('has_card_subscription', true).limit(50),
    hubDb().from('hub_audit_log').select('target_id,at,admin_email,after').eq('action', 'billing.grant_days').order('at', { ascending: false }).limit(200),
    accountStatsByGuild(),
  ]);

  // Heuristic: two distinct Polar charges for one server within 35 days suggests two live subscriptions.
  const recent = ((polarPaid.data ?? []) as Row[]).filter((r) => new Date(String(r.created_at)).getTime() > Date.now() - 35 * 86400000);
  const perGuild = new Map<string, Set<string>>();
  for (const r of recent) {
    const k = String(r.guild_id);
    perGuild.set(k, (perGuild.get(k) ?? new Set()).add(String(r.external_id)));
  }
  const dupes = [...perGuild].filter(([, s]) => s.size > 1).slice(0, 50).map(([guild_id, s]) => ({ guild_id, charges: s.size }));

  // Sandbox leftovers: card fields set but no paid Polar payment ever recorded for that server.
  const hasLive = new Set(((polarPaid.data ?? []) as Row[]).map((r) => String(r.guild_id)));
  const sandbox = ((cardRows.data ?? []) as Row[]).filter((r) => !hasLive.has(String(r.guild_id))).slice(0, 50);

  // Free servers with more than one account on a platform: their extras are paused. Lapsed customers first (best upsell leads).
  const overLimit = ((freePlans.data ?? []) as Row[])
    .map((r) => ({ guild_id: String(r.guild_id), accounts_on_busiest_platform: stats.get(String(r.guild_id))?.maxPerPlatform ?? 0, paused: stats.get(String(r.guild_id))?.paused ?? 0, was_paid_until: r.paid_until }))
    .filter((r) => r.accounts_on_busiest_platform > 1)
    .sort((a, b) => Number(!!b.was_paid_until) - Number(!!a.was_paid_until) || b.accounts_on_busiest_platform - a.accounts_on_busiest_platform)
    .slice(0, 50);
  // One row per server: its latest admin grant.
  const seenGrant = new Set<string>();
  const granted = ((grants.data ?? []) as Row[]).filter((g) => { const k = String(g.target_id); if (seenGrant.has(k)) return false; seenGrant.add(k); return true; }).slice(0, 50)
    .map((g) => ({ guild_id: String(g.target_id), granted_at: g.at, days: (g.after as Record<string, unknown> | null)?.days ?? null, granted_by: g.admin_email }));

  return [
    { key: 'over_limit', title: 'Free servers over the limit', hint: 'Upsell leads: servers that were paid before come first. Their extra accounts are paused.', rows: overLimit },
    { key: 'card_but_free', title: 'Card subscription but still on Free', hint: 'Payment confirmed but not applied. This is a bot problem.', rows: (cardButFree.data ?? []) as Row[] },
    { key: 'granted', title: 'Paid time granted by an admin', hint: 'Not revenue. Review these now and then.', rows: granted },
    { key: 'past_due', title: 'Card past due', hint: 'Polar could not charge the card.', rows: (pastDue.data ?? []) as Row[] },
    { key: 'cancelling', title: 'Cancelled, still active', hint: 'Will end on the date shown.', rows: (cancelling.data ?? []) as Row[] },
    { key: 'pending', title: 'Crypto pending over 1 hour', hint: 'Possibly underpaid or abandoned.', rows: (pending.data ?? []) as Row[] },
    { key: 'failed', title: 'Failed payments (30 days)', hint: 'For example underpaid crypto.', rows: (failed.data ?? []) as Row[] },
    { key: 'dupes', title: 'Possible duplicate card subscriptions', hint: 'Two distinct Polar charges within 35 days.', rows: dupes },
    polarSandbox()
      ? { key: 'sandbox', title: 'Card fields without a payment', hint: 'Card fields set but no paid Polar payment on record.', rows: sandbox }
      : { key: 'sandbox', title: 'Sandbox leftovers', hint: 'Card fields set but no live Polar payment on record.', rows: sandbox },
  ];
}

export async function attentionCounts() {
  const w = await getSubscriptionHealth();
  return Object.fromEntries(w.map((l) => [l.key, l.rows.length])) as Record<string, number>;
}

// ---------------------------------------------------------------- reminders
export async function getReminders() {
  const db = pn();
  const now = iso(new Date());
  const [upcoming, recent] = await Promise.all([
    // Paid time ending within a week, plus servers already in the grace period.
    db.from(T.plans).select('guild_id,plan,paid_until,card_status').in('plan', ['paid', 'grace']).lte('paid_until', iso(daysFrom(7))).order('paid_until').limit(50),
    db.from(T.billing).select('*').not('last_reminder_at', 'is', null)
      .order('last_reminder_at', { ascending: false, nullsFirst: false }).limit(50),
  ]);
  void now;
  return { upcoming: (upcoming.data ?? []) as Row[], recent: (recent.data ?? []) as Row[] };
}

/**
 * Checkouts that were started but never paid: pending or expired in the last 30 days, minus any server that
 * has paid since. Each row is joined to the email that member shared in that server (if any).
 */
export async function getAbandonedCheckouts(): Promise<(Row & { email: string | null })[]> {
  const db = pn();
  const since = iso(daysFrom(-30));
  const [open, paid] = await Promise.all([
    db.from(T.payments).select('id,guild_id,provider,months,amount_usd,status,requested_by,created_at')
      .in('status', ['pending', 'expired']).gte('created_at', since).not('requested_by', 'is', null)
      .order('created_at', { ascending: false }).limit(300),
    db.from(T.payments).select('guild_id,created_at').eq('status', 'paid').gte('created_at', since).limit(5000),
  ]);
  const lastPaid = new Map<string, string>();
  for (const p of (paid.data ?? []) as Row[]) {
    const g = String(p.guild_id), at = String(p.created_at);
    if (!lastPaid.has(g) || at > lastPaid.get(g)!) lastPaid.set(g, at);
  }
  const rows = ((open.data ?? []) as Row[]).filter((p) => {
    const paidAt = lastPaid.get(String(p.guild_id));
    return !paidAt || paidAt < String(p.created_at);
  });
  // One row per person per server: their most recent unfinished checkout.
  const seen = new Set<string>();
  const unique = rows.filter((p) => { const k = `${p.guild_id}:${p.requested_by}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 100);
  const guildIds = [...new Set(unique.map((p) => String(p.guild_id)))];
  const emails = guildIds.length
    ? ((await db.from(T.contactEmails).select('guild_id,discord_user_id,email').in('guild_id', guildIds).limit(5000)).data ?? []) as Row[]
    : [];
  const emailOf = new Map(emails.map((e) => [`${e.guild_id}:${e.discord_user_id}`, String(e.email)]));
  return unique.map((p) => ({ ...p, email: emailOf.get(`${p.guild_id}:${p.requested_by}`) ?? null }));
}

/** Failed or undeliverable member DMs in the last 30 days. Unavailable until the bot's dm_log table exists. */
export async function getFailedDms(): Promise<{ rows: Row[]; available: boolean }> {
  const res = await pn().from(T.dmLog).select('id,guild_id,discord_user_id,kind,status,error,created_at')
    .in('status', ['failed', 'dm_closed']).gte('created_at', iso(daysFrom(-30))).order('created_at', { ascending: false }).limit(100);
  return res.error ? { rows: [], available: false } : { rows: (res.data ?? []) as Row[], available: true };
}

// ---------------------------------------------------------------- platform health / maintenance
export async function getPlatformHealth() {
  const db = pn();
  const [health, state] = await Promise.all([
    db.from(T.health).select('*').limit(50),
    db.from(T.botState).select('key,value').eq('key', 'maintenance_mode').maybeSingle(),
  ]);
  return { platforms: must(health, 'platform health') as Row[], maintenance: parseFlag((state.data as Row | null)?.value) };
}

/**
 * TikTok has no quota, so the risk signal is how many enabled accounts are failing. A mass `error` means TikTok is
 * blocking the host; `invalid` accounts (3 failed checks, usually renamed or deleted) need to be re-added.
 * Counted from account status, not a per-check log, so it is a proxy for the share of failed checks.
 */
export interface TikTokBlock { total: number; error: number; invalid: number; errorShare: number }
export async function getTikTokBlockRate(): Promise<TikTokBlock | null> {
  const res = await pn().from(T.accounts).select('status').eq('platform', 'tiktok').eq('enabled', true).limit(20000);
  if (res.error) return null;
  const rows = (res.data ?? []) as Row[];
  const count = (s: string) => rows.filter((r) => String(r.status ?? '').toLowerCase() === s).length;
  const error = count('error');
  return { total: rows.length, error, invalid: count('invalid'), errorShare: rows.length ? error / rows.length : 0 };
}

export async function productHealthSummary(): Promise<'ok' | 'warn' | 'down'> {
  const { platforms, maintenance } = await getPlatformHealth();
  if (maintenance) return 'warn';
  const active = platforms.filter((p) => String(p.status ?? '').toLowerCase() !== 'disabled');
  const paused = (p: Row) => !!p.rate_limited_until && new Date(String(p.rate_limited_until)).getTime() > Date.now();
  const bad = active.filter((p) => !['ok', 'healthy', 'operational', 'up'].includes(String(p.status ?? 'ok').toLowerCase()) || paused(p));
  return bad.length === 0 ? 'ok' : bad.length >= active.length ? 'down' : 'warn';
}

// ---------------------------------------------------------------- audit: the hub's admin log, and the customers' dashboard log
export async function getAdminAudit(sp: Record<string, string | undefined>) {
  const f = auditFilters.parse(sp);
  const hub = await queryAudit(f, { product: SLUG });
  return { rows: hub.rows, total: hub.total, f };
}

/** Changes customers made on the dashboard (notify_audit_logs). The actor is a customer's Discord ID, not an admin. */
export async function getDashboardAudit(sp: Record<string, string | undefined>) {
  const f = auditFilters.parse(sp);
  let q = pn().from(T.botAudit).select('*', { count: 'exact' }).order('created_at', { ascending: false });
  const actions = splitCsv(f.action).map(orTerm).filter(Boolean);
  const guilds = splitCsv(f.target).filter((t) => /^\d{5,25}$/.test(t));
  const actors = splitCsv(f.admin).filter((t) => /^\d{5,25}$/.test(t)); // "admin" box carries the customer's Discord ID here
  if (actions.length) q = q.or(actions.map((t) => `action.ilike."${t}%"`).join(','));
  if (guilds.length) q = q.in('guild_id', guilds);
  if (actors.length) q = q.in('actor_id', actors);
  if (f.from) q = q.gte('created_at', `${f.from}T00:00:00Z`);
  if (f.to) q = q.lte('created_at', `${f.to}T23:59:59Z`);
  const res = await q.range((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE - 1);
  return { rows: must(res, 'dashboard audit') as Row[], total: res.count ?? 0, f };
}

// ---------------------------------------------------------------- settings
const SETTING_KEYS = ['price_usd', 'price', 'grace_days', 'reminder_schedule', 'reminder_days', 'twitch_poll_interval_seconds'];
export async function getBotSettings() {
  const { data } = await pn().from(T.botState).select('key,value').in('key', SETTING_KEYS);
  return (data ?? []) as Row[];
}

/** Settings saved from the panel (price, grace days). A missing field means the bot uses its own default. */
export async function getSavedBotSettings(): Promise<BotSettings> {
  const { data } = await pn().from(T.botState).select('value').eq('key', 'bot_settings').maybeSingle();
  let v: unknown = (data as Row | null)?.value;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
  // The trial is gone: drop a leftover trial_days from older saves instead of failing the whole object.
  if (v && typeof v === 'object') { const { trial_days: _legacy, ...rest } = v as Record<string, unknown>; v = rest; }
  const parsed = botSettingsSchema.safeParse(v ?? {});
  return parsed.success ? parsed.data : {};
}
