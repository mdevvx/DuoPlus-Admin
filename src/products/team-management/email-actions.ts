'use server';

import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { runAction, UserError, type ActionResult } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { maskEmail } from '@/lib/format';
import { reason } from '@/lib/validation';
import type { Permission } from '@/lib/roles';
import { emailLogoUrl } from '@/products/disconotify/email/logo';
import { SLUG, TmsError } from './api';
import {
  addEmailContact, eraseEmailAddress, getOutboxItem, listEmailContacts, listEmailTemplates, previewEmailTemplate, removeEmailContact, resendOutboxItem, resetEmailTemplate,
  restoreTemplateVersion, runReminders, saveEmailLayout, saveEmailSettings, saveEmailTemplate, sendEmail, sendPasswordReset, setContactOptOut, testEmailTemplate,
  type EmailContact, type OutboxDetail, type SendResult, type TemplatePreview,
} from './email-api';

/** Everything that changes email or sends it needs the email permission; reading and previews need only read access. */
async function gate(permission: Permission) {
  const { admin } = await requireAdmin({ product: SLUG, permission });
  return admin;
}
const audit = (admin: { id: string; email: string }, action: string, target_id: string, after?: unknown, why?: string | null) =>
  writeAudit({ admin_id: admin.id, admin_email: admin.email, product_slug: SLUG, action, target_type: 'email', target_id, after, reason: why ?? null });

/** The API's failures as messages an admin can act on. The admin key never appears in any of them. */
function explain(e: unknown): never {
  if (e instanceof TmsError) {
    if (e.code === 'not_configured') throw new UserError('The Donexel connection is not set up (DONEXEL_API_URL, DONEXEL_ADMIN_KEY).');
    if (e.code === 'unreachable') throw new UserError('Could not reach Donexel. Nothing was changed.');
    if (e.status === 401) throw new UserError('Donexel rejected the admin key.');
    if (e.status === 429) throw new UserError('Too many requests to Donexel (120 a minute). Try again shortly.');
    if (e.status === 502) {
      const detail = (e.body as { error?: unknown } | null)?.error;
      throw new UserError(typeof detail === 'string' && detail ? `The email could not be sent: ${detail}` : 'The email could not be sent. Check the sender settings on the Donexel server.');
    }
    if ([400, 404, 409, 422].includes(e.status)) throw new UserError(e.message && !e.message.startsWith('http_') ? e.message : 'Donexel rejected that request.');
  }
  throw e;
}
async function call<T>(fn: () => Promise<T>): Promise<T> { try { return await fn(); } catch (e) { return explain(e); } }

const oneLine = (max: number) => z.string().trim().max(max).refine((v) => !/[\r\n]/.test(v), 'This must be a single line');
const key = z.string().regex(/^[a-z0-9_]{2,60}$/, 'Invalid template');
const address = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address').max(254));
const template = z.object({ subject: oneLine(200), heading: oneLine(200), body: z.string().max(20_000), buttonLabel: oneLine(60), enabled: z.boolean() });

// ================= read-only helpers for the client =================
export type PreviewResult = { ok: true; preview: TemplatePreview } | { ok: false; error: string };

/** Rendered with sample values. The HTML goes into a sandboxed frame, never into the panel's own page. */
const layoutShape = z.object({ brandName: oneLine(60), accentColor: z.string().regex(/^#[0-9a-f]{6}$/i, 'Use a colour like #5B6CF0'), logoUrl: z.union([z.literal(''), z.string().trim().max(500).regex(/^https:\/\/\S+$/i, 'The logo link must start with https://')]), footerHtml: z.string().max(4_000), footerText: z.string().max(2_000) });

export async function previewTemplateAction(templateKey: string, draft: { subject?: string; heading?: string; body?: string; buttonLabel?: string; dark?: boolean; sample?: 'short' | 'long'; layout?: Partial<z.input<typeof layoutShape>> }): Promise<PreviewResult> {
  try {
    await requireAdmin({ product: SLUG, permission: 'read' });
    const d = z.object({
      subject: z.string().max(400).optional(), heading: z.string().max(400).optional(), body: z.string().max(20_000).optional(), buttonLabel: z.string().max(120).optional(),
      dark: z.boolean().optional(), sample: z.enum(['short', 'long']).optional(), layout: layoutShape.partial().optional(),
    }).parse(draft);
    return { ok: true, preview: await previewEmailTemplate(key.parse(templateKey), d) };
  } catch (e) {
    if (e instanceof TmsError && e.status === 404) return { ok: false, error: 'This template was not found.' };
    // The request id lets whoever runs Donexel find the failure in its logs.
    const id = e instanceof TmsError ? (e.body as { error?: { details?: { requestId?: unknown } } } | null)?.error?.details?.requestId : undefined;
    return { ok: false, error: `Could not render the preview${e instanceof TmsError && e.status ? ` (Donexel answered ${e.status})` : ''}.${typeof id === 'string' ? ` Request ${id}.` : ''}` };
  }
}

export type OutboxDetailResult = { ok: true; item: OutboxDetail } | { ok: false; error: string };
export async function loadOutboxDetail(id: string): Promise<OutboxDetailResult> {
  try {
    await requireAdmin({ product: SLUG, permission: 'read' });
    return { ok: true, item: await getOutboxItem(z.string().regex(/^[\w-]{1,64}$/).parse(id)) };
  } catch {
    return { ok: false, error: 'Could not load this email.' };
  }
}

export async function searchContactsAction(q: string): Promise<{ ok: true; items: EmailContact[] } | { ok: false }> {
  try {
    await requireAdmin({ product: SLUG, permission: 'read' });
    const r = await listEmailContacts({ search: z.string().trim().max(100).parse(q), page: 1, pageSize: 8 });
    return { ok: true, items: r.items };
  } catch {
    return { ok: false };
  }
}

// ================= templates =================
export async function saveTemplateAction(input: { key: string; subject: string; heading: string; body: string; buttonLabel: string; enabled: boolean; hasLink: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await gate('tms.email');
    const k = key.parse(input.key);
    const t = template.parse(input);
    if (input.hasLink && !t.buttonLabel) throw new UserError('This email has a button, so the button label is required.');
    if (!t.subject || !t.heading || !t.body.trim()) throw new UserError('Subject, heading and body are required.');
    await call(() => saveEmailTemplate(k, t, admin.email));
    await audit(admin, 'email.template.save', k, { enabled: t.enabled, subject: t.subject });
    return 'Template saved';
  });
}

/** Switches a template on or off without touching its wording. */
export async function toggleTemplateAction(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await gate('tms.email');
    const k = key.parse(fd.get('key'));
    const enabled = z.enum(['true', 'false']).parse(fd.get('enabled')) === 'true';
    const current = (await call(() => listEmailTemplates())).find((t) => t.key === k);
    if (!current) throw new UserError('This template was not found.');
    await call(() => saveEmailTemplate(k, { subject: current.subject, heading: current.heading, body: current.body, buttonLabel: current.buttonLabel, enabled }, admin.email));
    await audit(admin, 'email.template.toggle', k, { enabled });
    return enabled ? 'Template switched on' : 'Template switched off. It will be skipped instead of sent.';
  });
}

export async function resetTemplateAction(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await gate('tms.email');
    const k = key.parse(fd.get('key'));
    await call(() => resetEmailTemplate(k));
    await audit(admin, 'email.template.reset', k);
    return 'Template reset to its default wording';
  });
}

/** Saves an earlier version as a new one; nothing is lost from the history. */
export async function restoreVersionAction(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await gate('tms.email');
    const k = key.parse(fd.get('key'));
    const version = z.coerce.number().int().min(1).parse(fd.get('version'));
    await call(() => restoreTemplateVersion(k, version, admin.email));
    await audit(admin, 'email.template.restore', k, { version });
    return `Version ${version} restored as a new version`;
  });
}

export async function testTemplateAction(input: { key: string; to: string }): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await gate('tms.email');
    const k = key.parse(input.key);
    const to = address.parse(input.to);
    await call(() => testEmailTemplate(k, to, admin.email));
    await audit(admin, 'email.template.test', k, { to: maskEmail(to) });
    return `Test sent to ${to}`;
  });
}

// ================= sending =================
const MAX_RECIPIENTS = 50;
const sendInput = z.object({
  to: z.array(address).min(1, 'Add at least one recipient').max(MAX_RECIPIENTS, `At most ${MAX_RECIPIENTS} recipients at a time`),
  subject: oneLine(200).refine((v) => v.length > 0, 'Subject is required'),
  heading: oneLine(200).optional(),
  body: z.string().trim().min(1, 'Write a message').max(20_000),
  button: z.object({ label: oneLine(60).refine((v) => v.length > 0, 'The button needs a label'), url: z.string().trim().max(500).regex(/^https:\/\/\S+$/i, 'The button link must start with https://') }).optional(),
  confirmed: z.boolean().optional(), confirm: z.string().optional(), reason: z.string().optional(),
});

export type SendOutcome = ActionResult & { results?: SendResult[]; sent?: number; failed?: number };

export async function sendEmailAction(input: z.input<typeof sendInput>): Promise<SendOutcome> {
  let out: { results: SendResult[]; sent: number; failed: number } | undefined;
  const res = await runAction(async () => {
    const admin = await gate('tms.email');
    const d = sendInput.parse(input);
    const to = [...new Set(d.to)];
    if (to.length >= 2 && !d.confirmed) throw new UserError('Confirm the send first.');
    let why: string | null = null;
    if (to.length > 20) {
      if ((d.confirm ?? '').trim() !== `SEND ${to.length}`) throw new UserError(`Type "SEND ${to.length}" exactly to confirm.`);
      why = reason.parse(d.reason);
    }
    out = await call(() => sendEmail({ to, subject: d.subject, ...(d.heading ? { heading: d.heading } : {}), body: d.body, ...(d.button ? { button: d.button } : {}), sentBy: admin.email }));
    await audit(admin, 'email.send', `${to.length} recipient${to.length === 1 ? '' : 's'}`, { subject: d.subject, recipients: to.length, sent: out.sent, failed: out.failed }, why);
    return out.failed ? `${out.sent} sent, ${out.failed} failed` : `${out.sent} email${out.sent === 1 ? '' : 's'} sent`;
  });
  return res.ok ? { ...res, ...out } : res;
}

/** Resends one email. The API refuses emails that carried a one-time link and skipped ones. */
export async function resendEmailAction(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await gate('tms.email');
    const id = z.string().regex(/^[\w-]{1,64}$/).parse(fd.get('id'));
    await call(() => resendOutboxItem(id, admin.email));
    await audit(admin, 'email.resend', id);
    return 'Email sent again';
  });
}

// ================= contacts =================
/** Opting out stops reminders only; account and billing emails are always sent. */
export async function setOptOutAction(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await gate('tms.email');
    const email = address.parse(fd.get('email'));
    const optedOut = z.enum(['true', 'false']).parse(fd.get('optedOut')) === 'true';
    await call(() => setContactOptOut(email, optedOut));
    await audit(admin, 'email.optout', maskEmail(email), { optedOut });
    return optedOut ? 'Reminders switched off for this person' : 'Reminders switched back on for this person';
  });
}

export async function sendPasswordResetAction(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await gate('tms.email');
    const id = z.string().regex(/^[\w-]{1,64}$/).parse(fd.get('id'));
    await call(() => sendPasswordReset(id));
    await audit(admin, 'email.password_reset', id);
    return 'Password reset email sent';
  });
}

/** Adds an address by hand. Accounts are created elsewhere, so these only ever receive what an admin sends them. */
export async function addContactAction(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await gate('tms.email');
    const email = address.parse(fd.get('email'));
    const name = oneLine(120).parse(String(fd.get('name') ?? ''));
    await call(() => addEmailContact(email, name || undefined));
    await audit(admin, 'email.contact.add', maskEmail(email));
    return 'Contact added';
  });
}

/** Only contacts added by hand can be removed; the API refuses accounts. */
export async function removeContactAction(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await gate('tms.email');
    const id = z.string().regex(/^[\w-]{1,64}$/).parse(fd.get('id'));
    await call(() => removeEmailContact(id));
    await audit(admin, 'email.contact.remove', id);
    return 'Contact removed';
  });
}

/** Privacy request: removes the address from contacts, the opt-out list and every email in the outbox. Cannot be undone. */
export async function eraseAddressAction(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await gate('tms.email');
    const email = address.parse(fd.get('email'));
    if (address.parse(fd.get('confirm')) !== email) throw new UserError('The two addresses do not match.');
    const why = reason.parse(fd.get('reason'));
    const gone = await call(() => eraseEmailAddress(email));
    await audit(admin, 'email.contact.erase', maskEmail(email), gone, why);
    return `The address was deleted everywhere (${gone.contacts} contact${gone.contacts === 1 ? '' : 's'}, ${gone.emails} email${gone.emails === 1 ? '' : 's'} removed)`;
  });
}

// ================= reminders and settings =================
export type RunOutcome = ActionResult & { counts?: Record<string, number> };
export async function runRemindersAction(): Promise<RunOutcome> {
  let counts: Record<string, number> | undefined;
  const res = await runAction(async () => {
    const admin = await gate('tms.email');
    counts = await call(() => runReminders());
    const total = Object.values(counts).reduce((a, n) => a + n, 0);
    await audit(admin, 'email.reminders.run', 'reminders', counts);
    return total ? `${total} reminder${total === 1 ? '' : 's'} sent` : 'No reminders were due';
  });
  return res.ok ? { ...res, counts } : res;
}

const settings = z.object({ fromName: oneLine(80), replyTo: z.union([z.literal(''), address]), footer: z.string().max(2_000), remindersEnabled: z.boolean() });
export async function saveEmailSettingsAction(input: z.input<typeof settings>): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await gate('tms.email');
    const s = settings.parse(input);
    await call(() => saveEmailSettings(s));
    await audit(admin, 'email.settings.save', 'settings', { remindersEnabled: s.remindersEnabled, fromName: s.fromName, replyTo: s.replyTo ? maskEmail(s.replyTo) : '' });
    return 'Email settings saved';
  });
}

export async function saveLayoutAction(input: Omit<z.input<typeof layoutShape>, 'logoUrl'> & { showLogo: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await gate('tms.email');
    const { showLogo, ...rest } = input;
    const l = layoutShape.parse({ ...rest, logoUrl: '' });
    if (!l.brandName) throw new UserError('Brand name is required.');
    if (showLogo) {
      const logo = await emailLogoUrl(SLUG);
      if (logo.url === null) throw new UserError(logo.reason); // never store an address email apps cannot load
      l.logoUrl = logo.url;
    }
    await call(() => saveEmailLayout(l, admin.email));
    await audit(admin, 'email.layout.save', 'layout', { brandName: l.brandName, accentColor: l.accentColor });
    return 'Layout saved';
  });
}
