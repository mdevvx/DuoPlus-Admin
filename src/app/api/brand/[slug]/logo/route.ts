import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { hubDb } from '@/lib/supabase-server';
import { MODULE_BY_SLUG } from '@/products/registry';

// Public on purpose: email clients load the logo from here, and they have no session. It serves only the product's
// own logo image (its uploaded branding, or the default file), never anything else.
const IMAGE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;
const HEADERS = { 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' };

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const mod = MODULE_BY_SLUG[slug];
  if (!mod) return new NextResponse('Not found', { status: 404 });

  const { data } = await hubDb().from('hub_products').select('logo').eq('slug', slug).maybeSingle();
  const m = IMAGE.exec(String((data as { logo?: string | null } | null)?.logo ?? ''));
  if (m) return new NextResponse(Buffer.from(m[2]!, 'base64'), { headers: { ...HEADERS, 'Content-Type': m[1]! } });

  const file = mod.manifest.logo;
  if (file && /^\/products\/[\w.-]+\.(png|jpg|jpeg|webp)$/.test(file)) {
    try {
      const bytes = await readFile(path.join(process.cwd(), 'public', file));
      const type = file.endsWith('.png') ? 'image/png' : file.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
      return new NextResponse(bytes, { headers: { ...HEADERS, 'Content-Type': type } });
    } catch {
      return NextResponse.redirect(new URL(file, process.env.HUB_URL ?? 'http://localhost:3000'));
    }
  }
  return new NextResponse('Not found', { status: 404 });
}
