import 'server-only';
import { z } from 'zod';
import { hubDb, must } from './supabase-server';
import { PAGE_SIZE, likeTerm } from './validation';

export const auditFilters = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  action: z.string().max(60).optional().catch(undefined),
  admin: z.string().max(100).optional().catch(undefined),
  target: z.string().max(40).optional().catch(undefined),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
});
export type AuditFilters = z.infer<typeof auditFilters>;

export interface AuditRow {
  id: number; at: string; admin_email: string | null; product_slug: string | null; action: string;
  target_type: string | null; target_id: string | null; before: unknown; after: unknown; reason: string | null;
  ip: string | null;
}
const LEGACY_SLUGS: Record<string, string[]> = { disconotify: ['pulsenotify'] };
const COLS = 'id,at,admin_email,product_slug,action,target_type,target_id,before,after,reason,ip';

export async function queryAudit(f: AuditFilters, opts: { product?: string; limit?: number; paged?: boolean } = {}) {
  let q = hubDb().from('hub_audit_log').select(COLS, { count: opts.paged === false ? undefined : 'exact' }).order('at', { ascending: false });
  // Rows written before a product was renamed keep their old slug (the log is append-only).
  if (opts.product) q = q.in('product_slug', [opts.product, ...(LEGACY_SLUGS[opts.product] ?? [])]);
  if (f.action) q = q.ilike('action', `${likeTerm(f.action)}%`);
  if (f.admin) q = q.ilike('admin_email', `%${likeTerm(f.admin)}%`);
  if (f.target) q = q.eq('target_id', f.target);
  if (f.from) q = q.gte('at', `${f.from}T00:00:00Z`);
  if (f.to) q = q.lte('at', `${f.to}T23:59:59Z`);
  if (opts.paged === false) q = q.limit(opts.limit ?? 10000);
  else q = q.range((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE - 1);
  const res = await q;
  const rows = must(res, 'audit query') as unknown as AuditRow[];
  return { rows, total: res.count ?? rows.length };
}
