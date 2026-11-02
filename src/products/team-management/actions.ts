'use server';

import { z } from 'zod';
import { ensureStepUp, requireAdmin } from '@/lib/auth';
import { runAction, UserError, type ActionResult } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { reason } from '@/lib/validation';
import { PLANS, SLUG, TmsError, addWhitelist, membersOfWorkspace, removeWhitelist, type AddResult, type Member } from './api';
import { allUsers } from './people';

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address').max(254));
const common = z.object({ reason, code: z.string().optional() });
const addInput = common.extend({ email, plan: z.enum(PLANS), note: z.string().trim().max(300).optional(),
  // The agreed number of people (for example an Enterprise customer on the Scale plan). Empty keeps the plan's default.
  seats: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number().int('Use a whole number.').min(1, 'The people limit must be at least 1.').max(100_000, 'That people limit is too high.').optional()) });
const removeInput = common.extend({ email, confirm: z.string().optional() });

const flat = (fd: FormData) => Object.fromEntries([...fd].map(([k, v]) => [k, typeof v === 'string' ? v : '']));

/** Turns the API's failures into messages an admin can act on. The admin key never appears in any of them. */
function explain(e: unknown): never {
  if (e instanceof TmsError) {
    if (e.code === 'not_configured') throw new UserError('The Donexel connection is not set up (DONEXEL_API_URL, DONEXEL_ADMIN_KEY).');
    if (e.code === 'unreachable') throw new UserError('Could not reach Donexel. Nothing was changed.');
    if (e.status === 401) throw new UserError('The Donexel rejected the admin key.');
    if (e.status === 429) throw new UserError('Too many requests to Donexel. Try again in a minute.');
    if (e.status === 400 || e.status === 422) throw new UserError(e.message || 'The Donexel rejected that request.');
    if (e.status === 404) throw new UserError(e.message === 'http_404' ? 'The Donexel operator API was not found. Check DONEXEL_API_URL.' : e.message);
  }
  throw e;
}

export type AddWhitelistResult = ActionResult & { result?: AddResult };

/** Adding (or updating) a whitelist entry. Makes that person's existing workspaces complimentary right away. */
export async function addWhitelistEntry(fd: FormData): Promise<AddWhitelistResult> {
  let result: AddResult | undefined;
  const res = await runAction(async () => {
    const d = addInput.parse(flat(fd));
    const { admin } = await requireAdmin({ product: SLUG, permission: 'tms.whitelist' });
    await ensureStepUp(admin, 'tms.whitelist', d.code?.trim() || undefined);
    try { result = await addWhitelist({ email: d.email, plan: d.plan, ...(d.note ? { note: d.note } : {}), ...(d.seats ? { seats: d.seats } : {}) }); } catch (e) { explain(e); }
    // The change lives in another system, so its audit row is written here after it succeeded.
    await writeAudit({
      admin_id: admin.id, admin_email: admin.email, product_slug: SLUG, action: 'whitelist.add', target_type: 'whitelist', target_id: d.email, reason: d.reason,
      after: { plan: d.plan, note: d.note ?? null, seats: d.seats ?? null, workspaces: result?.workspaces, activeSubscription: result?.activeSubscription },
    });
    return 'Added to the whitelist';
  });
  return res.ok ? { ...res, result } : res;
}

/** Removing an entry sends the workspaces that were comped through it back to normal billing. */
export async function removeWhitelistEntry(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const d = removeInput.parse(flat(fd));
    if ((d.confirm ?? '').trim().toLowerCase() !== d.email) throw new UserError(`Type "${d.email}" exactly to confirm.`);
    const { admin } = await requireAdmin({ product: SLUG, permission: 'tms.whitelist' });
    await ensureStepUp(admin, 'tms.whitelist', d.code?.trim() || undefined);
    try {
      await removeWhitelist(d.email);
    } catch (e) {
      if (e instanceof TmsError && e.status === 404) throw new UserError('That email is not on the whitelist (it may already have been removed).');
      explain(e);
    }
    await writeAudit({ admin_id: admin.id, admin_email: admin.email, product_slug: SLUG, action: 'whitelist.remove', target_type: 'whitelist', target_id: d.email, reason: d.reason });
    return 'Removed from the whitelist';
  });
}

export type MembersResult =
  | { ok: true; members: Member[] }
  | { ok: false; unsupported?: boolean; error: string };

/** The people in one workspace, for the Workspaces page. Viewing them is written to the audit log. */
export async function loadWorkspaceMembers(workspaceId: string): Promise<MembersResult> {
  try {
    const id = z.string().regex(/^[\w-]{8,64}$/, 'Invalid workspace').parse(workspaceId);
    const { admin } = await requireAdmin({ product: SLUG, permission: 'read' });
    const members = membersOfWorkspace(await allUsers(), id);
    await writeAudit({ admin_id: admin.id, admin_email: admin.email, product_slug: SLUG, action: 'view.workspace_members', target_type: 'workspace', target_id: id, after: { count: members.length } });
    return { ok: true, members };
  } catch (e) {
    if (e instanceof TmsError) {
      // The key is good for the other routes, so a 401/404/405 here means the app has no users route (an older API).
      if ([401, 404, 405].includes(e.status)) return { ok: false, unsupported: true, error: 'This Donexel API does not list users yet.' };
      if (e.code === 'unreachable') return { ok: false, error: 'Could not reach Donexel.' };
    }
    return { ok: false, error: 'Could not load the people in this workspace.' };
  }
}
