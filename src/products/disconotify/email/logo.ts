import 'server-only';
import { createHash } from 'node:crypto';
import { env } from '@/lib/env';
import { hubDb } from '@/lib/supabase-server';
import { SLUG } from '../db';

/**
 * Where an email client can load the logo from. Mail apps have no login and need an https address that is reachable
 * from the internet, so a panel running on localhost cannot serve it. EMAIL_LOGO_URL overrides everything (use it
 * to point at an image on the public website); otherwise the panel's own logo route is used.
 */
export async function emailLogoUrl(): Promise<{ url: string } | { url: null; reason: string }> {
  const e = env();
  if (e.EMAIL_LOGO_URL) return { url: e.EMAIL_LOGO_URL };

  const hub = new URL(e.HUB_URL);
  if (hub.protocol !== 'https:' || /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(hub.hostname)) {
    return { url: null, reason: 'The panel is running on a local or non-https address, so email apps could not load the logo. Save the layout from the deployed panel, or set EMAIL_LOGO_URL to a public https image address.' };
  }
  const { data } = await hubDb().from('hub_products').select('logo').eq('slug', SLUG).maybeSingle();
  const custom = String((data as { logo?: string | null } | null)?.logo ?? '');
  const v = custom ? createHash('sha1').update(custom).digest('hex').slice(0, 8) : 'default';
  return { url: `${hub.origin}/api/brand/${SLUG}/logo?v=${v}` };
}
