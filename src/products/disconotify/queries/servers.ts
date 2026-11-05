import 'server-only';
import { z } from 'zod';
import { PAGE_SIZE, csvEnum, likeTerm, snowflake, splitCsv } from '@/lib/validation';
import { hubDb } from '@/lib/supabase-server';
import { pn, T, daysFrom, iso, must, pick, type Row } from '../db';

export const PLAN_FILTERS = ['free', 'paid', 'grace', 'whitelisted'] as const;
export const SERVER_FLAGS = ['was_paid', 'over_limit', 'card_past_due', 'card_cancelling', 'bot_removed', 'bot_off'] as const;
export const SORTS = ['name', 'guild_id', 'paid_until'] as const;

export const serverParams = z.object({
  page: z.coerce.number().int().min(1).max(100000).catch(1),
  q: z.string().trim().max(100).optional().catch(undefined),
  plan: csvEnum(PLAN_FILTERS), // one or more plans, comma-separated (matches any)
  flag: csvEnum(SERVER_FLAGS), // extra conditions, comma-separated (all must hold)
  sort: z.enum(SORTS).catch('name'),
  dir: z.enum(['asc', 'desc']).catch('asc'),
});
export type ServerParams = z.infer<typeof serverParams>;

/** Accounts of one server, counted from notify_platform_accounts. */
export interface AccountStats { total: number; paused: number; perPlatform: Record<string, number>; maxPerPlatform: number }

export async function accountStatsByGuild(): Promise<Map<string, AccountStats>> {
  const res = await pn().from(T.accounts).select('guild_id,platform,paused_by_plan').limit(50000);
  const out = new Map<string, AccountStats>();
  if (res.error) return out;
  for (const r of (res.data ?? []) as Row[]) {
    const id = String(r.guild_id);
    const s = out.get(id) ?? { total: 0, paused: 0, perPlatform: {}, maxPerPlatform: 0 };
    const p = String(r.platform ?? '').toLowerCase();
    s.total++;
    if (r.paused_by_plan === true) s.paused++;
    s.perPlatform[p] = (s.perPlatform[p] ?? 0) + 1;
    s.maxPerPlatform = Math.max(s.maxPerPlatform, s.perPlatform[p]!);
    out.set(id, s);
  }
  return out;
}

export interface ServerRow { guild_id: string; name: string | null; icon_url: string | null; bot_present: boolean | null; enabled: boolean | null; plan: Row; stats: AccountStats }
const NO_ACCOUNTS: AccountStats = { total: 0, paused: 0, perPlatform: {}, maxPerPlatform: 0 };

/** Server-side filtered + paginated list, read from the notify_guild_plans view (the bot's own plan rule). */
export async function listServers(p: ServerParams): Promise<{ rows: ServerRow[]; total: number }> {
  const db = pn();
  const now = iso(new Date());
  const plans = splitCsv(p.plan);
  const flags = new Set(splitCsv(p.flag));
  const stats = await accountStatsByGuild();

  let q = db.from(T.plans).select('*', { count: 'exact' });
  if (p.q) {
    if (snowflake.safeParse(p.q).success) q = q.eq('guild_id', p.q);
    else q = q.ilike('name', `%${likeTerm(p.q)}%`);
  }
  if (plans.length) q = q.in('plan', plans);
  if (flags.has('was_paid')) q = q.eq('plan', 'free').not('paid_until', 'is', null);
  if (flags.has('over_limit')) {
    const over = [...stats].filter(([, s]) => s.maxPerPlatform > 1).map(([id]) => id).slice(0, 500);
    if (over.length === 0) return { rows: [], total: 0 };
    q = q.eq('plan', 'free').in('guild_id', over);
  }
  if (flags.has('card_past_due')) q = q.eq('card_status', 'past_due');
  if (flags.has('card_cancelling')) q = q.not('card_cancels_at', 'is', null).gt('paid_until', now);
  if (flags.has('bot_removed')) q = q.eq('bot_present', false);
  if (flags.has('bot_off')) q = q.eq('bot_present', true).eq('enabled', false);

  const from = (p.page - 1) * PAGE_SIZE;
  const res = await q.order(p.sort, { ascending: p.dir === 'asc', nullsFirst: false }).range(from, from + PAGE_SIZE - 1);
  const rows = must(res, 'servers') as Row[];
  return {
    total: res.count ?? rows.length,
    rows: rows.map((r) => ({
      guild_id: String(r.guild_id), name: pick(r, 'name'), icon_url: pick(r, 'icon_url'),
      bot_present: (r.bot_present as boolean | null) ?? null, enabled: (r.enabled as boolean | null) ?? null,
      plan: r, stats: stats.get(String(r.guild_id)) ?? NO_ACCOUNTS,
    })),
  };
}

export async function getServer(id: string) {
  const db = pn();
  const [guild, billing, payments, accounts, channels, events, audit, memberEmails, dmLog, emailContacts, emailTimeline, plan, configs, jobs, grants] = await Promise.all([
    db.from(T.guilds).select('*').eq('guild_id', id).maybeSingle(),
    db.from(T.billing).select('*').eq('guild_id', id).maybeSingle(),
    db.from(T.payments).select('*').eq('guild_id', id).order('created_at', { ascending: false }).limit(50),
    db.from(T.accounts).select('*').eq('guild_id', id).limit(200),
    db.from(T.channels).select('*').eq('guild_id', id).limit(100),
    db.from(T.events).select('*').eq('guild_id', id).order('detected_at', { ascending: false }).limit(20),
    db.from(T.botAudit).select('*').eq('guild_id', id).order('created_at', { ascending: false }).limit(20),
    db.from(T.contactEmails).select('email,discord_user_id,created_at,updated_at').eq('guild_id', id).order('created_at', { ascending: false }).limit(500),
    db.from(T.dmLog).select('id,discord_user_id,kind,status,error,created_at').eq('guild_id', id).order('created_at', { ascending: false }).limit(100),
    db.from(T.emailContacts).select('*').eq('guild_id', id).order('created_at', { ascending: false }).limit(100),
    db.from(T.emailOutbox).select('*').eq('guild_id', id).order('created_at', { ascending: false }).limit(20),
    db.from(T.plans).select('*').eq('guild_id', id).maybeSingle(),
    db.from(T.alerts).select('*').eq('guild_id', id).limit(500),
    db.from(T.jobs).select('id,kind,status,result,requested_by,created_at,finished_at').eq('guild_id', id).gte('created_at', iso(daysFrom(-1))).order('created_at', { ascending: false }).limit(20),
    hubDb().from('hub_audit_log').select('at,admin_email,after,reason').eq('action', 'billing.grant_days').eq('target_id', id).order('at', { ascending: false }).limit(10),
  ]);
  if (!guild.data && !billing.data) return null;
  const g = (guild.data ?? {}) as Row;
  const { settings: _settings, ...safeGuild } = g; // settings blob can hold channel config; not rendered raw
  // The guilds table stores no owner; the most recent payer is the best known contact for the server.
  const payerRow = ((payments.data ?? []) as Row[]).find((p) => p.requested_by);
  const ownerId = pick(g, 'owner_id', 'owner_discord_id', 'owner_user_id') ?? pick(payerRow, 'requested_by');
  return {
    plan: (plan.data ?? null) as Row | null,
    configs: configs.error ? [] : ((configs.data ?? []) as Row[]),
    jobs: jobs.error ? [] : ((jobs.data ?? []) as Row[]),
    grants: grants.error ? [] : ((grants.data ?? []) as Row[]),
    guild: safeGuild as Row, billing: (billing.data ?? null) as Row | null, ownerId,
    payments: (payments.data ?? []) as Row[], accounts: (accounts.data ?? []) as Row[], channels: (channels.data ?? []) as Row[],
    events: (events.data ?? []) as Row[], audit: (audit.data ?? []) as Row[], memberEmails: (memberEmails.data ?? []) as Row[],
    // null = the bot's dm_log table is not available yet (migration not applied)
    dmLog: dmLog.error ? null : ((dmLog.data ?? []) as Row[]),
    // null = the email tables are not available yet
    emailContacts: emailContacts.error ? null : ((emailContacts.data ?? []) as Row[]),
    emailTimeline: emailTimeline.error ? null : ((emailTimeline.data ?? []) as Row[]),
  };
}

export async function searchServers(q: string) {
  const db = pn();
  const res = snowflake.safeParse(q).success
    ? await db.from(T.plans).select('guild_id,name').eq('guild_id', q).limit(5)
    : await db.from(T.plans).select('guild_id,name').ilike('name', `%${likeTerm(q)}%`).limit(5);
  return (res.data ?? []) as Row[];
}

export const soon = (days: number) => iso(daysFrom(days));
