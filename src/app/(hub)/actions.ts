'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { runAction, type ActionResult } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { hubDb } from '@/lib/supabase-server';
import { COOKIE } from '@/lib/session-policy';

export async function setTheme(theme: string): Promise<void> {
  const t = z.enum(['system', 'light', 'dark']).parse(theme);
  const { admin } = await requireAdmin();
  await hubDb().from('hub_admins').update({ theme: t }).eq('id', admin.id);
  const jar = await cookies();
  jar.set(COOKIE.theme, t, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365, secure: process.env.NODE_ENV === 'production' });
}

const nickname = z.string().trim().min(2, 'Use at least 2 characters').max(30, 'Use at most 30 characters')
  .regex(/^[\p{L}\p{N} ._'-]+$/u, 'Use letters, numbers, spaces and . _ - only');

/** Every admin can set their own display nickname; it replaces the placeholder name everywhere. */
export async function updateNickname(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { admin } = await requireAdmin();
    const value = nickname.parse(fd.get('nickname'));
    if (value === admin.displayName) return 'Nickname unchanged';
    await hubDb().from('hub_admins').update({ display_name: value }).eq('id', admin.id);
    await writeAudit({ admin_id: admin.id, admin_email: admin.email, action: 'admin.nickname', target_type: 'admin', target_id: admin.id, before: { nickname: admin.displayName }, after: { nickname: value } });
    revalidatePath('/', 'layout');
    return 'Nickname saved';
  });
}
