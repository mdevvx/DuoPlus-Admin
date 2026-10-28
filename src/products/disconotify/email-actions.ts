'use server';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { ensureStepUp, requireAdmin } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { callRpc, runAction, UserError, type ActionResult } from '@/lib/action';
import { guildInfoMap } from '@/lib/discord';
import { hubDb } from '@/lib/supabase-server';
import { requestMeta } from '@/lib/request';
import type { Permission } from '@/lib/roles';
import { reason as reasonSchema, snowflake } from '@/lib/validation';
import { SLUG, T, pick, pn, str } from './db';
import { batchProgress, getLayout, getTemplate, getVersions, hasRecentTest, recipientSchema, resolveRecipients, type Resolved } from './queries/email';
import { emailLogoUrl } from './email/logo';
import { renderEmail } from './email/render';
import { sanitizeEmailHtml } from './email/sanitize';
import { hasErrors, validateTemplate, type Issue } from './email/validate';
import { HTML_MAX, PREHEADER_MAX, SAMPLES, SUBJECT_MAX, VAR_NAMES, layoutSchema, scheduleSchema } from './email/vars';

/** Template and settings edits do not ask for a reason: the audit log records who changed what. */
async function gate(permission: Permission) {
  const { admin } = await requireAdmin({ product: SLUG, permission });
  return { admin, ...(await requestMeta()) };
}

const keySchema = z.string().regex(/^[a-z0-9_]{2,60}$/, 'Invalid template key');
const content = z.object({
  subject: z.string().max(SUBJECT_MAX + 50), preheader: z.string().max(PREHEADER_MAX + 50),
  html: z.string().max(HTML_MAX * 2), text: z.string().max(HTML_MAX), category: z.string().max(20),
});

// ---- preview (read only) ----

export type PreviewResult =
  | { ok: true; document: string; subject: string; preheader: string; text: string; issues: Issue[]; adjusted: boolean }
  | { ok: false; error: string };

export async function previewEmail(input: z.input<typeof content> & { sample: string; dark: boolean }): Promise<PreviewResult> {
  try {
    await requireAdmin({ product: SLUG, permission: 'read' });
    const t = content.parse(input);
    const sample = SAMPLES.find((s) => s.id === input.sample) ?? SAMPLES[0]!;
    const clean = sanitizeEmailHtml(t.html);
    const { layout } = await getLayout();
    const r = renderEmail({ ...t, html: clean, marketing: t.category === 'marketing', layout, vars: sample.values, dark: !!input.dark });
    return { ok: true, document: r.document, subject: r.subject, preheader: r.preheader, text: r.text, issues: validateTemplate(t), adjusted: clean.trim() !== t.html.trim() };
  } catch {
    return { ok: false, error: 'Could not render the preview.' };
  }
}

// ---- templates ----

async function saveContent(key: string, version: number, t: z.infer<typeof content> & { name: string; description: string }, action: string) {
  const issues = validateTemplate(t);
  if (hasErrors(issues)) throw new UserError(issues.find((i) => i.level === 'error')!.message);
  const { admin, ip, ua } = await gate('email.template');
  const clean = sanitizeEmailHtml(t.html);
  await callRpc(hubDb(), 'dn_email_template_save', {
    p_key: key, p_expected_version: version, p_name: t.name, p_description: t.description, p_subject: t.subject.trim(), p_preheader: t.preheader.trim(),
    p_html: clean, p_text: t.text, p_admin: admin.id, p_admin_email: admin.email, p_ip: ip, p_ua: ua, p_action: action,
  });
  return clean.trim() !== t.html.trim();
}

export async function saveTemplate(input: { key: string; version: number } & z.input<typeof content> & { name: string; description: string }): Promise<ActionResult> {
  return runAction(async () => {
    const t = content.extend({ name: z.string().trim().min(1, 'Name is required').max(80), description: z.string().trim().max(300) }).parse(input);
    const adjusted = await saveContent(keySchema.parse(input.key), z.number().int().parse(input.version), t, 'email.template.save');
    return adjusted ? 'Template saved. The sanitizer adjusted some HTML, so review it.' : 'Template saved';
  });
}

export async function toggleTemplate(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const key = keySchema.parse(fd.get('key'));
    const enabled = z.enum(['true', 'false']).parse(fd.get('enabled')) === 'true';
    const { admin, ip, ua } = await gate('email.template');
    await callRpc(hubDb(), 'dn_email_template_toggle', { p_key: key, p_enabled: enabled, p_admin: admin.id, p_admin_email: admin.email, p_ip: ip, p_ua: ua });
    return enabled ? 'Automatic emails switched on' : 'Automatic emails switched off';
  });
}

/** Copies an old version's content into the template. That creates a new version; history is never deleted. */
export async function restoreVersion(input: { key: string; currentVersion: number; version: number }): Promise<ActionResult> {
  return runAction(async () => {
    const key = keySchema.parse(input.key);
    const version = z.number().int().parse(input.version);
    await gate('email.template');
    const [tpl, versions] = await Promise.all([getTemplate(key), getVersions(key)]);
    const old = versions?.find((v) => Number(v.version) === version);
    if (!tpl || !old) throw new UserError('That version could not be found.');
    const body = { subject: pick(old, 'subject'), html: pick(old, 'body_html'), text: pick(old, 'body_text') };
    if (!body.subject || !body.html || !body.text) throw new UserError('That version has no content to restore.');
    await saveContent(key, z.number().int().parse(input.currentVersion), {
      subject: body.subject, preheader: pick(old, 'preheader') ?? '', html: body.html, text: body.text, category: pick(tpl, 'category') ?? 'transactional',
      name: pick(tpl, 'name') ?? key, description: pick(tpl, 'description') ?? '',
    }, 'email.template.restore');
    return `Restored version ${version} as a new version`;
  });
}

// ---- layout and schedule (owner only) ----

const FOOTER_VARS = new Set(['support_email', 'brand_name']);
function footerVars(html: string, text: string) {
  for (const m of `${html}\n${text}`.matchAll(/\{\{\{?\s*(\w+)\s*\}?\}\}/g)) {
    if (!FOOTER_VARS.has(m[1]!)) throw new UserError(`{{${m[1]}}} cannot be used in the footer. Allowed: support_email, brand_name.`);
  }
}

const layoutInput = z.strictObject({
  brand_name: layoutSchema.shape.brand_name, accent_color: layoutSchema.shape.accent_color,
  footer_html: layoutSchema.shape.footer_html, footer_text: layoutSchema.shape.footer_text, show_logo: z.boolean(),
});

export async function saveLayout(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { admin, ip, ua } = await gate('email.settings');
    const { show_logo, ...v } = layoutInput.parse(input);
    footerVars(v.footer_html, v.footer_text);
    let logo_url = '';
    if (show_logo) {
      const logo = await emailLogoUrl();
      if (logo.url === null) throw new UserError(logo.reason); // never store an address email apps cannot load
      logo_url = logo.url;
    }
    const value = { ...v, logo_url, footer_html: sanitizeEmailHtml(v.footer_html) };
    await callRpc(hubDb(), 'dn_email_setting_save', { p_key: 'email_layout', p_value: value, p_admin: admin.id, p_admin_email: admin.email, p_ip: ip, p_ua: ua });
    return 'Layout saved. It applies to every email, including ones still queued.';
  });
}

export async function saveSchedule(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { admin, ip, ua } = await gate('email.settings');
    const value = scheduleSchema.parse(input);
    await callRpc(hubDb(), 'dn_email_setting_save', { p_key: 'email_schedule', p_value: value, p_admin: admin.id, p_admin_email: admin.email, p_ip: ip, p_ua: ua });
    return 'Schedule saved. The bot picks it up within about 10 minutes.';
  });
}

// ---- manual and test sends ----

const SEND_LIMIT = 200;
const contentSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('template'), key: keySchema, subject: z.string().max(SUBJECT_MAX).optional(), extra: z.record(z.string(), z.string().max(200)).default({}) }),
  z.object({ mode: z.literal('custom'), subject: z.string().max(SUBJECT_MAX + 50), preheader: z.string().max(PREHEADER_MAX).default(''), html: z.string().max(HTML_MAX * 2), text: z.string().max(HTML_MAX), marketing: z.boolean() }),
]);
export type SendContent = z.input<typeof contentSchema>;

function firstError(issues: Issue[]) {
  if (hasErrors(issues)) throw new UserError(issues.find((i) => i.level === 'error')!.message);
}

interface Built { marketing: boolean; template_key: string | null; subject_override: string | null; body_html: string | null; body_text: string | null; extra: Record<string, string> }

/** The outbox fields that describe what to send, shared by tests and real sends. */
async function buildContent(c: z.infer<typeof contentSchema>, unsaved?: { subject: string; html: string; text: string; category: string }): Promise<Built> {
  if (c.mode === 'custom') {
    firstError(validateTemplate({ subject: c.subject, preheader: c.preheader, html: c.html, text: c.text, category: c.marketing ? 'marketing' : 'transactional' }));
    return { marketing: c.marketing, template_key: null, subject_override: c.subject.trim(), body_html: sanitizeEmailHtml(c.html), body_text: c.text, extra: {} };
  }
  const tpl = await getTemplate(c.key);
  if (!tpl) throw new UserError('That template could not be found.');
  const marketing = pick(tpl, 'category') === 'marketing';
  const extra = Object.fromEntries(Object.entries(c.extra).filter(([k]) => VAR_NAMES.has(k)));
  if (unsaved) { // a test of the editor's unsaved content
    firstError(validateTemplate({ subject: unsaved.subject, preheader: '', html: unsaved.html, text: unsaved.text, category: unsaved.category }));
    return { marketing, template_key: c.key, subject_override: unsaved.subject.trim(), body_html: sanitizeEmailHtml(unsaved.html), body_text: unsaved.text, extra };
  }
  return { marketing, template_key: c.key, subject_override: c.subject?.trim() || null, body_html: null, body_text: null, extra };
}

/** Queues one test email with the content currently in the editor. It goes to the address given, or to the admin's own. Allowed for every editor. */
export async function sendTest(input: { key: string; subject: string; html: string; text: string; category: string; sample: string; to?: string }): Promise<ActionResult> {
  return runAction(async () => {
    const { admin, ip, ua } = await gate('read');
    const sample = SAMPLES.find((s) => s.id === input.sample) ?? SAMPLES[0]!;
    const to = input.to?.trim() ? z.email('Enter a valid email address for the test').parse(input.to.trim().toLowerCase()) : admin.email;
    // An empty key means a custom email that has no template behind it.
    const c = input.key
      ? await buildContent({ mode: 'template', key: keySchema.parse(input.key), extra: {} }, { subject: input.subject, html: input.html, text: input.text, category: input.category })
      : await buildContent({ mode: 'custom', subject: input.subject, preheader: '', html: input.html, text: input.text, marketing: input.category === 'marketing' });
    const row = {
      to_email: to, guild_id: null, template_key: c.template_key, subject_override: `[TEST] ${c.subject_override}`, body_html: c.body_html, body_text: c.body_text,
      variables: { ...sample.values, ...(c.marketing ? { marketing: true } : {}) }, send_after: null,
    };
    await callRpc(hubDb(), 'dn_email_send', { p_rows: [row], p_test: true, p_summary: {}, p_admin: admin.id, p_admin_email: admin.email, p_ip: ip, p_ua: ua, p_reason: null });
    return `Test queued for ${to === admin.email ? 'your address' : to}. It arrives within about 2 minutes if the bot is online.`;
  });
}

export type RecipientCheck = { ok: true; servers: number; total: number; skipped: Resolved['skipped']; sample: string[]; overLimit: boolean } | { ok: false; error: string };

/** Counts for steps 1 and 3: who would get the email and who is skipped (and why). Read only. */
export async function checkRecipients(recipients: z.input<typeof recipientSchema>, marketing: boolean): Promise<RecipientCheck> {
  try {
    await requireAdmin({ product: SLUG, permission: 'email.send' });
    const r = await resolveRecipients(recipientSchema.parse(recipients), marketing);
    return {
      ok: true, servers: r.servers, total: r.recipients.length, skipped: r.skipped, overLimit: r.recipients.length > SEND_LIMIT,
      sample: r.recipients.slice(0, 5).map((x) => x.email.replace(/^(.).*(@.*)$/, '$1***$2')),
    };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? e.issues[0]?.message ?? 'Check the recipients.' : 'Could not work out the recipients.' };
  }
}

export type SendResult = ActionResult & { batch?: string };

export async function sendManual(input: {
  recipients: z.input<typeof recipientSchema>; content: SendContent; sendAt: string | null; confirmed?: boolean; confirm?: string; reason?: string; code?: string;
}): Promise<SendResult> {
  let batch: string | undefined;
  const res = await runAction(async () => {
    const { admin, ip, ua } = await gate('email.send');
    const c = await buildContent(contentSchema.parse(input.content));
    const r = await resolveRecipients(recipientSchema.parse(input.recipients), c.marketing);
    const n = r.recipients.length;
    if (n === 0) throw new UserError('There is nobody to send to.');
    if (n > SEND_LIMIT) throw new UserError(`Manual sends are limited to ${SEND_LIMIT} recipients per hour. This one has ${n}; narrow the recipients.`);

    let reason: string | null = null;
    if (n >= 2 && !input.confirmed) throw new UserError('Confirm the send first.');
    if (n > 20) {
      if ((input.confirm ?? '').trim() !== `SEND ${n}`) throw new UserError(`Type "SEND ${n}" exactly to confirm.`);
      reason = reasonSchema.parse(input.reason);
      if (!(await hasRecentTest(admin.email))) throw new UserError('Send a test to yourself first. It is required for more than 20 recipients.');
    }
    if (n > 100) await ensureStepUp(admin, 'email.send.bulk', input.code?.trim() || undefined);

    let sendAfter: string | null = null;
    if (input.sendAt) {
      const t = new Date(input.sendAt).getTime();
      if (!Number.isFinite(t) || t < Date.now() - 60_000 || t > Date.now() + 30 * 86400_000) throw new UserError('Schedule a time within the next 30 days.');
      sendAfter = new Date(t).toISOString();
    }

    const names = await guildInfoMap([...new Set(r.recipients.map((x) => x.guild_id).filter((g): g is string => !!g))]);
    const id = randomUUID();
    batch = id;
    const rows = r.recipients.map((x) => ({
      to_email: x.email, guild_id: x.guild_id, template_key: c.template_key, subject_override: c.subject_override, body_html: c.body_html, body_text: c.body_text, send_after: sendAfter,
      variables: { ...(x.guild_id ? { server_name: names[x.guild_id]?.name ?? 'your server' } : {}), ...c.extra, ...(c.marketing ? { marketing: true } : {}), batch: id },
    }));
    await callRpc(hubDb(), 'dn_email_send', {
      p_rows: rows, p_test: false, p_admin: admin.id, p_admin_email: admin.email, p_ip: ip, p_ua: ua, p_reason: reason,
      p_summary: { batch: id, template: c.template_key, subject: c.subject_override, marketing: c.marketing, scheduled: sendAfter, skipped: r.skipped },
    });
    return `${n} email${n === 1 ? '' : 's'} queued`;
  });
  return res.ok ? { ...res, batch } : res;
}

export async function batchStatus(batch: string) {
  try {
    await requireAdmin({ product: SLUG, permission: 'read' });
    return { ok: true as const, ...(await batchProgress(z.uuid().parse(batch))) };
  } catch {
    return { ok: false as const };
  }
}

// ---- outbox actions ----

const idSchema = z.string().regex(/^[\w-]{1,64}$/, 'Invalid id');
async function outboxOp(op: 'retry' | 'cancel' | 'cancel_batch', id: string) {
  const { admin, ip, ua } = await gate('email.outbox');
  await callRpc(hubDb(), 'dn_email_outbox_change', { p_op: op, p_id: idSchema.parse(id), p_admin: admin.id, p_admin_email: admin.email, p_ip: ip, p_ua: ua });
}
export async function retryEmail(fd: FormData): Promise<ActionResult> {
  return runAction(async () => { await outboxOp('retry', String(fd.get('id'))); return 'Queued again'; });
}
export async function cancelEmail(fd: FormData): Promise<ActionResult> {
  return runAction(async () => { await outboxOp('cancel', String(fd.get('id'))); return 'Email cancelled'; });
}
export async function cancelBatch(fd: FormData): Promise<ActionResult> {
  return runAction(async () => { await outboxOp('cancel_batch', z.uuid().parse(fd.get('id'))); return 'Queued emails cancelled'; });
}

// ---- contacts ----

type ContactOp = 'add' | 'remove' | 'resubscribe' | 'unsubscribe' | 'erase';
async function contactOp(op: ContactOp, permission: Permission, args: { id?: string; guild?: string; email?: string; reason?: string }) {
  const { admin, ip, ua } = await gate(permission);
  await callRpc(hubDb(), 'dn_email_contact_change', {
    p_op: op, p_id: args.id ? idSchema.parse(args.id) : null, p_guild: args.guild ? snowflake.parse(args.guild) : null, p_email: args.email ?? null,
    p_admin: admin.id, p_admin_email: admin.email, p_ip: ip, p_ua: ua, p_reason: args.reason ?? null,
  });
}
const optReason = z.string().trim().max(500).nullish();
export async function addContact(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await contactOp('add', 'email.contact', { guild: String(fd.get('guildId')), email: z.email().parse(String(fd.get('email')).trim()), reason: optReason.parse(fd.get('reason')) ?? undefined });
    return 'Contact added';
  });
}
export async function removeContact(fd: FormData): Promise<ActionResult> {
  return runAction(async () => { await contactOp('remove', 'email.contact', { id: String(fd.get('id')), reason: optReason.parse(fd.get('reason')) ?? undefined }); return 'Contact removed'; });
}
export async function setMarketing(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const op = z.enum(['resubscribe', 'unsubscribe']).parse(fd.get('op'));
    await contactOp(op, 'email.settings', { id: String(fd.get('id')), reason: reasonSchema.parse(fd.get('reason')) });
    return op === 'resubscribe' ? 'Subscribed to marketing emails again' : 'Unsubscribed from marketing emails';
  });
}
export async function eraseAddress(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const email = z.email().transform((e) => e.toLowerCase()).parse(String(fd.get('email')).trim());
    if (String(fd.get('confirm') ?? '').trim().toLowerCase() !== email) throw new UserError('Type the address exactly to confirm.');
    await contactOp('erase', 'email.settings', { email, reason: reasonSchema.parse(fd.get('reason')) });
    return 'Address deleted everywhere';
  });
}

/** Shows one full address. The reveal is audit-logged; the address itself never goes into the audit row. */
export async function revealContact(id: string): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  try {
    const { admin } = await gate('email.contact');
    const member = /^m\.(\d{5,25})\.(\d{5,25})$/.exec(id); // an address a member shared with the bot
    const { data } = member
      ? await pn().from(T.contactEmails).select('guild_id,email').eq('guild_id', member[1]!).eq('discord_user_id', member[2]!).limit(1).maybeSingle()
      : await pn().from(T.emailContacts).select('*').eq('id', idSchema.parse(id)).maybeSingle();
    const row = data as Record<string, unknown> | null;
    const email = row ? pick(row, 'email', 'address') : null;
    if (!row || !email) return { ok: false, error: 'Contact not found.' };
    await writeAudit({ admin_id: admin.id, admin_email: admin.email, product_slug: SLUG, action: 'email.contact.reveal', target_type: 'email_contact', target_id: str(row.guild_id) });
    return { ok: true, email };
  } catch {
    return { ok: false, error: 'Could not reveal this address.' };
  }
}

/** Shows the full recipient of one outbox row. The reveal is audit-logged; the address itself never goes into the audit row. */
export async function revealOutboxEmail(id: string): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  try {
    const { admin } = await gate('email.outbox');
    const { data } = await pn().from(T.emailOutbox).select('to_email,guild_id').eq('id', idSchema.parse(id)).maybeSingle();
    const row = data as Record<string, unknown> | null;
    const email = row ? str(row.to_email) : null;
    if (!row || !email) return { ok: false, error: 'Email not found.' };
    await writeAudit({ admin_id: admin.id, admin_email: admin.email, product_slug: SLUG, action: 'email.outbox.reveal', target_type: 'email_outbox', target_id: id });
    return { ok: true, email };
  } catch {
    return { ok: false, error: 'Could not reveal this address.' };
  }
}
