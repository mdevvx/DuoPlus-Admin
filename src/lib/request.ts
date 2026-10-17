import 'server-only';
import { headers } from 'next/headers';
import { createHash } from 'node:crypto';

export async function requestMeta(): Promise<{ ip: string; ua: string }> {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
  return { ip, ua: (h.get('user-agent') ?? '').slice(0, 300) };
}

export const sha256 = (v: string) => createHash('sha256').update(v.trim().toLowerCase()).digest('hex');
