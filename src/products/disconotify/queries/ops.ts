import 'server-only';
import { auditFilters, orTerm, queryAudit } from '@/lib/audit-query';
import { PAGE_SIZE, splitCsv } from '@/lib/validation';
import { parseFlag } from '../state';
import { pn, T, daysFrom, iso, must, pick, type Row } from '../db';
import { SLUG } from '../db';

// ---------------------------------------------------------------- subscriptions health
export interface WorkList { key: string; title: string; hint: string; rows: Row[] }

export async function getSubscriptionHealth(): Promise<WorkList[]> {
  const db = pn();
  const now = iso(new Date());
  const [pastDue, cancelling, pending, failed, polarPaid, cardRows] = await Promise.all([
    db.from(T.billing).select('guild_id,card_status,paid_until').eq('card_status', 'past_due').limit(50),
    db.from(T.billing).select('guild_id,card_status,card_cancels_at,paid_until').not('card_cancels_at', 'is', null).gt('paid_until', now).limit(50),
    db.from(T.payments).select('*').eq('status', 'pending').eq('provider', 'nowpayments').lt('created_at', iso(new Date(Date.now() - 3600_000))).order('created_at').limit(50),
    db.from(T.payments).select('*').eq('status', 'failed').gte('created_at', iso(daysFrom(-30))).order('created_at', { ascending: false }).limit(50),
    db.from(T.payments).select('guild_id,external_id,created_at').eq('provider', 'polar').eq('status', 'paid').limit(20000),
    db.from(T.billing).select('guild_id,card_subscription_id,card_status').not('card_subscription_id', 'is', null).limit(5000),
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

  return [
    { key: 'past_due', title: 'Card past due', hint: 'Polar could not charge the card.', rows: (pastDue.data ?? []) as Row[] },
    { key: 'cancelling', title: 'Cancelled, still active', hint: 'Will end on the date shown.', rows: (cancelling.data ?? []) as Row[] },
    { key: 'pending', title: 'Crypto pending over 1 hour', hint: 'Possibly underpaid or abandoned.', rows: (pending.data ?? []) as Row[] },
    { key: 'failed', title: 'Failed payments (30 days)', hint: 'For example underpaid crypto.', rows: (failed.data ?? []) as Row[] },
    { key: 'dupes', title: 'Possible duplicate card subscriptions', hint: 'Two distinct Polar charges within 35 days.', rows: dupes },
    { key: 'sandbox', title: 'Sandbox leftovers', hint: 'Card fields set but no live Polar payment on record.', rows: sandbox },
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
    db.from(T.billing).select('*').eq('whitelisted', false)
      .or(`and(paid_until.gt.${now},paid_until.lte.${iso(daysFrom(7))}),and(paid_until.is.null,trial_ends_at.gt.${now},trial_ends_at.lte.${iso(daysFrom(7))})`).limit(50),
    db.from(T.billing).select('*').not('last_reminder_at', 'is', null)
      .order('last_reminder_at', { ascending: false, nullsFirst: false }).limit(50),
  ]);
  const ids = [...new Set([...(upcoming.data ?? []), ...(recent.data ?? [])].map((r: Row) => String(r.guild_id)))];
  void ids; // guilds have no name column
  const nameOf: Record<string, string | null> = {};
  return { upcoming: (upcoming.data ?? []) as Row[], recent: (recent.data ?? []) as Row[], nameOf };
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

// ---------------------------------------------------------------- audit (hub slice + bot log, merged by time)
export async function getMergedAudit(sp: Record<string, string | undefined>) {
  const f = auditFilters.parse(sp);
  const need = f.page * PAGE_SIZE;
  const hub = await queryAudit({ ...f, page: 1 }, { product: SLUG, paged: false, limit: need });
  let botQ = pn().from(T.botAudit).select('*').order('created_at', { ascending: false }).limit(need);
  const actions = splitCsv(f.action).map(orTerm).filter(Boolean);
  const targets = splitCsv(f.target);
  const admins = splitCsv(f.admin).map((a) => a.toLowerCase());
  if (actions.length) botQ = botQ.or(actions.map((t) => `action.ilike."${t}%"`).join(','));
  if (targets.length) botQ = botQ.in('guild_id', targets);
  const bot = await botQ;
  const botRows = ((bot.data ?? []) as Row[]).map((r, i) => ({
    id: Number(r.id ?? i), at: String(r.created_at ?? r.at ?? ''), admin_email: null, product_slug: SLUG,
    action: pick(r, 'action', 'event', 'type') ?? 'bot.event', target_type: 'server', target_id: pick(r, 'guild_id'),
    before: null, after: r.details ?? r.metadata ?? null, reason: pick(r, 'reason', 'message'), ip: null, source: 'bot' as const,
  }));
  const merged = [...hub.rows.map((r) => ({ ...r, source: 'hub' as const })), ...botRows]
    .filter((r) => (admins.length === 0 || admins.some((a) => (r.admin_email ?? '').toLowerCase().includes(a))) && (!f.from || r.at >= f.from) && (!f.to || r.at <= `${f.to}T23:59:59Z`))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  return { rows: merged.slice((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE), total: hub.total + (bot.data?.length ?? 0), f };
}

// ---------------------------------------------------------------- settings
const SETTING_KEYS = ['price_usd', 'price', 'trial_days', 'grace_days', 'reminder_schedule', 'reminder_days'];
export async function getBotSettings() {
  const { data } = await pn().from(T.botState).select('key,value').in('key', SETTING_KEYS);
  return (data ?? []) as Row[];
}
