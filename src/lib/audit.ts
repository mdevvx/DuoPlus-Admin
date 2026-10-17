import 'server-only';
import { hubDb, must } from './supabase-server';
import { requestMeta } from './request';

export interface AuditEntry {
  admin_id?: string | null;
  admin_email?: string | null;
  product_slug?: string | null;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

/**
 * Append a standalone audit row (sign-ins, views, exports). Data mutations do NOT use this:
 * they go through the hub.* SQL functions so the change and its audit row share one transaction.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  const { ip, ua } = await requestMeta();
  must(await hubDb().from('hub_audit_log').insert({ ...entry, ip, user_agent: ua }), 'audit write');
}

/** Same, but never lets an audit failure break a sign-in flow's neutral response. */
export async function writeAuditQuiet(entry: AuditEntry): Promise<void> {
  try {
    await writeAudit(entry);
  } catch (e) {
    console.error('audit write failed', (e as Error).message);
  }
}
