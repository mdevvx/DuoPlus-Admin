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
  id: str, subject: str, body: str, priority: bool, plan: opt, status: z.enum(SUPPORT_STATUSES).catch('open'), reply: opt, repliedAt: opt, dueAt: opt, overdue: bool, createdAt: str,
  workspace: z.object({ id: opt, name: str }).nullable().catch(null),
  requester: z.object({ id: opt, email: str, fullName: opt }).nullable().catch(null),
});
export type SupportTicket = z.infer<typeof ticketSchema>;
const listSchema = z.object({ page: num, pageSize: num, total: num, tickets: z.array(ticketSchema).catch([]) });

export async function listSupportTickets(p: { status?: string; priority?: boolean; page: number; pageSize: number }) {
  const sp = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize) });
  if (p.status) sp.set('status', p.status);
  if (p.priority !== undefined) sp.set('priority', String(p.priority));
  const r = listSchema.safeParse(await request('GET', `/support/tickets?${sp}`));
  if (!r.success) throw new TmsError(0, 'bad_response', 'The Donexel API sent an unexpected response');
  return r.data;
}

export const replySupportTicket = async (id: string, reply: string, status: 'answered' | 'closed') => {
  await request('POST', `/support/tickets/${encodeURIComponent(id)}/reply`, { reply, status });
};
