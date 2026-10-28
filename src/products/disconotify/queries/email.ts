import 'server-only';
import { z } from 'zod';
import { PAGE_SIZE, csvEnum, splitCsv } from '@/lib/validation';
import { pn, T, daysFrom, iso, must, num, pick, str, type Row } from '../db';
import { subscriptionState } from '../state';
import { DEFAULT_LAYOUT, SCHEDULE_DEFAULTS, layoutSchema, scheduleSchema, type EmailLayout, type EmailSchedule } from '../email/vars';

// ---- bot_state JSON (layout, schedule) ----

async function readState(key: string): Promise<unknown> {
  const { data, error } = await pn().from(T.botState).select('value').eq('key', key).maybeSingle();
  if (error || !data) return null;
  const v = (data as Row).value;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
  return v ?? null;
}

/** Missing or partial objects fall back to the bot's defaults, key by key. */
export async function getLayout(): Promise<{ layout: EmailLayout; custom: boolean }> {
  const raw = await readState('email_layout');
  const merged = { ...DEFAULT_LAYOUT, ...(raw && typeof raw === 'object' ? raw : {}) };
  const ok = layoutSchema.safeParse(merged);
  return { layout: ok.success ? ok.data : DEFAULT_LAYOUT, custom: !!raw };
}

export async function getSchedule(): Promise<{ effective: EmailSchedule; source: Record<keyof EmailSchedule, 'setting' | 'default'> }> {
  const raw = (await readState('email_schedule')) as Record<string, unknown> | null;
  const effective = { ...SCHEDULE_DEFAULTS };
  const source = { renewal_days_before: 'default', trial_reminder_every_days: 'default', trial_reminder_max: 'default' } as Record<keyof EmailSchedule, 'setting' | 'default'>;
  for (const k of Object.keys(SCHEDULE_DEFAULTS) as (keyof EmailSchedule)[]) {
    const one = scheduleSchema.shape[k].safeParse(raw?.[k]); // the bot ignores anything that is not a valid integer
    if (one.success) { effective[k] = one.data; source[k] = 'setting'; }
  }
  return { effective, source };
}

// ---- templates ----

export async function listTemplates(): Promise<(Row & { sent30: number })[]> {
  const rows = must(await pn().from(T.emailTemplates).select('*').order('key', { ascending: true }), 'templates') as Row[];
  const since = iso(daysFrom(-30));
  const sent = (await pn().from(T.emailOutbox).select('template_key').eq('status', 'sent').gte('created_at', since).limit(50000)).data as Row[] | null;
  const counts = new Map<string, number>();
  for (const r of sent ?? []) { const k = str(r.template_key); if (k) counts.set(k, (counts.get(k) ?? 0) + 1); }
  return rows.map((r) => ({ ...r, sent30: counts.get(String(r.key)) ?? 0 }));
}

export async function getTemplate(key: string): Promise<Row | null> {
  const { data, error } = await pn().from(T.emailTemplates).select('*').eq('key', key).maybeSingle();
  if (error) throw new Error('template query failed');
  return (data as Row | null) ?? null;
}

/** Older content snapshots, newest first. Returns null when the versions table cannot be read. */
export async function getVersions(key: string): Promise<Row[] | null> {
  const res = await pn().from(T.emailVersions).select('*').eq('template_key', key).order('version', { ascending: false }).limit(50);
  return res.error ? null : ((res.data ?? []) as Row[]);
}

// ---- outbox ----

export const OUTBOX_STATUSES = ['queued', 'sending', 'sent', 'failed', 'skipped'] as const;
export const outboxParams = z.object({
  page: z.coerce.number().int().min(1).max(100000).catch(1),
  status: csvEnum(OUTBOX_STATUSES),
  template: z.string().transform((v) => splitCsv(v).filter((x) => /^[\w-]{1,60}$/.test(x)).join(',') || undefined).optional().catch(undefined),
  kind: csvEnum(['auto', 'manual']),
  guild: z.string().regex(/^\d{5,25}$/).optional().catch(undefined),
  by: z.string().trim().toLowerCase().max(254).optional().catch(undefined),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
});
export type OutboxParams = z.infer<typeof outboxParams>;

export async function listOutbox(p: OutboxParams) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = pn().from(T.emailOutbox).select('*', { count: 'exact' });
  if (p.status) q = q.in('status', splitCsv(p.status));
  if (p.template) {
    const keys = splitCsv(p.template).filter((k) => k !== 'custom');
    const custom = splitCsv(p.template).includes('custom');
    if (keys.length && custom) q = q.or(`template_key.in.(${keys.join(',')}),template_key.is.null`);
    else if (keys.length) q = q.in('template_key', keys);
    else q = q.is('template_key', null);
  }
  if (p.kind) q = q.in('kind', splitCsv(p.kind));
  if (p.guild) q = q.eq('guild_id', p.guild);
  if (p.by) q = q.eq('created_by', p.by);
  if (p.from) q = q.gte('created_at', `${p.from}T00:00:00Z`);
  if (p.to) q = q.lte('created_at', `${p.to}T23:59:59Z`);
  const res = await q.order('created_at', { ascending: false }).range((p.page - 1) * PAGE_SIZE, p.page * PAGE_SIZE - 1);
  const rows = must(res, 'outbox') as Row[];
  return { rows, total: (res.count as number | null) ?? rows.length };
}

/** Queue health for the banners on the Outbox and Settings pages. */
export async function outboxHealth() {
  const db = pn();
  const head = (s: string) => db.from(T.emailOutbox).select('*', { count: 'exact', head: true }).eq('status', s);
  const [stale, lastOk, failed24, total24] = await Promise.all([
    head('queued').lte('send_after', iso(new Date(Date.now() - 15 * 60_000))),
    db.from(T.emailOutbox).select('*').eq('status', 'sent').order('created_at', { ascending: false }).limit(1),
    head('failed').gte('created_at', iso(daysFrom(-1))),
    db.from(T.emailOutbox).select('*', { count: 'exact', head: true }).in('status', ['sent', 'failed']).gte('created_at', iso(daysFrom(-1))),
  ]);
  const last = ((lastOk.data ?? []) as Row[])[0];
  return {
    stale: stale.count ?? 0,
    lastSuccess: last ? (str(last.sent_at) ?? str(last.updated_at) ?? str(last.created_at)) : null,
    failed24: failed24.count ?? 0,
    total24: total24.count ?? 0,
  };
}

// ---- contacts ----

export const contactParams = z.object({
  page: z.coerce.number().int().min(1).max(100000).catch(1),
  guild: z.string().regex(/^\d{5,25}$/).optional().catch(undefined),
  marketing: csvEnum(['subscribed', 'unsubscribed']),
});
export type ContactParams = z.infer<typeof contactParams>;

export interface ContactRow extends Row { id: string; guild_id: string; email: string; source: string; created_at: string | null; marketing_unsubscribed_at: string | null; member: boolean }

/**
 * Every address we can email: contacts added through the email section, plus the addresses members shared with
 * the bot (older table, no row id, managed through the customer record). Merged and de-duplicated by server + address.
 */
export async function allContacts(): Promise<ContactRow[]> {
  const db = pn();
  const [fresh, old] = await Promise.all([
    db.from(T.emailContacts).select('*').limit(20000),
    db.from(T.contactEmails).select('guild_id,email,discord_user_id,created_at').limit(20000),
  ]);
  if (fresh.error && old.error) throw new Error('contacts query failed');
  const rows: ContactRow[] = ((fresh.data ?? []) as Row[]).map((r) => ({
    ...r, id: String(r.id), guild_id: String(r.guild_id), email: String(pick(r, 'email', 'address') ?? ''), source: str(r.source) ?? 'manual',
    created_at: str(r.created_at), marketing_unsubscribed_at: str(r.marketing_unsubscribed_at), member: false,
  }));
  const seen = new Set(rows.map((r) => `${r.guild_id}:${r.email.toLowerCase()}`));
  const legacy = ((old.data ?? []) as Row[]).filter((r) => r.email && !seen.has(`${r.guild_id}:${String(r.email).toLowerCase()}`));
  const optedOut = new Set<string>();
  const users = [...new Set(legacy.map((r) => String(r.discord_user_id)).filter((x) => /^\d+$/.test(x)))];
  for (let i = 0; i < users.length; i += 200) {
    const res = await db.from(T.contacts).select('discord_user_id').eq('reminders_opt_out', true).in('discord_user_id', users.slice(i, i + 200));
    for (const r of (res.data ?? []) as Row[]) optedOut.add(String(r.discord_user_id));
  }
  for (const r of legacy) {
    rows.push({
      ...r, id: `m.${r.guild_id}.${r.discord_user_id}`, guild_id: String(r.guild_id), email: String(r.email), source: 'member',
      created_at: str(r.created_at), marketing_unsubscribed_at: optedOut.has(String(r.discord_user_id)) ? 'opted_out' : null, member: true,
    });
  }
  return rows.sort((x, y) => String(y.created_at ?? '').localeCompare(String(x.created_at ?? '')));
}

export async function listContacts(p: ContactParams) {
  const everyone = await allContacts();
  const m = splitCsv(p.marketing);
  const rows = everyone.filter((r) => (!p.guild || r.guild_id === p.guild)
    && !(m.length === 1 && m[0] === 'unsubscribed' && !r.marketing_unsubscribed_at)
    && !(m.length === 1 && m[0] === 'subscribed' && r.marketing_unsubscribed_at));
  const unsubscribed = everyone.filter((r) => r.marketing_unsubscribed_at).length;
  return {
    rows: rows.slice((p.page - 1) * PAGE_SIZE, p.page * PAGE_SIZE), total: rows.length,
    all: everyone.length, unsubscribed, subscribed: everyone.length - unsubscribed, filtered: !!(p.guild || m.length),
  };
}

export const sentCount = (rows: Row[]) => rows.reduce((a, r) => a + num(r.sent30), 0);

// ---- manual send: recipients ----

export const SEND_STATES = ['trial', 'active', 'lapsed', 'card_past_due'] as const;
export const recipientSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('server'), guildId: z.string().regex(/^\d{5,25}$/, 'Enter a server ID') }),
  z.object({ mode: z.literal('filter'), states: z.array(z.enum(SEND_STATES)).min(1, 'Pick at least one state') }),
  z.object({ mode: z.literal('addresses'), text: z.string().max(40000) }),
]);
export type RecipientInput = z.infer<typeof recipientSchema>;

export interface Recipient { email: string; guild_id: string | null }
export interface Resolved { servers: number; recipients: Recipient[]; skipped: { noContacts: number; unsubscribed: number; invalid: number; whitelisted: number } }

const EMAIL = z.email().max(254);

/**
 * Whitelisted servers get free access and are never emailed from here, whether or not an address is on file.
 * Returns their server IDs and every address attached to them (so a pasted address is skipped too).
 */
async function whitelisted(): Promise<{ guilds: Set<string>; emails: Set<string> }> {
  const wl = await pn().from(T.billing).select('guild_id').eq('whitelisted', true).limit(20000);
  const guilds = new Set(((wl.data ?? []) as Row[]).map((g) => String(g.guild_id)));
  const emails = new Set<string>();
  const ids = [...guilds];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const [a, b] = await Promise.all([
      pn().from(T.emailContacts).select('email').in('guild_id', chunk).limit(20000),
      pn().from(T.contactEmails).select('email').in('guild_id', chunk).limit(20000),
    ]);
    for (const r of [...((a.data ?? []) as Row[]), ...((b.data ?? []) as Row[])]) if (r.email) emails.add(String(r.email).toLowerCase());
  }
  return { guilds, emails };
}

/** Who a manual email would reach. Unsubscribed contacts are skipped for marketing emails, and the count is shown up front. */
export async function resolveRecipients(r: RecipientInput, marketing: boolean): Promise<Resolved> {
  const skipped = { noContacts: 0, unsubscribed: 0, invalid: 0, whitelisted: 0 };
  const wl = await whitelisted();
  if (r.mode === 'addresses') {
    const seen = new Set<string>();
    const recipients: Recipient[] = [];
    for (const raw of r.text.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)) {
      if (!EMAIL.safeParse(raw).success) { skipped.invalid++; continue; }
      if (seen.has(raw)) continue;
      seen.add(raw);
      if (wl.emails.has(raw)) { skipped.whitelisted++; continue; }
      recipients.push({ email: raw, guild_id: null });
    }
    return { servers: 0, recipients, skipped };
  }

  let guildIds: string[];
  if (r.mode === 'server') guildIds = [r.guildId];
  else {
    const [billing, guilds] = await Promise.all([
      pn().from(T.billing).select('guild_id,trial_ends_at,paid_until,whitelisted,card_subscription_id,card_status').limit(20000),
      pn().from(T.guilds).select('guild_id,bot_present').limit(20000),
    ]);
    const present = new Map(((guilds.data ?? []) as Row[]).map((g) => [String(g.guild_id), g.bot_present as boolean | null]));
    const want = new Set<string>(r.states);
    guildIds = ((billing.data ?? []) as Row[]).filter((b) => {
      const s = subscriptionState({ trial_ends_at: str(b.trial_ends_at), paid_until: str(b.paid_until), whitelisted: b.whitelisted as boolean, card_subscription_id: str(b.card_subscription_id), card_status: str(b.card_status) }, present.get(String(b.guild_id)));
      return s === 'active_card' || s === 'active_crypto' ? want.has('active') : want.has(s);
    }).map((b) => String(b.guild_id));
  }

  skipped.whitelisted = guildIds.filter((g) => wl.guilds.has(g)).length;
  guildIds = guildIds.filter((g) => !wl.guilds.has(g));
  const rows: Row[] = [];
  const legacy: Row[] = [];
  for (let i = 0; i < guildIds.length; i += 200) {
    const chunk = guildIds.slice(i, i + 200);
    const [res, old] = await Promise.all([
      pn().from(T.emailContacts).select('guild_id,email,marketing_unsubscribed_at').in('guild_id', chunk).limit(20000),
      // Addresses members shared with the bot (shown as "Member emails" on the server page) are contacts too.
      pn().from(T.contactEmails).select('guild_id,email,discord_user_id').in('guild_id', chunk).limit(20000),
    ]);
    if (res.error && !old.data) throw new Error('contacts query failed');
    rows.push(...((res.data ?? []) as Row[]));
    legacy.push(...((old.data ?? []) as Row[]));
  }
  // Marketing opt-outs for those members live on the customer record, not on the address.
  const optedOut = new Set<string>();
  const memberIds = [...new Set(legacy.map((l) => String(l.discord_user_id)).filter((x) => /^\d+$/.test(x)))];
  for (let i = 0; marketing && i < memberIds.length; i += 200) {
    const res = await pn().from(T.contacts).select('discord_user_id').eq('reminders_opt_out', true).in('discord_user_id', memberIds.slice(i, i + 200));
    for (const r of (res.data ?? []) as Row[]) optedOut.add(String(r.discord_user_id));
  }
  for (const l of legacy) rows.push({ ...l, marketing_unsubscribed_at: optedOut.has(String(l.discord_user_id)) ? 'opted_out' : null });
  const withContacts = new Set(rows.map((c) => String(c.guild_id)));
  skipped.noContacts = guildIds.filter((g) => !withContacts.has(g)).length;
  const seen = new Set<string>();
  const recipients: Recipient[] = [];
  for (const c of rows) {
    const email = String(pick(c, 'email', 'address') ?? '').toLowerCase();
    const key = `${c.guild_id}:${email}`;
    if (!email || seen.has(key)) continue;
    seen.add(key);
    if (marketing && c.marketing_unsubscribed_at) { skipped.unsubscribed++; continue; }
    recipients.push({ email, guild_id: String(c.guild_id) });
  }
  return { servers: guildIds.length, recipients, skipped };
}

// ---- batches and single rows ----

export async function batchProgress(batch: string) {
  const res = await pn().from(T.emailOutbox).select('status,status_detail,send_after').eq('variables->>batch', batch).limit(5000);
  if (res.error) throw new Error('batch query failed');
  const rows = (res.data ?? []) as Row[];
  const counts = { queued: 0, sending: 0, sent: 0, failed: 0, skipped: 0 };
  const reasons = new Map<string, number>();
  for (const r of rows) {
    const k = String(r.status) as keyof typeof counts;
    if (k in counts) counts[k]++;
    const d = str(r.status_detail);
    if (d && (r.status === 'failed' || r.status === 'skipped')) reasons.set(d, (reasons.get(d) ?? 0) + 1);
  }
  const queued = rows.filter((r) => r.status === 'queued').map((r) => str(r.send_after)).filter(Boolean).sort();
  return { total: rows.length, counts, reasons: [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 8), nextSend: queued[0] ?? null };
}

export async function getOutboxRow(id: string): Promise<Row | null> {
  const { data } = await pn().from(T.emailOutbox).select('*').eq('id', id).maybeSingle();
  return (data as Row | null) ?? null;
}

/** True when this admin has queued a [TEST] email in the last 24 hours (required before a send to more than 20 people). */
export async function hasRecentTest(adminEmail: string): Promise<boolean> {
  const { count } = await pn().from(T.emailOutbox).select('*', { count: 'exact', head: true })
    .eq('created_by', adminEmail).like('subject_override', '[TEST] %').gte('created_at', iso(daysFrom(-1)));
  return (count ?? 0) > 0;
}

/** Contacts for the owner's CSV export. Addresses stay masked unless `full=1` is in the request; the route audit-logs every export. */
export async function exportEmailContacts(sp: Record<string, string | undefined>) {
  return (await allContacts()).slice(0, 20000).map((r) => ({
    email: sp.full === '1' ? r.email : r.email.replace(/^(.).*(@.*)$/, '$1***$2'), guild_id: r.guild_id, source: r.source, discord_user_id: r.discord_user_id ?? '',
    marketing_unsubscribed_at: r.marketing_unsubscribed_at ?? '', created_at: r.created_at ?? '',
  }));
}

// ---- helpers for the existing pages ----

/** Which of these servers have an email contact, and which had a failed email in the last 7 days. */
export async function emailBadges(guildIds: string[]): Promise<{ hasEmail: Set<string>; failed: Map<string, number> }> {
  const hasEmail = new Set<string>();
  const failed = new Map<string, number>();
  if (guildIds.length === 0) return { hasEmail, failed };
  const [c, f] = await Promise.all([
    pn().from(T.emailContacts).select('guild_id').in('guild_id', guildIds).limit(20000),
    pn().from(T.emailOutbox).select('guild_id').eq('status', 'failed').in('guild_id', guildIds).gte('created_at', iso(daysFrom(-7))).limit(20000),
  ]);
  for (const r of (c.data ?? []) as Row[]) hasEmail.add(String(r.guild_id));
  for (const r of (f.data ?? []) as Row[]) failed.set(String(r.guild_id), (failed.get(String(r.guild_id)) ?? 0) + 1);
  return { hasEmail, failed };
}

/** Emails sent per server and when the last one went out, for the Reminders page. */
export async function emailStatsByGuild(guildIds: string[]): Promise<Map<string, { sent: number; last: string | null }>> {
  const out = new Map<string, { sent: number; last: string | null }>();
  if (guildIds.length === 0) return out;
  const res = await pn().from(T.emailOutbox).select('guild_id,created_at,sent_at').eq('status', 'sent').in('guild_id', guildIds).limit(20000);
  for (const r of (res.data ?? []) as Row[]) {
    const k = String(r.guild_id);
    const at = str(r.sent_at) ?? str(r.created_at);
    const cur = out.get(k) ?? { sent: 0, last: null };
    out.set(k, { sent: cur.sent + 1, last: at && (!cur.last || at > cur.last) ? at : cur.last });
  }
  return out;
}

/** Counts per template over the last 30 days. */
export async function emailCountsByType() {
  const res = await pn().from(T.emailOutbox).select('template_key,status').gte('created_at', iso(daysFrom(-30))).limit(50000);
  const map = new Map<string, { sent: number; failed: number; queued: number; skipped: number }>();
  for (const r of (res.data ?? []) as Row[]) {
    const k = str(r.template_key) ?? 'custom';
    const cur = map.get(k) ?? { sent: 0, failed: 0, queued: 0, skipped: 0 };
    const s = String(r.status);
    if (s === 'sent') cur.sent++; else if (s === 'failed') cur.failed++; else if (s === 'skipped') cur.skipped++; else cur.queued++;
    map.set(k, cur);
  }
  return [...map].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.sent + b.failed - (a.sent + a.failed));
}
