import 'server-only';
import { z } from 'zod';
import { PAGE_SIZE, snowflake } from '@/lib/validation';
import { pn, T, daysFrom, iso, must, pick, type Row } from '../db';

export const SERVER_STATES = ['trial', 'active', 'lapsed', 'whitelisted', 'card_past_due', 'bot_removed'] as const;
export const SORTS = ['guild_id', 'paid_until', 'trial_ends_at'] as const;

export const serverParams = z.object({
  page: z.coerce.number().int().min(1).max(100000).catch(1),
  q: z.string().trim().max(100).optional().catch(undefined),
  state: z.enum(SERVER_STATES).optional().catch(undefined),
  sort: z.enum(SORTS).catch('guild_id'),
  dir: z.enum(['asc', 'desc']).catch('desc'),
});
export type ServerParams = z.infer<typeof serverParams>;

export interface ServerRow { guild_id: string; name: string | null; bot_present: boolean | null; billing: Row }

/** Server-side filtered + paginated list. State filters mirror subscriptionState() in ../state.ts. */
export async function listServers(p: ServerParams): Promise<{ rows: ServerRow[]; total: number }> {
  const db = pn();
  const now = iso(new Date());
  let ids: string[] | null = null; // restrict to guild ids found via the guilds table

  if (p.q) {
    if (snowflake.safeParse(p.q).success) ids = [p.q];
    else {
      return { rows: [], total: 0 }; // guilds have no name column: search is by server ID
    }
  }
  if (p.state === 'bot_removed') {
    const g = must(await db.from(T.guilds).select('guild_id').eq('bot_present', false).limit(2000), 'removed guilds') as Row[];
    const removed = g.map((r) => String(r.guild_id));
    ids = ids ? ids.filter((i) => removed.includes(i)) : removed;
  }
  if (ids && ids.length === 0) return { rows: [], total: 0 };

  let q = db.from(T.billing).select('*', { count: 'exact' });
  if (ids) q = q.in('guild_id', ids);
  switch (p.state) {
    case 'trial': q = q.eq('whitelisted', false).or(`paid_until.is.null,paid_until.lte.${now}`).gt('trial_ends_at', now); break;
    case 'active': q = q.eq('whitelisted', false).gt('paid_until', now); break;
    case 'lapsed': q = q.eq('whitelisted', false).or(`paid_until.is.null,paid_until.lte.${now}`).or(`trial_ends_at.is.null,trial_ends_at.lte.${now}`); break;
    case 'whitelisted': q = q.eq('whitelisted', true); break;
    case 'card_past_due': q = q.eq('card_status', 'past_due'); break;
  }
  const res = await q.order(p.sort, { ascending: p.dir === 'asc', nullsFirst: false }).range((p.page - 1) * PAGE_SIZE, p.page * PAGE_SIZE - 1);
  const billing = must(res, 'servers') as Row[];
  const gids = billing.map((b) => String(b.guild_id));
  const guilds = gids.length ? (must(await db.from(T.guilds).select('guild_id,bot_present').in('guild_id', gids), 'guild names') as Row[]) : [];
  const byId = new Map(guilds.map((g) => [String(g.guild_id), g]));
  return {
    total: res.count ?? billing.length,
    rows: billing.map((b) => {
      const g = byId.get(String(b.guild_id));
      return { guild_id: String(b.guild_id), name: pick(g, 'name'), bot_present: (g?.bot_present as boolean | null) ?? null, billing: b };
    }),
  };
}

export async function getServer(id: string) {
  const db = pn();
  const [guild, billing, payments, accounts, channels, events, audit, memberEmails, dmLog] = await Promise.all([
    db.from(T.guilds).select('*').eq('guild_id', id).maybeSingle(),
    db.from(T.billing).select('*').eq('guild_id', id).maybeSingle(),
    db.from(T.payments).select('*').eq('guild_id', id).order('created_at', { ascending: false }).limit(50),
    db.from(T.accounts).select('*').eq('guild_id', id).limit(200),
    db.from(T.channels).select('*').eq('guild_id', id).limit(100),
    db.from(T.events).select('*').eq('guild_id', id).order('detected_at', { ascending: false }).limit(20),
    db.from(T.botAudit).select('*').eq('guild_id', id).order('created_at', { ascending: false }).limit(20),
    db.from(T.contactEmails).select('email,discord_user_id,created_at,updated_at').eq('guild_id', id).order('created_at', { ascending: false }).limit(500),
    db.from(T.dmLog).select('id,discord_user_id,kind,status,error,created_at').eq('guild_id', id).order('created_at', { ascending: false }).limit(100),
  ]);
  if (!guild.data && !billing.data) return null;
  const g = (guild.data ?? {}) as Row;
  const { settings: _settings, ...safeGuild } = g; // settings blob can hold channel config; not rendered raw
  // The guilds table stores no owner; the most recent payer is the best known contact for the server.
  const payerRow = ((payments.data ?? []) as Row[]).find((p) => p.requested_by);
  const ownerId = pick(g, 'owner_id', 'owner_discord_id', 'owner_user_id') ?? pick(payerRow, 'requested_by');
  return {
    guild: safeGuild as Row, billing: (billing.data ?? null) as Row | null, ownerId,
    payments: (payments.data ?? []) as Row[], accounts: (accounts.data ?? []) as Row[], channels: (channels.data ?? []) as Row[],
    events: (events.data ?? []) as Row[], audit: (audit.data ?? []) as Row[], memberEmails: (memberEmails.data ?? []) as Row[],
    // null = the bot's dm_log table is not available yet (migration not applied)
    dmLog: dmLog.error ? null : ((dmLog.data ?? []) as Row[]),
  };
}

export async function searchServers(q: string) {
  const db = pn();
  const rows = snowflake.safeParse(q).success
    ? must(await db.from(T.guilds).select('guild_id').eq('guild_id', q).limit(5), 'search')
    : [];
  return rows as Row[];
}

export const soon = (days: number) => iso(daysFrom(days));
