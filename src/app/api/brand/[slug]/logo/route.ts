import { NextResponse, type NextRequest } from 'next/server';
import { productLogo } from '@/products/disconotify/email/logo';
import { MODULE_BY_SLUG } from '@/products/registry';

// Public on purpose (the panel's own logo preview and any fallback use it). It serves only the product's logo image.
const HEADERS = { 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' };

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!MODULE_BY_SLUG[slug]) return new NextResponse('Not found', { status: 404 });
  const logo = await productLogo(slug);
  if (!logo) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(new Uint8Array(logo.bytes), { headers: { ...HEADERS, 'Content-Type': logo.type } });
}
