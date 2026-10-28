import { PageHeader, Pagination } from '@/components/ui';
import { AuditTable } from '@/components/audit-table';
import { Filters } from '@/components/filters';
import { auditFilters, queryAudit } from '@/lib/audit-query';
import { PAGE_SIZE } from '@/lib/validation';
import type { RouteCtx } from '@/products/types';
import { SLUG } from '../api';
import { base } from './shared';

export async function AuditPage({ searchParams }: RouteCtx) {
  const f = auditFilters.parse(searchParams);
  const { rows, total } = await queryAudit(f, { product: SLUG });
  const params = { action: f.action, admin: f.admin, target: f.target, from: f.from, to: f.to };
  return (
    <>
      <PageHeader title="Audit" description="Admin actions on this product, such as whitelist changes." updatedAt={new Date()} />
      <Filters action={`${base}/audit`} fields={[
        { type: 'text', key: 'action', label: 'Action', placeholder: 'Action prefix, e.g. whitelist.', hint: 'Separate several with commas.' },
        { type: 'text', key: 'admin', label: 'Admin', placeholder: 'Admin email contains', hint: 'Matches part of the admin email.' },
        { type: 'text', key: 'target', label: 'Email', placeholder: 'Whitelisted email' },
        { type: 'daterange', key: 'date', label: 'Date', fromKey: 'from', toKey: 'to' },
      ]} />
      <AuditTable rows={rows} showProduct={false} />
      <Pagination base={`${base}/audit`} params={params} page={f.page} pageSize={PAGE_SIZE} total={total} />
    </>
  );
}
