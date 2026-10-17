import 'server-only';
import { auditFilters, queryAudit } from '@/lib/audit-query';
import { PAGE_SIZE } from '@/lib/validation';
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

// ---------------------------------------------------------------- platform health / maintenance
export async function getPlatformHealth() {
  const db = pn();
  const [health, state] = await Promise.all([
    db.from(T.health).select('*').limit(50),
    db.from(T.botState).select('key,value').eq('key', 'maintenance_mode').maybeSingle(),
  ]);
  return { platforms: must(health, 'platform health') as Row[], maintenance: parseFlag((state.data as Row | null)?.value) };
}

export async function productHealthSummary(): Promise<'ok' | 'warn' | 'down'> {
  const { platforms, maintenance } = await getPlatformHealth();
  if (maintenance) return 'warn';
  const bad = platforms.filter((p) => !['ok', 'healthy', 'operational', 'up'].includes(String(p.status ?? 'ok').toLowerCase()));
  return bad.length === 0 ? 'ok' : bad.length >= platforms.length ? 'down' : 'warn';
}

// ---------------------------------------------------------------- audit (hub slice + bot log, merged by time)
export async function getMergedAudit(sp: Record<string, string | undefined>) {
  const f = auditFilters.parse(sp);
  const need = f.page * PAGE_SIZE;
  const hub = await queryAudit({ ...f, page: 1 }, { product: SLUG, paged: false, limit: need });
  let botQ = pn().from(T.botAudit).select('*').order('created_at', { ascending: false }).limit(need);
  if (f.action) botQ = botQ.ilike('action', `${f.action.replace(/[%_,()*\\]/g, '')}%`);
  if (f.target) botQ = botQ.eq('guild_id', f.target);
  const bot = await botQ;
  const botRows = ((bot.data ?? []) as Row[]).map((r, i) => ({
    id: Number(r.id ?? i), at: String(r.created_at ?? r.at ?? ''), admin_email: null, product_slug: SLUG,
    action: pick(r, 'action', 'event', 'type') ?? 'bot.event', target_type: 'server', target_id: pick(r, 'guild_id'),
    before: null, after: r.details ?? r.metadata ?? null, reason: pick(r, 'reason', 'message'), ip: null, source: 'bot' as const,
  }));
  const merged = [...hub.rows.map((r) => ({ ...r, source: 'hub' as const })), ...botRows]
    .filter((r) => (!f.admin || (r.admin_email ?? '').includes(f.admin)) && (!f.from || r.at >= f.from) && (!f.to || r.at <= `${f.to}T23:59:59Z`))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  return { rows: merged.slice((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE), total: hub.total + (bot.data?.length ?? 0), f };
}

// ---------------------------------------------------------------- settings
const SETTING_KEYS = ['price_usd', 'price', 'trial_days', 'grace_days', 'reminder_schedule', 'reminder_days'];
export async function getBotSettings() {
  const { data } = await pn().from(T.botState).select('key,value').in('key', SETTING_KEYS);
  return (data ?? []) as Row[];
}
