import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { HubAuthError, requireAdmin } from '@/lib/auth';
import { accessibleProducts } from '@/products/registry';
import { can } from '@/lib/roles';

const body = z.object({ q: z.string().trim().min(2).max(100) });

// POST (not GET) so search terms - which may be emails or IDs - never land in URLs or access logs.
export async function POST(req: NextRequest) {
  try {
    const { admin } = await requireAdmin();
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ hits: [] });
    const products = await accessibleProducts(admin);
    const results = await Promise.all(products.filter((p) => can(p.role, 'read')).map((p) => p.module.search?.(parsed.data.q).catch(() => []) ?? []));
    return NextResponse.json({ hits: results.flat().slice(0, 20) });
  } catch (e) {
    if (e instanceof HubAuthError) return NextResponse.json({ hits: [] }, { status: e.code === 'unauthenticated' ? 401 : 403 });
    return NextResponse.json({ hits: [] }, { status: 500 });
  }
}
