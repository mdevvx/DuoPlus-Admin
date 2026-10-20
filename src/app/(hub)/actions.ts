'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { runAction, UserError, type ActionResult } from '@/lib/action';
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

const MAX_LOGO_BYTES = 150 * 1024;
const productName = z.string().trim().min(2, 'Use at least 2 characters').max(40, 'Use at most 40 characters');

/** Raster formats only, checked by file signature rather than the browser-supplied type. */
function imageMime(b: Uint8Array): string | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

/** Change a product's display name and/or logo. Fields: slug, name, logo (optional file), removeLogo ('1' to reset). */
export async function updateProductBranding(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const slug = z.string().regex(/^[a-z0-9-]+$/).parse(fd.get('slug'));
    const { admin } = await requireAdmin({ product: slug, permission: 'product.branding' });
    const name = productName.parse(fd.get('name'));
    const db = hubDb();
    const { data: before } = await db.from('hub_products').select('name,logo').eq('slug', slug).single();
    if (!before) throw new UserError('Product not found');

    const patch: { name: string; logo?: string | null } = { name };
    const file = fd.get('logo');
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_LOGO_BYTES) throw new UserError('Logo must be 150 KB or smaller');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = imageMime(bytes);
      if (!mime) throw new UserError('Logo must be a PNG, JPEG or WebP image');
      patch.logo = `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
    } else if (fd.get('removeLogo') === '1') patch.logo = null;

    if (patch.name === before.name && patch.logo === undefined) return 'Nothing changed';
    const { error } = await db.from('hub_products').update(patch).eq('slug', slug);
    if (error) throw new Error('branding update failed');
    await writeAudit({
      admin_id: admin.id, admin_email: admin.email, product_slug: slug, action: 'product.branding', target_type: 'product', target_id: slug,
      before: { name: before.name, logo: before.logo ? 'custom' : 'default' },
      after: { name: patch.name, logo: patch.logo === undefined ? (before.logo ? 'custom' : 'default') : patch.logo ? 'custom' : 'default' },
    });
    revalidatePath('/', 'layout');
    return 'Branding saved';
  });
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
