import 'server-only';
import { accountStatsByGuild } from './servers';
import { pn, T, iso, type Row } from '../db';

export interface FreePlanUsage {
  freeServers: number;
  /** Free servers by their busiest platform: 1, 2 or 3+ accounts (0 = none yet). */
  buckets: { none: number; one: number; two: number; threePlus: number };
  top: { guild_id: string; paused: number; total: number; wasPaid: boolean }[];
  creators: { platform: string; accounts: number; creators: number }[];
}

/** Free-plan report: where the free plan is stretched, who is worth a sales email, and what polling costs. */
export async function getFreePlanUsage(): Promise<FreePlanUsage> {
  const db = pn();
  const [plans, stats, accounts] = await Promise.all([
    db.from(T.plans).select('guild_id,paid_until').eq('plan', 'free').eq('bot_present', true).limit(50000),
    accountStatsByGuild(),
    db.from(T.accounts).select('platform,username').limit(100000),
  ]);
  const free = (plans.data ?? []) as Row[];
  const buckets = { none: 0, one: 0, two: 0, threePlus: 0 };
  const top: FreePlanUsage['top'] = [];
  for (const r of free) {
    const id = String(r.guild_id);
    const s = stats.get(id);
    const m = s?.maxPerPlatform ?? 0;
    if (m === 0) buckets.none++; else if (m === 1) buckets.one++; else if (m === 2) buckets.two++; else buckets.threePlus++;
    if (s && s.paused > 0) top.push({ guild_id: id, paused: s.paused, total: s.total, wasPaid: !!r.paid_until });
  }
  top.sort((a, b) => b.paused - a.paused || Number(b.wasPaid) - Number(a.wasPaid));

  // A creator followed by many servers is polled once per server today, so accounts / creators is the waste factor.
  const byPlatform = new Map<string, { accounts: number; names: Set<string> }>();
  for (const a of (accounts.data ?? []) as Row[]) {
    const k = String(a.platform ?? '').toLowerCase();
    const e = byPlatform.get(k) ?? { accounts: 0, names: new Set<string>() };
    e.accounts++;
    if (a.username) e.names.add(String(a.username).toLowerCase());
    byPlatform.set(k, e);
  }
  const creators = [...byPlatform].map(([platform, e]) => ({ platform, accounts: e.accounts, creators: e.names.size })).sort((a, b) => b.accounts - a.accounts);
  return { freeServers: free.length, buckets, top: top.slice(0, 20), creators };
}

/**
 * Before the cut-over: servers with more than one account on a platform that are in an active trial or paid today.
 * These are the people the free-plan change will affect.
 */
export async function getGrandfathering(): Promise<Record<string, unknown>[]> {
  const now = iso(new Date());
  const [billing, stats] = await Promise.all([
    pn().from(T.billing).select('guild_id,trial_ends_at,paid_until,whitelisted').or(`trial_ends_at.gt.${now},paid_until.gt.${now}`).limit(50000),
    accountStatsByGuild(),
  ]);
  return ((billing.data ?? []) as Row[])
    .filter((b) => (stats.get(String(b.guild_id))?.maxPerPlatform ?? 0) > 1)
    .map((b) => {
      const s = stats.get(String(b.guild_id))!;
      const paid = !!b.paid_until && new Date(String(b.paid_until)).getTime() > Date.now();
      return { guild_id: String(b.guild_id), today: b.whitelisted ? 'whitelisted' : paid ? 'paid' : 'trial', accounts: s.total, busiest_platform_accounts: s.maxPerPlatform, paid_until: b.paid_until ?? '', trial_ends_at: b.trial_ends_at ?? '' };
    })
    .sort((a, b) => b.busiest_platform_accounts - a.busiest_platform_accounts);
}
