import 'server-only';
import { z } from 'zod';
import { PAGE_SIZE, likeTerm, snowflake } from '@/lib/validation';
import { pn, T, must, num, pick, type Row } from '../db';

export const customerParams = z.object({
  page: z.coerce.number().int().min(1).max(100000).catch(1),
  q: z.string().trim().max(100).optional().catch(undefined),
  optout: z.enum(['1', '0']).optional().catch(undefined),
});
export type CustomerParams = z.infer<typeof customerParams>;

const CONTACT_COLS = 'discord_user_id,email,discord_username,email_verified,consented_at,reminders_opt_out,opted_out_at';

/** True when PostgREST says the table is absent (e.g. the bot's contacts migration is not applied yet). */
const isMissingTable = (e: { code?: string } | null) => e?.code === 'PGRST205' || e?.code === '42P01';

export async function listCustomers(p: CustomerParams): Promise<{ rows: (Row & { discord_user_id: string; lifetime: number; servers: number })[]; total: number; missingTable?: boolean }> {
  const db = pn();
  let q = db.from(T.contacts).select(CONTACT_COLS, { count: 'exact' });
  if (p.q) {
    if (snowflake.safeParse(p.q).success) q = q.eq('discord_user_id', p.q);
    else q = q.or(`discord_username.ilike.%${likeTerm(p.q)}%,email.ilike.%${likeTerm(p.q)}%`);
  }
  if (p.optout) q = q.eq('reminders_opt_out', p.optout === '1');
  const res = await q.order('consented_at', { ascending: false, nullsFirst: false }).range((p.page - 1) * PAGE_SIZE, p.page * PAGE_SIZE - 1);
  if (isMissingTable(res.error)) return { rows: [], total: 0, missingTable: true };
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

export async function getCustomer(id: string) {
  const db = pn();
  const [contact, payments] = await Promise.all([
    db.from(T.contacts).select('*').eq('discord_user_id', id).maybeSingle(),
    db.from(T.payments).select('*').eq('requested_by', id).order('created_at', { ascending: false }).limit(100),
  ]);
  if (!contact.data && !(payments.data ?? []).length) return null;
  const paid = ((payments.data ?? []) as Row[]).filter((p) => p.status === 'paid');
  const paidGuilds = [...new Set(paid.map((p) => pick(p, 'guild_id')).filter(Boolean) as string[])];
  return {
    contact: (contact.data ?? null) as Row | null,
    payments: (payments.data ?? []) as Row[],
    owned: [] as Row[],
    paidServers: paidGuilds.map((g) => ({ guild_id: g, name: null as string | null })),
    lifetime: paid.reduce((a, p) => a + num(p.amount_usd), 0),
  };
}

export async function searchCustomers(q: string) {
  const db = pn();
  const filter = snowflake.safeParse(q).success ? `discord_user_id.eq.${q}` : `discord_username.ilike.%${likeTerm(q)}%,email.ilike.%${likeTerm(q)}%`;
  const res = await db.from(T.contacts).select('discord_user_id,discord_username').or(filter).limit(5);
  return res.error ? [] : ((res.data ?? []) as Row[]);
}
