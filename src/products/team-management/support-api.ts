import 'server-only';
import { z } from 'zod';
import { TmsError, request } from './api';
import { SUPPORT_STATUSES } from './support-meta';

// Every field has a fallback, so an unexpected value renders defensively instead of breaking the page.
const num = z.coerce.number().catch(0);
const str = z.string().catch('');
const bool = z.boolean().catch(false);
const opt = z.string().nullable().catch(null);

const ticketSchema = z.object({
  id: str, number: z.coerce.number().nullable().catch(null), category: opt, severity: opt, rating: z.coerce.number().nullable().catch(null), lastActivityAt: opt, subject: str, body: str, priority: bool, plan: opt, status: z.enum(SUPPORT_STATUSES).catch('open'), reply: opt, repliedAt: opt, dueAt: opt, overdue: bool, createdAt: str,
  workspace: z.object({ id: opt, name: str }).nullable().catch(null),
  requester: z.object({ id: opt, email: str, fullName: opt }).nullable().catch(null),
});
export type SupportTicket = z.infer<typeof ticketSchema>;
const listSchema = z.object({ page: num, pageSize: num, total: num, tickets: z.array(ticketSchema).catch([]) });

export async function listSupportTickets(p: { status?: string; priority?: boolean; category?: string; severity?: string; q?: string; page: number; pageSize: number }) {
  const sp = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize) });
  if (p.status) sp.set('status', p.status);
  if (p.category) sp.set('category', p.category);
  if (p.severity) sp.set('severity', p.severity);
  if (p.q) sp.set('q', p.q);
  if (p.priority !== undefined) sp.set('priority', String(p.priority));
  const r = listSchema.safeParse(await request('GET', `/support/tickets?${sp}`));
  if (!r.success) throw new TmsError(0, 'bad_response', 'The Donexel API sent an unexpected response');
  return r.data;
}

const attachmentSchema = z.object({ name: str, size: num, url: str });
const detailSchema = ticketSchema.extend({
  messages: z.array(z.object({ id: str, fromSupport: bool, body: str, createdAt: str, attachments: z.array(attachmentSchema).catch([]) })).catch([]),
  context: z.record(z.string(), z.unknown()).nullable().catch(null),
  ratingNote: opt,
});
export type SupportTicketDetail = z.infer<typeof detailSchema>;
export async function getSupportTicket(id: string) {
  const r = detailSchema.safeParse(await request('GET', `/support/tickets/${encodeURIComponent(id)}`));
  if (!r.success) throw new TmsError(0, 'bad_response', 'The Donexel API sent an unexpected response');
  return r.data;
}

export const closeSupportTicket = async (id: string) => { await request('POST', `/support/tickets/${encodeURIComponent(id)}/close`); };

export const replySupportTicket = async (id: string, reply: string, status: 'answered' | 'closed') => {
  await request('POST', `/support/tickets/${encodeURIComponent(id)}/reply`, { reply, status });
};
