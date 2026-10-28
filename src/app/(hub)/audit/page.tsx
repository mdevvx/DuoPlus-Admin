import type { Metadata } from 'next';
import { requirePage } from '@/lib/auth';
import { auditFilters, queryAudit } from '@/lib/audit-query';
import { flatParams, PAGE_SIZE } from '@/lib/validation';
import { AuditTable } from '@/components/audit-table';
import { PageHeader, Pagination } from '@/components/ui';
import { Filters } from '@/components/filters';
import { can } from '@/lib/roles';

export const metadata: Metadata = { title: 'Audit log' };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { role } = await requirePage({ permission: 'hub.audit' });
  const sp = flatParams(await searchParams);
  const f = auditFilters.parse(sp);
  const { rows, total } = await queryAudit(f);
  const { page: _page, ...keep } = f;
  const params = Object.fromEntries(Object.entries(keep).map(([k, v]) => [k, v === undefined ? undefined : String(v)]));
  const exportQs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader title="Audit log" description="Every action by every admin, append-only."
        updatedAt={new Date()}
        actions={can(role, 'export.csv') && <a className="btn" href={`/api/export/hub/audit${exportQs ? `?${exportQs}` : ''}`}>Export CSV</a>} />
      <Filters action="/audit" fields={[
        { type: 'text', key: 'action', label: 'Action', placeholder: 'Action prefix (server.)', hint: 'Separate several with commas.' },
        { type: 'text', key: 'admin', label: 'Admin', placeholder: 'Admin email contains', hint: 'Matches part of the admin email.' },
        { type: 'text', key: 'target', label: 'Target', placeholder: 'Target ID' },
        { type: 'daterange', key: 'date', label: 'Date', fromKey: 'from', toKey: 'to' },
      ]} />
      <AuditTable rows={rows} />
      <Pagination base="/audit" params={params} page={f.page} pageSize={PAGE_SIZE} total={total} />
    </>
  );
}
