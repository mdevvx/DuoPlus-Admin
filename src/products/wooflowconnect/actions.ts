'use server';

import { z } from 'zod';
import { ensureStepUp, requireAdmin } from '@/lib/auth';
import { runAction, UserError, type ActionResult } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { reason } from '@/lib/validation';
import type { Permission } from '@/lib/roles';
import { SLUG, WfcError, wfcPost } from './api';

/** Operations that lock customers out or destroy state need a fresh authenticator code. */
const DANGEROUS_OPS = new Set(['suspend', 'cancel_now', 'revoke_keys', 'release_store']);
const OPS = ['suspend', 'unsuspend', 'cancel_now', 'cancel_end', 'resume', 'grant_days', 'release_store', 'revoke_keys', 'logout_user', 'set_label', 'add_note'] as const;

const input = z.object({
  id: z.string().regex(/^[\w.@+-]{1,120}$/, 'Invalid customer'),
  op: z.enum(OPS),
  reason,
  code: z.string().optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
  ref: z.string().max(60).optional(),
  label: z.string().trim().max(60).optional(),
  note: z.string().trim().min(1).max(1000).optional(),
});

/** One support action on one customer, forwarded to the licence server and audit-logged here. */
export async function supportAction(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const d = input.parse(Object.fromEntries([...fd].map(([k, v]) => [k, typeof v === 'string' ? v : ''])));
    const permission: Permission = DANGEROUS_OPS.has(d.op) ? 'support.danger' : 'support.act';
    const { admin } = await requireAdmin({ product: SLUG, permission });
    await ensureStepUp(admin, permission, d.code?.trim() || undefined);

    const body: Record<string, unknown> = { id: /^\d+$/.test(d.id) ? Number(d.id) : d.id, op: d.op };
    if (d.op === 'grant_days') { if (!d.days) throw new UserError('Enter the number of days (1 to 365)'); body.days = d.days; }
    if (d.op === 'set_label') { if (!d.ref) throw new UserError('This customer has no store to label'); body.ref = d.ref; body.label = d.label ?? ''; }
    if (d.op === 'add_note') { if (!d.note) throw new UserError('Write a note first'); body.note = d.note; }

    try {
      await wfcPost('action', body);
    } catch (e) {
      if (e instanceof WfcError) {
        if (e.code === 'read_only') throw new UserError('The API key is read only. Create a "Read and support actions" key in the licence server.');
        if (e.status === 422 || e.status === 404) throw new UserError(e.message || 'The licence server rejected that action.');
        if (e.code === 'not_configured') throw new UserError('WFC_API_KEY is not set.');
        if (e.code === 'unreachable') throw new UserError('Could not reach the licence server. Nothing was changed.');
      }
      throw e;
    }

    await writeAudit({
      admin_id: admin.id, admin_email: admin.email, product_slug: SLUG, action: `support.${d.op}`, target_type: 'customer', target_id: d.id, reason: d.reason,
      after: { op: d.op, days: d.days, label: d.label, ref: d.ref },
    });
    return 'Done';
  });
}
