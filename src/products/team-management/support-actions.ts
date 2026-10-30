'use server';

import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { runAction, UserError, type ActionResult } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { SLUG, TmsError } from './api';
import { getSupportTicket, replySupportTicket, type SupportTicketDetail } from './support-api';

export type TicketResult = { ok: true; ticket: SupportTicketDetail } | { ok: false; error: string };
/** The whole conversation, loaded when a ticket is opened. Attachment links expire after 10 minutes, so they are never loaded earlier. */
export async function loadTicketAction(id: string): Promise<TicketResult> {
  try {
    await requireAdmin({ product: SLUG, permission: 'read' });
    return { ok: true, ticket: await getSupportTicket(z.string().regex(/^[\w-]{1,64}$/).parse(id)) };
  } catch { return { ok: false, error: 'Could not load this request. Close it and try again.' }; }
}

const input = z.object({
  id: z.string().regex(/^[\w-]{1,64}$/),
  reply: z.string().trim().min(1, 'Write a reply first.').max(5000, 'The reply is too long (5,000 characters at most).'),
  status: z.enum(['answered', 'closed']),
});

/** Sends the answer to the requester (in-app notification and email) and moves the ticket on. */
export async function replyTicketAction(raw: { id: string; reply: string; status: 'answered' | 'closed' }): Promise<ActionResult> {
  return runAction(async () => {
    const { admin } = await requireAdmin({ product: SLUG, permission: 'tms.support' });
    const d = input.parse(raw);
    try { await replySupportTicket(d.id, d.reply, d.status); } catch (e) {
      if (e instanceof TmsError) {
        if (e.code === 'unreachable') throw new UserError('Could not reach Donexel. Nothing was changed.');
        if ([400, 404, 409, 422].includes(e.status)) throw new UserError(e.message && !e.message.startsWith('http_') ? e.message : 'Donexel rejected that reply.');
      }
      throw e;
    }
    await writeAudit({ admin_id: admin.id, admin_email: admin.email, product_slug: SLUG, action: 'support.reply', target_type: 'ticket', target_id: d.id, after: { status: d.status }, reason: null });
    return d.status === 'closed' ? 'Reply sent and ticket closed' : 'Reply sent';
  });
}
