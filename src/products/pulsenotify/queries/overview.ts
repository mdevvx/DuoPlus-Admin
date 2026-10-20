import 'server-only';
import { parseFlag } from '../state';
import { pn, T, count, daysFrom, iso, num, must, liveOnly, type Row } from '../db';

export interface Overview {
  cardActive: number; cryptoActive: number; whitelisted: number; trial: number;
  activeTotal: number; mrr: number; newThisWeek: number; churnThisMonth: number; trialsEnding: number; botPresent: number;
  revenue30: { day: string; value: number }[]; servers30: { day: string; value: number }[];
  health: Row[]; maintenance: boolean; lastPayments: Row[];
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
  const b = () => liveOnly(db.from(T.billing).select('guild_id', { count: 'exact', head: true }));
  const g = () => liveOnly(db.from(T.guilds).select('guild_id', { count: 'exact', head: true }));

  const [cardActive, cryptoActive, whitelisted, trial, newThisWeek, churn, trialsEnding, botPresent] = await Promise.all([
    count(b().eq('whitelisted', false).gt('paid_until', now).not('card_subscription_id', 'is', null)),
    count(b().eq('whitelisted', false).gt('paid_until', now).is('card_subscription_id', null)),
    count(b().eq('whitelisted', true)),
    count(b().eq('whitelisted', false).or(`paid_until.is.null,paid_until.lte.${now}`).gt('trial_ends_at', now)),
    count(g().eq('bot_present', true).gte('created_at', iso(daysFrom(-7)))),
    count(b().eq('whitelisted', false).gte('paid_until', monthStart).lte('paid_until', now)),
    count(b().eq('whitelisted', false).or(`paid_until.is.null,paid_until.lte.${now}`).gt('trial_ends_at', now).lte('trial_ends_at', iso(daysFrom(3)))),
    count(g().eq('bot_present', true)),
  ]);

  // MRR (estimate): paid ledger rows whose paid period still covers today, normalised to a month.
  const paid = must(await liveOnly(db.from(T.payments).select('amount_usd,months,paid_at,created_at')).eq('status', 'paid').gte('paid_at', iso(daysFrom(-370))).limit(5000), 'mrr payments') as Row[];
  let mrr = 0;
  for (const p of paid) {
    const months = Math.max(1, num(p.months));
    const end = new Date(String(p.paid_at)).getTime() + months * 30.44 * 86400000;
    if (end > Date.now()) mrr += num(p.amount_usd) / months;
  }

  const since30 = iso(daysFrom(-30));
  const prevFrom = iso(daysFrom(-60));
  const [rev, srv, health, state, last, revPrev, srvPrev, removed] = await Promise.all([
    liveOnly(db.from(T.payments).select('amount_usd,paid_at')).eq('status', 'paid').gte('paid_at', since30).limit(5000),
    liveOnly(db.from(T.guilds).select('created_at')).gte('created_at', since30).limit(5000),
    db.from(T.health).select('*').limit(20),
    db.from(T.botState).select('key,value').eq('key', 'maintenance_mode').maybeSingle(),
    liveOnly(db.from(T.payments).select('*')).order('created_at', { ascending: false }).limit(10),
    liveOnly(db.from(T.payments).select('amount_usd')).eq('status', 'paid').gte('paid_at', prevFrom).lt('paid_at', since30).limit(5000),
    count(g().gte('created_at', prevFrom).lt('created_at', since30)),
    count(g().eq('bot_present', false)),
  ]);

  return {
    cardActive, cryptoActive, whitelisted, trial, activeTotal: cardActive + cryptoActive + whitelisted, mrr,
    newThisWeek, churnThisMonth: churn, trialsEnding, botPresent,
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
