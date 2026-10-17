'use server';

import { z } from 'zod';
import { ensureStepUp, requireAdmin } from '@/lib/auth';
import { runAction, callRpc, UserError, type ActionResult } from '@/lib/action';
import { hubDb, serviceClient } from '@/lib/supabase-server';
import { requestMeta } from '@/lib/request';
import { email, reason, uuid } from '@/lib/validation';
import { MODULE_BY_SLUG } from '@/products/registry';

const base = z.object({
  role: z.enum(['owner', 'admin']),
  name: z.string().trim().max(80).optional(),
  active: z.enum(['true', 'false']).default('true'),
  reason,
  code: z.string().optional(),
});

/** prod_<slug> fields -> [{slug, role}]; unknown products are rejected. */
function readProducts(fd: FormData) {
  const out: { slug: string; role: string }[] = [];
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith('prod_') || v === 'none') continue;
    const slug = k.slice(5);
    if (!MODULE_BY_SLUG[slug]) throw new UserError('Unknown product.');
    const role = z.literal('admin').parse(v);
    out.push({ slug, role });
  }
  return out;
}

async function authorize(fd: FormData) {
  const { admin } = await requireAdmin({ permission: 'hub.admins' });
  await ensureStepUp(admin, 'hub.admins', String(fd.get('code') ?? '') || undefined);
  return admin;
}

async function save(fd: FormData, admin: Awaited<ReturnType<typeof authorize>>, id: string, mail: string): Promise<string> {
  const d = base.parse(Object.fromEntries(fd));
  if (id === admin.id && (d.role !== admin.role || d.active === 'false')) throw new UserError('You cannot change your own role or deactivate yourself.');
  const { ip, ua } = await requestMeta();
  await callRpc(hubDb(), 'admin_save', {
    p_id: id, p_email: mail, p_name: d.name || null, p_role: d.role, p_active: d.active === 'true',
    p_products: readProducts(fd), p_actor: admin.id, p_actor_email: admin.email, p_ip: ip, p_ua: ua, p_reason: d.reason,
  });
  return 'Saved';
}

export async function inviteAdmin(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const mail = email.parse(fd.get('email'));
    const password = z.string().min(12, 'Password must be at least 12 characters').max(128).parse(fd.get('password'));
    const admin = await authorize(fd);
    // The Supabase auth user is created confirmed with the initial password the owner chose.
    const created = await serviceClient('public').auth.admin.createUser({ email: mail, password, email_confirm: true });
    if (created.error || !created.data.user) throw new UserError('Could not create that user. They may already have an account.');
    try {
      return await save(fd, admin, created.data.user.id, mail);
    } catch (e) {
      await serviceClient('public').auth.admin.deleteUser(created.data.user.id); // roll back the auth user
      throw e;
    }
  });
}

export async function updateAdmin(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await authorize(fd);
    const id = uuid.parse(fd.get('id'));
    const { data } = await hubDb().from('hub_admins').select('email').eq('id', id).maybeSingle();
    if (!data) throw new UserError('Admin not found.');
    return save(fd, admin, id, data.email);
  });
}
