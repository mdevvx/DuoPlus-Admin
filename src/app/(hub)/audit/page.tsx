import type { Metadata } from 'next';
import { requirePage } from '@/lib/auth';
import { auditFilters, queryAudit } from '@/lib/audit-query';
import { flatParams, PAGE_SIZE } from '@/lib/validation';
import { AuditTable } from '@/components/audit-table';
import { FilterBar, PageHeader, Pagination, TagInput } from '@/components/ui';
import { can } from '@/lib/roles';
import { DateField } from '@/components/date-field';

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
      <FilterBar action="/audit">
        <TagInput name="action" placeholder="Action prefix (server.)" value={f.action} className="w-56" />
        <TagInput name="admin" placeholder="Admin email contains" value={f.admin} className="w-60" />
        <TagInput name="target" placeholder="Target ID" value={f.target} className="w-48" />
        <DateField name="from" defaultValue={f.from} placeholder="From date" />
        <DateField name="to" defaultValue={f.to} placeholder="To date" />
      </FilterBar>
      <AuditTable rows={rows} />
      <Pagination base="/audit" params={params} page={f.page} pageSize={PAGE_SIZE} total={total} />
    </>
  );
}
