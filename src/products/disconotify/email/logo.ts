import 'server-only';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '@/lib/env';
import { hubDb } from '@/lib/supabase-server';
import { MODULE_BY_SLUG } from '@/products/registry';
import { SLUG } from '../db';

const BUCKET = 'email-assets';
const IMAGE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

export interface LogoImage { bytes: Buffer; type: string }

/** The product's logo image: the one uploaded under Settings → Branding, otherwise the default file shipped with the panel. */
export async function productLogo(slug: string = SLUG): Promise<LogoImage | null> {
  const { data } = await hubDb().from('hub_products').select('logo').eq('slug', slug).maybeSingle();
  const m = IMAGE.exec(String((data as { logo?: string | null } | null)?.logo ?? ''));
  if (m) return { bytes: Buffer.from(m[2]!, 'base64'), type: m[1]! };

  const file = MODULE_BY_SLUG[slug]?.manifest.logo;
  if (file && /^\/products\/[\w.-]+\.(png|jpg|jpeg|webp)$/.test(file)) {
    try {
      const type = file.endsWith('.png') ? 'image/png' : file.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
      return { bytes: await readFile(path.join(process.cwd(), 'public', file)), type };
    } catch { /* file missing on this host */ }
  }
  return null;
}

/**
 * A public https address for the logo that any email app can load. The image is stored in the project's public
 * Supabase storage bucket, so it works whether the panel runs locally or is deployed, and needs no login.
 * EMAIL_LOGO_URL overrides this with an address of your choice.
 */
export async function emailLogoUrl(): Promise<{ url: string } | { url: null; reason: string }> {
  const e = env();
  if (e.EMAIL_LOGO_URL) return { url: e.EMAIL_LOGO_URL };

  const logo = await productLogo();
  if (!logo) return { url: null, reason: 'The product has no logo image. Upload one under Settings → Branding first.' };

  const base = e.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '');
  const auth = { apikey: e.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}` };
  const name = `logos/${SLUG}-${createHash('sha1').update(logo.bytes).digest('hex').slice(0, 10)}.${EXT[logo.type] ?? 'png'}`;
  try {
    // Create the public bucket on first use; an existing one answers with an error that we ignore.
    await fetch(`${base}/storage/v1/bucket`, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: 1_000_000, allowed_mime_types: Object.keys(EXT) }),
    });
    const up = await fetch(`${base}/storage/v1/object/${BUCKET}/${name}`, {
      method: 'POST', headers: { ...auth, 'Content-Type': logo.type, 'x-upsert': 'true' }, body: new Uint8Array(logo.bytes), signal: AbortSignal.timeout(15_000),
    });
    if (!up.ok) return { url: null, reason: 'Could not store the logo image. Check that Supabase storage is enabled for this project.' };
  } catch {
    return { url: null, reason: 'Could not reach Supabase storage to store the logo image. Try again.' };
  }
  // The file name carries a hash of the image, so a new logo gets a new address and mail apps never show a stale one.
  return { url: `${base}/storage/v1/object/public/${BUCKET}/${name}` };
}
