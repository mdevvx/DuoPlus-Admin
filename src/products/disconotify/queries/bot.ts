import 'server-only';
import { z } from 'zod';
import { PAGE_SIZE, snowflake } from '@/lib/validation';
import { pn, T, count, daysFrom, iso, must, pick, type Row } from '../db';

export const botParams = z.object({
  page: z.coerce.number().int().min(1).max(100000).catch(1),
  q: z.string().trim().max(100).optional().catch(undefined),
  bot: z.enum(['present', 'removed', 'all']).catch('present'),
});
export type BotParams = z.infer<typeof botParams>;

const tally = (rows: Row[], key: string) => {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = pick(r, key) ?? 'unknown';
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m].sort((a, b) => b[1] - a[1]);
};

export async function getBotDashboard() {
  const db = pn();
  const [present, removed, guildRows, accountRows, channelRows, alertRows, liveRows, eventRows, health] = await Promise.all([
    count(db.from(T.guilds).select('guild_id', { count: 'exact', head: true }).eq('bot_present', true)),
    count(db.from(T.guilds).select('guild_id', { count: 'exact', head: true }).eq('bot_present', false)),
    db.from(T.guilds).select('guild_id').eq('bot_present', true).limit(50000),
    db.from(T.accounts).select('guild_id,platform').limit(50000),
    db.from(T.channels).select('guild_id').limit(50000),
    db.from(T.alerts).select('guild_id').limit(50000),
    db.from(T.live).select('*').eq('is_live', true).limit(50000),
    db.from(T.events).select('guild_id').gte('detected_at', iso(daysFrom(-1))).limit(50000),
    db.from(T.health).select('*').limit(20),
  ]);
  // Only count what belongs to servers where the bot is currently installed.
  const installed = new Set(((guildRows.data ?? []) as Row[]).map((g) => String(g.guild_id)));
  const mine = (rows: { data: unknown }) => ((rows.data ?? []) as Row[]).filter((r) => installed.has(String(r.guild_id)));
  const accounts = mine(accountRows);
  // Live states may not carry a server ID; keep them all in that case rather than hide them.
  const liveAll = (liveRows.data ?? []) as Row[];
  const live = liveAll.length > 0 && !('guild_id' in (liveAll[0] ?? {})) ? liveAll : liveAll.filter((r) => installed.has(String(r.guild_id)));
  return {
    present, removed, accounts: accounts.length, channels: mine(channelRows).length, alerts: mine(alertRows).length,
    live: live.length, events24h: mine(eventRows).length,
    byPlatform: tally(accounts, 'platform'),
    health: (health.data ?? []) as Row[],
  };
}

export interface BotServerRow { guild_id: string; name: string | null; bot_present: boolean | null; created_at: string | null; platforms: [string, number][]; channels: number; alerts: number }

/** Servers with their integration counts (accounts per platform, channels, alert configs). */
export async function listBotServers(p: BotParams): Promise<{ rows: BotServerRow[]; total: number }> {
  const db = pn();
  let q = db.from(T.guilds).select('guild_id,bot_present,created_at', { count: 'exact' });
  if (p.bot === 'present') q = q.eq('bot_present', true);
  if (p.bot === 'removed') q = q.eq('bot_present', false);
  // guilds have no name column: search by ID only
  if (p.q) q = snowflake.safeParse(p.q).success ? q.eq('guild_id', p.q) : q.eq('guild_id', '0');
  const res = await q.order('created_at', { ascending: false, nullsFirst: false }).range((p.page - 1) * PAGE_SIZE, p.page * PAGE_SIZE - 1);
  const guilds = must(res, 'bot servers') as Row[];
  const ids = guilds.map((g) => String(g.guild_id));
  if (ids.length === 0) return { rows: [], total: res.count ?? 0 };

  const [acc, ch, al] = await Promise.all([
    db.from(T.accounts).select('guild_id,platform').in('guild_id', ids).limit(20000),
    db.from(T.channels).select('guild_id').in('guild_id', ids).limit(20000),
    db.from(T.alerts).select('guild_id').in('guild_id', ids).limit(20000),
  ]);
  const group = (rows: Row[] | null) => {
    const m = new Map<string, Row[]>();
    for (const r of rows ?? []) m.set(String(r.guild_id), [...(m.get(String(r.guild_id)) ?? []), r]);
    return m;
  };
  const accBy = group(acc.data as Row[] | null), chBy = group(ch.data as Row[] | null), alBy = group(al.data as Row[] | null);
  return {
    total: res.count ?? guilds.length,
    rows: guilds.map((g) => {
      const id = String(g.guild_id);
      // Alerts only apply while the bot is in the server.
      if (g.bot_present === false) return { guild_id: id, name: pick(g, 'name'), bot_present: false, created_at: pick(g, 'created_at'), platforms: tally(accBy.get(id) ?? [], 'platform'), channels: chBy.get(id)?.length ?? 0, alerts: 0 };
      return {
        guild_id: id, name: pick(g, 'name'), bot_present: (g.bot_present as boolean | null) ?? null, created_at: pick(g, 'created_at'),
        platforms: tally(accBy.get(id) ?? [], 'platform'), channels: chBy.get(id)?.length ?? 0, alerts: alBy.get(id)?.length ?? 0,
      };
    }),
  };
}
