import 'server-only';
import { parseFlag } from '../state';
import { accountStatsByGuild } from './servers';
import { pn, T, count, daysFrom, iso, num, must, type Row } from '../db';
import { excludeTest, sandboxOnlyGuilds, testPaymentIds } from '../polar';

export interface Overview {
  botPresent: number; free: number; paidCard: number; paidCrypto: number; grace: number; whitelisted: number; paidTotal: number;
  mrr: number; newPaidThisWeek: number; churnThisMonth: number; conversion30: number | null; converted30: number; freeAtStart: number;
  overLimit: number; aboutToLapse: number; youtube: { used: number; limit: number } | null;
  revenue30: { day: string; value: number }[]; servers30: { day: string; value: number }[];
  health: Row[]; maintenance: boolean; lastPayments: Row[]; newThisWeek: number;
  revenue30Total: number; revenuePrev30: number; servers30Total: number; serversPrev30: number; removed: number;
}

function byDay(rows: Row[], field: string, valueOf: (r: Row) => number): { day: string; value: number }[] {
  const map = new Map<string, number>();
  for (let i = 29; i >= 0; i--) map.set(daysFrom(-i).toISOString().slice(0, 10), 0);
  for (const r of rows) {
    const d = String(r[field] ?? '').slice(0, 10);
    if (map.has(d)) map.set(d, (map.get(d) ?? 0) + valueOf(r));
  }
  return [...map].map(([day, value]) => ({ day, value }));
}

export async function getOverview(): Promise<Overview> {
  const db = pn();
  const now = iso(new Date());
  const monthStart = iso(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)));
  // Plans come from the bot's own view, scoped to servers that still have the bot.
  const pv = () => db.from(T.plans).select('guild_id', { count: 'exact', head: true }).eq('bot_present', true);
  const g = () => db.from(T.guilds).select('guild_id', { count: 'exact', head: true });
  const test = await testPaymentIds(); // sandbox payments never count as revenue

  const [free, paidCard, paidCrypto, grace, whitelisted, churn, botPresent, cancelling, cryptoEnding] = await Promise.all([
    count(pv().eq('plan', 'free')),
    count(pv().eq('plan', 'paid').eq('has_card_subscription', true)),
    count(pv().eq('plan', 'paid').eq('has_card_subscription', false)),
    count(pv().eq('plan', 'grace')),
    count(pv().eq('plan', 'whitelisted')),
    count(pv().in('plan', ['free', 'grace']).gte('paid_until', monthStart).lte('paid_until', now)),
    count(g().eq('bot_present', true)),
    count(pv().eq('plan', 'paid').not('card_cancels_at', 'is', null)),
    count(pv().eq('plan', 'paid').eq('has_card_subscription', false).lte('paid_until', iso(daysFrom(7)))),
  ]);

  // Servers that are Paid only through sandbox payments are tests, not customers: take them out of the paid counts.
  const sandboxOnly = await sandboxOnlyGuilds().catch(() => new Set<string>());
  let sandboxCard = 0;
  if (sandboxOnly.size) {
    const ids = [...sandboxOnly].slice(0, 500);
    sandboxCard = await count(pv().eq('plan', 'paid').eq('has_card_subscription', true).in('guild_id', ids));
  }

  // Servers whose first real payment falls in a window = "new paid"; they are the conversions.
  const everPaid = must(await excludeTest(db.from(T.payments).select('guild_id,paid_at,months,id'), test).eq('status', 'paid').not('paid_at', 'is', null).order('paid_at').limit(20000), 'paid payments') as Row[];
  const firstPaid = new Map<string, number>();
  for (const p of everPaid) { const k = String(p.guild_id); if (!firstPaid.has(k)) firstPaid.set(k, new Date(String(p.paid_at)).getTime()); }
  const t7 = Date.now() - 7 * 86400000, t30 = Date.now() - 30 * 86400000;
  const newPaidThisWeek = [...firstPaid.values()].filter((t) => t >= t7).length;
  const [oldGuilds, freePlans, stats] = await Promise.all([
    db.from(T.guilds).select('guild_id').lt('created_at', iso(new Date(t30))).limit(50000),
    db.from(T.plans).select('guild_id').eq('plan', 'free').eq('bot_present', true).limit(50000),
    accountStatsByGuild(),
  ]);
  // Paid when the window opened = a payment before it whose period still covered that day.
  const paidAtStart = new Set<string>();
  for (const p of everPaid) {
    const at = new Date(String(p.paid_at)).getTime();
    if (at < t30 && at + Math.max(1, num(p.months)) * 30.44 * 86400000 > t30) paidAtStart.add(String(p.guild_id));
  }
  const freeStart = ((oldGuilds.data ?? []) as Row[]).map((r) => String(r.guild_id)).filter((id) => !paidAtStart.has(id));
  const converted30 = freeStart.filter((id) => (firstPaid.get(id) ?? 0) >= t30).length;
  const overLimit = ((freePlans.data ?? []) as Row[]).filter((r) => (stats.get(String(r.guild_id))?.maxPerPlatform ?? 0) > 1).length;

  // MRR (estimate): paid ledger rows whose paid period still covers today, normalised to a month.
  const paid = must(await excludeTest(db.from(T.payments).select('amount_usd,months,paid_at,created_at,id'), test).eq('status', 'paid').gte('paid_at', iso(daysFrom(-370))).limit(5000), 'mrr payments') as Row[];
  let mrr = 0;
  for (const p of paid) {
    const months = Math.max(1, num(p.months));
    const end = new Date(String(p.paid_at)).getTime() + months * 30.44 * 86400000;
    if (end > Date.now()) mrr += num(p.amount_usd) / months;
  }

  const since30 = iso(daysFrom(-30));
  const prevFrom = iso(daysFrom(-60));
  const [rev, srv, health, state, last, revPrev, srvPrev, removed, newWeek] = await Promise.all([
    excludeTest(db.from(T.payments).select('amount_usd,paid_at,id'), test).eq('status', 'paid').gte('paid_at', since30).limit(5000),
    db.from(T.guilds).select('created_at').gte('created_at', since30).limit(5000),
    db.from(T.health).select('*').limit(20),
    db.from(T.botState).select('key,value').eq('key', 'maintenance_mode').maybeSingle(),
    excludeTest(db.from(T.payments).select('*'), test).order('created_at', { ascending: false }).limit(10),
    excludeTest(db.from(T.payments).select('amount_usd,id'), test).eq('status', 'paid').gte('paid_at', prevFrom).lt('paid_at', since30).limit(5000),
    count(g().gte('created_at', prevFrom).lt('created_at', since30)),
    count(g().eq('bot_present', false)),
    count(g().eq('bot_present', true).gte('created_at', iso(daysFrom(-7)))),
  ]);
  const yt = ((health.data ?? []) as Row[]).find((h) => String(h.platform ?? h.name ?? '').toLowerCase() === 'youtube');
  const ytLimit = num(yt?.quota_limit) || 10000;

  return {
    botPresent, free: free + sandboxCard, paidCard: paidCard - sandboxCard, paidCrypto, grace, whitelisted, paidTotal: paidCard - sandboxCard + paidCrypto, mrr,
    newPaidThisWeek, churnThisMonth: churn, converted30, freeAtStart: freeStart.length,
    conversion30: freeStart.length ? converted30 / freeStart.length : null,
    overLimit, aboutToLapse: cancelling + cryptoEnding, newThisWeek: newWeek,
    youtube: yt && yt.quota_remaining !== null && yt.quota_remaining !== undefined ? { used: Math.max(0, ytLimit - num(yt.quota_remaining)), limit: ytLimit } : null,
    revenue30: byDay((rev.data ?? []) as Row[], 'paid_at', (r) => num(r.amount_usd)),
    servers30: byDay((srv.data ?? []) as Row[], 'created_at', () => 1),
    health: (health.data ?? []) as Row[],
    maintenance: parseFlag((state.data as Row | null)?.value),
    lastPayments: (last.data ?? []) as Row[],
    revenue30Total: ((rev.data ?? []) as Row[]).reduce((a, r) => a + num(r.amount_usd), 0),
    revenuePrev30: ((revPrev.data ?? []) as Row[]).reduce((a, r) => a + num(r.amount_usd), 0),
    servers30Total: (srv.data ?? []).length, serversPrev30: srvPrev, removed,
  };
}
