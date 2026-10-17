import { NextResponse, type NextRequest } from 'next/server';
import { HubAuthError, requireAdmin } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { toCsv } from '@/lib/csv';
import { flatParams } from '@/lib/validation';
import { auditFilters, queryAudit } from '@/lib/audit-query';
import { MODULE_BY_SLUG } from '@/products/registry';

const NO_STORE = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

// CSV exports: owner/admin only, always audit-logged (filters + row count, never the data itself).
export async function GET(req: NextRequest, { params }: { params: Promise<{ product: string; kind: string }> }) {
  const { product, kind } = await params;
  const sp = flatParams(Object.fromEntries(req.nextUrl.searchParams));
  try {
    let rows: Record<string, unknown>[];
    let filename: string;
    if (product === 'hub') {
      if (kind !== 'audit') return new NextResponse('Not found', { status: 404 });
      await requireAdmin({ permission: 'hub.audit' });
      await requireAdmin({ permission: 'export.csv' });
      rows = (await queryAudit(auditFilters.parse(sp), { paged: false })).rows.map((r) => ({ ...r, ip: undefined }));
      filename = 'hub-audit';
    } else {
      const def = MODULE_BY_SLUG[product]?.exports?.[kind];
      if (!def) return new NextResponse('Not found', { status: 404 });
      await requireAdmin({ product, permission: 'export.csv' });
      await requireAdmin({ product, permission: def.permission });
      rows = await def.rows(sp);
      filename = def.filename;
    }
    const { admin } = await requireAdmin();
    const { page: _p, ...filters } = sp;
    await writeAudit({ admin_id: admin.id, admin_email: admin.email, product_slug: product === 'hub' ? null : product, action: 'export.csv', target_type: 'export', target_id: kind, after: { rows: rows.length, filters } });
    return new NextResponse(toCsv(rows), {
      headers: { ...NO_STORE, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}-${new Date().toISOString().slice(0, 10)}.csv"` },
    });
  } catch (e) {
    if (e instanceof HubAuthError) return new NextResponse('Forbidden', { status: e.code === 'unauthenticated' ? 401 : 403 });
    console.error('export failed', e instanceof Error ? e.message : 'unknown');
    return new NextResponse('Export failed', { status: 500 });
  }
}
