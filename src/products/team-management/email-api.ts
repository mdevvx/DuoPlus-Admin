import 'server-only';
import { z } from 'zod';
import { TmsError, request } from './api';

// Every field has a fallback, so a missing or unexpected value renders defensively instead of breaking the page.
const num = z.coerce.number().catch(0);
const str = z.string().catch('');
const bool = z.boolean().catch(false);
const opt = z.string().nullable().catch(null);

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new TmsError(0, 'bad_response', 'The Donexel API sent an unexpected response');
  return r.data;
}

// Shared plain values (categories, statuses, critical templates) live in ./email-meta so browser components can use them too.
export { ACCOUNT_CRITICAL, CATEGORY_LABEL, CATEGORY_ORDER, OUTBOX_SOURCES, OUTBOX_STATUSES } from './email-meta';

// ---- overview and reminders ----
const overviewSchema = z.object({
  configured: bool, from: str, remindersEnabled: bool,
  last30d: z.object({ total: num, sent: num, failed: num, skipped: num }).catch({ total: 0, sent: 0, failed: 0, skipped: 0 }),
  lastSuccessAt: opt, total24h: num, failed24h: num, stalePending: num,
});
export type EmailOverview = z.infer<typeof overviewSchema>;
export const emailOverview = async () => parse(overviewSchema, await request('GET', '/email/overview'));

const ruleSchema = z.object({ key: str, name: str, trigger: str, enabled: bool, sentLast30d: num });
const remindersSchema = z.object({ enabled: bool, rules: z.array(ruleSchema).catch([]) });
export type ReminderRule = z.infer<typeof ruleSchema>;
export const emailReminders = async () => parse(remindersSchema, await request('GET', '/email/reminders'));

const runSchema = z.record(z.string(), num).catch({});
export const runReminders = async () => parse(runSchema, await request('POST', '/email/reminders/run'));

// ---- templates ----
const draftSchema = z.object({ subject: str, heading: str, body: str, buttonLabel: str });
const templateSchema = z.object({
  key: str, name: str, category: str, trigger: str, variables: z.array(z.string()).catch([]),
  hasLink: bool, sensitive: bool, enabled: z.boolean().catch(true), customized: bool,
  subject: str, heading: str, body: str, buttonLabel: str,
  version: num, updatedBy: opt, updatedAt: opt, sentLast30d: num,
  defaults: draftSchema.catch({ subject: '', heading: '', body: '', buttonLabel: '' }),
});
export type EmailTemplate = z.infer<typeof templateSchema>;
export const listEmailTemplates = async () => parse(z.array(templateSchema).catch([]), await request('GET', '/email/templates'));

export interface TemplateInput { subject: string; heading: string; body: string; buttonLabel: string; enabled: boolean }
export const saveEmailTemplate = async (key: string, t: TemplateInput, updatedBy?: string) =>
  parse(templateSchema, await request('PUT', `/email/templates/${encodeURIComponent(key)}`, { ...t, ...(updatedBy ? { updatedBy } : {}) }));

const versionSchema = z.object({ version: num, subject: str, updatedBy: opt, updatedAt: opt });
export type TemplateVersion = z.infer<typeof versionSchema>;
/** Accepts a bare array or { items }, so either shape of the endpoint works. */
export async function listTemplateVersions(key: string) {
  const raw = await request('GET', `/email/templates/${encodeURIComponent(key)}/versions`);
  const list = Array.isArray(raw) ? raw : (raw as { items?: unknown } | null)?.items;
  return parse(z.array(versionSchema).catch([]), list ?? []);
}
export const restoreTemplateVersion = async (key: string, version: number, updatedBy: string) => { await request('POST', `/email/templates/${encodeURIComponent(key)}/restore`, { version, updatedBy }); };
export const resetEmailTemplate = async (key: string) => { await request('DELETE', `/email/templates/${encodeURIComponent(key)}`); };

const previewSchema = z.object({ subject: str, text: str, html: str });
export type TemplatePreview = z.infer<typeof previewSchema>;
export interface PreviewOptions { dark?: boolean; sample?: 'short' | 'long'; layout?: Partial<EmailLayout> }
export const previewEmailTemplate = async (key: string, draft: Partial<Omit<TemplateInput, 'enabled'>> & PreviewOptions) =>
  parse(previewSchema, await request('POST', `/email/templates/${encodeURIComponent(key)}/preview`, { ...draft }));

/** Sends the saved template with sample values to one address. A 502 carries { status, error } in the error's body. */
export const testEmailTemplate = async (key: string, to: string, sentBy: string) => { await request('POST', `/email/templates/${encodeURIComponent(key)}/test`, { to, sentBy }); };

// ---- sending ----
const resultSchema = z.object({ to: str, status: str, error: opt, id: opt });
const sendSchema = z.object({ results: z.array(resultSchema).catch([]), sent: num, failed: num });
export type SendResult = z.infer<typeof resultSchema>;
export interface SendInput { to: string[]; subject: string; heading?: string; body: string; button?: { label: string; url: string }; sentBy: string }
export const sendEmail = async (m: SendInput) => parse(sendSchema, await request('POST', '/email/send', { ...m }));

// ---- outbox ----
const outboxItemSchema = z.object({
  id: str, templateKey: opt, source: str, to: str, toName: opt, userId: opt, subject: str, status: str, error: opt, sentBy: opt, createdAt: str,
  canResend: bool, attempts: num, workspaceId: opt, workspaceName: opt,
});
export type OutboxItem = z.infer<typeof outboxItemSchema>;
const outboxSchema = z.object({ page: num, pageSize: num, total: num, items: z.array(outboxItemSchema).catch([]) });
export async function listOutbox(p: { status?: string; source?: string; template?: string; search?: string; from?: string; to?: string; page: number; pageSize: number }) {
  const sp = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize) });
  for (const k of ['status', 'source', 'template', 'search', 'from', 'to'] as const) if (p[k]) sp.set(k, p[k]!);
  return parse(outboxSchema, await request('GET', `/email/outbox?${sp}`));
}
const outboxDetailSchema = outboxItemSchema.extend({ body: str });
export type OutboxDetail = z.infer<typeof outboxDetailSchema>;
export const getOutboxItem = async (id: string) => parse(outboxDetailSchema, await request('GET', `/email/outbox/${encodeURIComponent(id)}`));
export const resendOutboxItem = async (id: string, sentBy: string) => { await request('POST', `/email/outbox/${encodeURIComponent(id)}/resend`, { sentBy }); };

// ---- contacts ----
const contactSchema = z.object({ id: str, email: str, fullName: opt, createdAt: str, remindersOptedOut: bool, lastEmailAt: opt, kind: z.enum(['account', 'manual']).catch('account') });
export type EmailContact = z.infer<typeof contactSchema>;
const contactsSchema = z.object({ page: num, pageSize: num, total: num, subscribed: num, unsubscribed: num, items: z.array(contactSchema).catch([]) });
export async function listEmailContacts(p: { search?: string; subscribed?: 'true' | 'false'; page: number; pageSize: number }) {
  const sp = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize) });
  if (p.search) sp.set('search', p.search);
  if (p.subscribed) sp.set('subscribed', p.subscribed);
  return parse(contactsSchema, await request('GET', `/email/contacts?${sp}`));
}
export const setContactOptOut = async (email: string, optedOut: boolean) => { await request('PUT', `/email/contacts/${encodeURIComponent(email)}/optout`, { optedOut }); };
export const addEmailContact = async (email: string, name?: string) => { await request('POST', '/email/contacts', { email, ...(name ? { name } : {}) }); };
export const removeEmailContact = async (id: string) => { await request('DELETE', `/email/contacts/${encodeURIComponent(id)}`); };
/** Removes the address from contacts, the opt-out list and every outbox row. Refused (409) while it still has an account. */
const erasedSchema = z.object({ erased: z.object({ contacts: num, optouts: num, emails: num }).catch({ contacts: 0, optouts: 0, emails: 0 }) });
export const eraseEmailAddress = async (email: string) => parse(erasedSchema, (await request('POST', '/email/contacts/erase', { email })) ?? {}).erased;
export const sendPasswordReset = async (contactId: string) => { await request('POST', `/email/contacts/${encodeURIComponent(contactId)}/password-reset`); };

// ---- settings ----
const settingsSchema = z.object({ fromName: str, replyTo: str, footer: str, remindersEnabled: bool, senderAddress: str, configured: bool, supportEmail: str });
export type EmailSettings = z.infer<typeof settingsSchema>;
export const getEmailSettings = async () => parse(settingsSchema, await request('GET', '/email/settings'));
export const saveEmailSettings = async (s: { fromName: string; replyTo: string; footer: string; remindersEnabled: boolean }) => { await request('PUT', '/email/settings', { ...s }); };

// ---- layout and branding ----
const layoutSchema = z.object({ brandName: str, accentColor: str, logoUrl: str, footerHtml: str, footerText: str });
export type EmailLayout = z.infer<typeof layoutSchema>;
export const getEmailLayout = async () => parse(layoutSchema, await request('GET', '/email/layout'));
export const saveEmailLayout = async (l: EmailLayout, updatedBy?: string) => { await request('PUT', '/email/layout', { ...l, ...(updatedBy ? { updatedBy } : {}) }); };
