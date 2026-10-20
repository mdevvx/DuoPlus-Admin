import 'server-only';
import { z } from 'zod';
import { PAGE_SIZE, likeTerm, snowflake } from '@/lib/validation';
import { pn, T, must, num, pick, type Row } from '../db';
import { excludeTest, testPaymentIds } from '../polar';

export const customerParams = z.object({
  page: z.coerce.number().int().min(1).max(100000).catch(1),
  q: z.string().trim().max(100).optional().catch(undefined),
  optout: z.enum(['1', '0']).optional().catch(undefined),
});
export type CustomerParams = z.infer<typeof customerParams>;

const CONTACT_COLS = 'discord_user_id,email,discord_username,email_verified,consented_at,reminders_opt_out,opted_out_at';

/** True when PostgREST says the table is absent (e.g. the bot's contacts migration is not applied yet). */
const isMissingTable = (e: { code?: string } | null) => e?.code === 'PGRST205' || e?.code === '42P01';

export async function listCustomers(p: CustomerParams): Promise<{ rows: (Row & { discord_user_id: string; lifetime: number; servers: number })[]; total: number; derived?: boolean }> {
  const db = pn();
  let q = db.from(T.contacts).select(CONTACT_COLS, { count: 'exact' });
  if (p.q) {
    if (snowflake.safeParse(p.q).success) q = q.eq('discord_user_id', p.q);
    else q = q.or(`discord_username.ilike.%${likeTerm(p.q)}%,email.ilike.%${likeTerm(p.q)}%`);
  }
  if (p.optout) q = q.eq('reminders_opt_out', p.optout === '1');
  const res = await q.order('consented_at', { ascending: false, nullsFirst: false }).range((p.page - 1) * PAGE_SIZE, p.page * PAGE_SIZE - 1);
  if (isMissingTable(res.error)) return listDerived(p);
  const contacts = must(res, 'customers') as Row[];
  const ids = contacts.map((c) => String(c.discord_user_id));
  const pay = ids.length ? (must(await db.from(T.payments).select('requested_by,guild_id,amount_usd,status').in('requested_by', ids).eq('status', 'paid').limit(5000), 'customer payments') as Row[]) : [];
  const stats = new Map<string, { lifetime: number; guilds: Set<string> }>();
  for (const r of pay) {
    const k = String(r.requested_by);
    const s = stats.get(k) ?? { lifetime: 0, guilds: new Set<string>() };
    s.lifetime += num(r.amount_usd);
    if (r.guild_id) s.guilds.add(String(r.guild_id));
    stats.set(k, s);
  }
  return {
    total: res.count ?? contacts.length,
    rows: contacts.map((c): Row & { discord_user_id: string; lifetime: number; servers: number } => ({ ...c, discord_user_id: String(c.discord_user_id), lifetime: stats.get(String(c.discord_user_id))?.lifetime ?? 0, servers: stats.get(String(c.discord_user_id))?.guilds.size ?? 0 })),
  };
}

/**
 * Customers without a contacts table: everyone the bot has dealt with, taken from payments (who paid),
 * emails members shared, and DMs the bot sent. No consent or opt-out info exists in this mode.
 */
async function listDerived(p: CustomerParams) {
  const db = pn();
  const test = await testPaymentIds();
  const [pay, mails, dms] = await Promise.all([
    excludeTest(db.from(T.payments).select('id,requested_by,guild_id,amount_usd,status,created_at'), test).not('requested_by', 'is', null).limit(5000),
    db.from(T.contactEmails).select('discord_user_id,guild_id,email,created_at').limit(5000),
    db.from(T.dmLog).select('discord_user_id,guild_id,kind,status,created_at').order('created_at', { ascending: false }).limit(5000),
  ]);
  type U = { discord_user_id: string; email: string | null; lifetime: number; guilds: Set<string>; lastDmAt: string | null; lastDmStatus: string | null; lastSeen: string };
  const users = new Map<string, U>();
  const valid = (id: unknown) => /^\d{5,25}$/.test(String(id)); // drops placeholders such as 0
  const get = (id: unknown) => {
    const k = String(id);
    const u = users.get(k) ?? { discord_user_id: k, email: null, lifetime: 0, guilds: new Set<string>(), lastDmAt: null, lastDmStatus: null, lastSeen: '' };
    users.set(k, u);
    return u;
  };
  const seen = (u: U, at: unknown) => { const s = String(at ?? ''); if (s > u.lastSeen) u.lastSeen = s; };
  for (const r of (pay.data ?? []) as Row[]) {
    if (!valid(r.requested_by)) continue;
    const u = get(r.requested_by);
    if (r.status === 'paid') { u.lifetime += num(r.amount_usd); if (r.guild_id) u.guilds.add(String(r.guild_id)); }
    seen(u, r.created_at);
  }
  for (const r of (mails.data ?? []) as Row[]) {
    if (!valid(r.discord_user_id)) continue;
    const u = get(r.discord_user_id);
    u.email ??= (r.email as string | null) ?? null;
    if (r.guild_id) u.guilds.add(String(r.guild_id));
    seen(u, r.created_at);
  }
  for (const r of (dms.data ?? []) as Row[]) {
    if (!valid(r.discord_user_id)) continue;
    const u = get(r.discord_user_id);
    if (!u.lastDmAt) { u.lastDmAt = String(r.created_at); u.lastDmStatus = String(r.status ?? ''); }
    seen(u, r.created_at);
  }
  const term = p.q?.toLowerCase();
  const all = [...users.values()]
    .filter((u) => !term || u.discord_user_id === term || (u.email ?? '').toLowerCase().includes(term))
    .sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));
  const page = all.slice((p.page - 1) * PAGE_SIZE, p.page * PAGE_SIZE);
  return {
    derived: true,
    total: all.length,
    rows: page.map((u) => ({ discord_user_id: u.discord_user_id, email: u.email, lifetime: u.lifetime, servers: u.guilds.size, last_dm_at: u.lastDmAt, last_dm_status: u.lastDmStatus })) as (Row & { discord_user_id: string; lifetime: number; servers: number })[],
  };
}

export async function getCustomer(id: string) {
  const db = pn();
  const [contact, mails, payments] = await Promise.all([
    db.from(T.contacts).select('*').eq('discord_user_id', id).maybeSingle(),
    db.from(T.contactEmails).select('guild_id,email').eq('discord_user_id', id).limit(50),
    db.from(T.payments).select('*').eq('requested_by', id).order('created_at', { ascending: false }).limit(100),
  ]);
  const shared = (mails.data ?? []) as Row[];
  if (!contact.data && !(payments.data ?? []).length && !shared.length) return null;
  const paid = ((payments.data ?? []) as Row[]).filter((p) => p.status === 'paid');
  const paidGuilds = [...new Set(paid.map((p) => pick(p, 'guild_id')).filter(Boolean) as string[])];
  return {
    contact: (contact.data ?? null) as Row | null,
    sharedEmail: (shared[0]?.email as string | undefined) ?? null,
    sharedServers: new Set(shared.map((s) => String(s.guild_id))).size,
    payments: (payments.data ?? []) as Row[],
    owned: [] as Row[],
    paidServers: paidGuilds.map((g) => ({ guild_id: g, name: null as string | null })),
    lifetime: paid.reduce((a, p) => a + num(p.amount_usd), 0),
  };
}

/** Members who shared an email with the bot. Matches an email fragment or an exact Discord user ID. */
export async function searchMembers(q: string) {
  const isId = snowflake.safeParse(q).success;
  if (!isId && q.length < 3) return [];
  const base = pn().from(T.contactEmails).select('guild_id,discord_user_id,email');
  const res = await (isId ? base.eq('discord_user_id', q) : base.ilike('email', `%${likeTerm(q)}%`)).limit(5);
  return res.error ? [] : ((res.data ?? []) as Row[]);
}

export async function searchCustomers(q: string) {
  const db = pn();
  const filter = snowflake.safeParse(q).success ? `discord_user_id.eq.${q}` : `discord_username.ilike.%${likeTerm(q)}%,email.ilike.%${likeTerm(q)}%`;
  const res = await db.from(T.contacts).select('discord_user_id,discord_username').or(filter).limit(5);
  return res.error ? [] : ((res.data ?? []) as Row[]);
}
