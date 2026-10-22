import 'server-only';
import { z } from 'zod';
import { PAGE_SIZE, csvEnum, snowflake, splitCsv } from '@/lib/validation';
import { pn, T, daysFrom, iso, must, pick, type Row } from '../db';

export const SERVER_STATES = ['trial', 'active', 'lapsed', 'whitelisted', 'card_past_due', 'bot_removed', 'new'] as const;
export const SORTS = ['guild_id', 'paid_until', 'trial_ends_at'] as const;

export const serverParams = z.object({
  page: z.coerce.number().int().min(1).max(100000).catch(1),
  q: z.string().trim().max(100).optional().catch(undefined),
  state: csvEnum(SERVER_STATES), // one or more states, comma-separated (matches any)
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
  const states = splitCsv(p.state);
  const removedOnly = states.length === 1 && states[0] === 'bot_removed';
  let removed: string[] = [];
  if (states.includes('bot_removed')) {
    const g = must(await db.from(T.guilds).select('guild_id').eq('bot_present', false).limit(2000), 'removed guilds') as Row[];
    removed = g.map((r) => String(r.guild_id));
    if (removedOnly) ids = ids ? ids.filter((i) => removed.includes(i)) : removed;
  }
  if (ids && ids.length === 0) return { rows: [], total: 0 };

  // Servers the bot knows but that have no billing row yet (e.g. added today) are listed after the billed ones.
  const [allGuilds, billed] = await Promise.all([
    db.from(T.guilds).select('guild_id').limit(20000),
    db.from(T.billing).select('guild_id').limit(20000),
  ]);
  const billedIds = new Set(((billed.data ?? []) as Row[]).map((r) => String(r.guild_id)));
  const missingAll = ((allGuilds.data ?? []) as Row[]).map((r) => String(r.guild_id)).filter((g) => !billedIds.has(g) && (!ids || ids.includes(g)));
  const missing = states.length === 0 ? missingAll
    : missingAll.filter((g) => states.includes('new') || (states.includes('bot_removed') && removed.includes(g)));
  // With only "new" selected there is nothing to read from the billing table.
  const billingStates = states.filter((s) => s !== 'new');
  const skipBilling = states.length > 0 && billingStates.length === 0;

  const from = (p.page - 1) * PAGE_SIZE;
  const buildBilling = (head: boolean) => {
    let q = head ? db.from(T.billing).select('guild_id', { count: 'exact', head: true }) : db.from(T.billing).select('*');
    if (ids) q = q.in('guild_id', ids);
    return filterByState(q);
  };

  // Several states match any of them: each state is one clause of a single OR.
  const unpaid = `or(paid_until.is.null,paid_until.lte.${now})`;
  const clause: Record<string, string> = {
    trial: `and(whitelisted.eq.false,${unpaid},trial_ends_at.gt.${now})`,
    active: `and(whitelisted.eq.false,paid_until.gt.${now})`,
    lapsed: `and(whitelisted.eq.false,${unpaid},or(trial_ends_at.is.null,trial_ends_at.lte.${now}))`,
    whitelisted: 'whitelisted.eq.true',
    card_past_due: 'card_status.eq.past_due',
  };
  // Supabase's builder types are too deep to thread through a generic helper.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function filterByState(q: any): any {
    if (removedOnly || billingStates.length === 0) return q;
    const parts = billingStates.filter((s) => clause[s]).map((s) => clause[s]!);
    if (removed.length) parts.push(`guild_id.in.(${removed.join(',')})`);
    return parts.length ? q.or(parts.join(',')) : q;
  }

  let billingTotal = 0;
  let billing: Row[] = [];
  if (!skipBilling) {
    const head = await buildBilling(true);
    billingTotal = head.error ? 0 : (head.count ?? 0);
    if (from < billingTotal) {
      const res = await buildBilling(false).order(p.sort, { ascending: p.dir === 'asc', nullsFirst: false }).range(from, from + PAGE_SIZE - 1);
      billing = must(res, 'servers') as Row[];
    }
  }
  const missingSlice = missing.slice(Math.max(0, from - billingTotal), Math.max(0, from + PAGE_SIZE - billingTotal));
  const gids = [...billing.map((b) => String(b.guild_id)), ...missingSlice];
  const guilds = gids.length ? (must(await db.from(T.guilds).select('guild_id,bot_present').in('guild_id', gids), 'guild names') as Row[]) : [];
  const byId = new Map(guilds.map((g) => [String(g.guild_id), g]));
  const row = (id: string, b: Row): ServerRow => {
    const g = byId.get(id);
    return { guild_id: id, name: pick(g, 'name'), bot_present: (g?.bot_present as boolean | null) ?? null, billing: b };
  };
  return {
    total: billingTotal + missing.length,
    rows: [...billing.map((b) => row(String(b.guild_id), b)), ...missingSlice.map((id) => row(id, { guild_id: id, no_billing: true }))],
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
