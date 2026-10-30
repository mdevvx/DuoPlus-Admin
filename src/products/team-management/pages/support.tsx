import { z } from 'zod';
import { Badge, Cell, EmptyState, PageHeader, Pagination, Table, Tr, When } from '@/components/ui';
import { Filters } from '@/components/filters';
import { SupportTicketButton } from '@/components/donexel-support';
import { can } from '@/lib/roles';
import type { RouteCtx } from '@/products/types';
import { PLAN_LABEL } from '../api';
import { listSupportTickets } from '../support-api';
import { SUPPORT_STATUSES, SUPPORT_STATUS_LABEL } from '../support-meta';
import { base, load } from './shared';

const PER = 25;
const params = z.object({
  page: z.coerce.number().int().min(1).max(100000).catch(1),
  status: z.enum(SUPPORT_STATUSES).catch('open'),
  priority: z.enum(['true', 'false']).optional().catch(undefined),
});
const STATUS_TONE = { open: 'warning', answered: 'success', closed: 'neutral' } as const;

export async function SupportPage({ searchParams, role }: RouteCtx) {
  const p = params.parse(searchParams);
  const path = `${base}/support`;
  const r = await load(() => listSupportTickets({ status: p.status, priority: p.priority === undefined ? undefined : p.priority === 'true', page: p.page, pageSize: PER }), path);
  const edit = can(role, 'tms.support');
  return (
    <>
      <PageHeader title="Support" description="Requests from workspaces. Scale workspaces are priority, with a 4-hour answer target; everyone else has 48 hours." updatedAt={new Date()} />
      <Filters action={path} fields={[
        { type: 'select', key: 'status', label: 'Status', options: SUPPORT_STATUSES.map((s): [string, string] => [s, SUPPORT_STATUS_LABEL[s]]) },
        { type: 'select', key: 'priority', label: 'Priority', options: [['', 'All'], ['true', 'Priority only'], ['false', 'Standard only']] },
      ]} />
      {!r.ok ? r.panel : r.data.tickets.length === 0 ? <div className="card"><EmptyState title="No requests here" hint={p.status === 'open' ? 'Nothing is waiting for an answer.' : 'Change the filters to see other requests.'} /></div> : (
        <>
          <Table label="Support requests">
            <thead><tr>{['Request', 'Workspace', 'Status', 'Answer due', ''].map((h, i) => <th key={i} className="th">{h}</th>)}</tr></thead>
            <tbody>{r.data.tickets.map((t) => (
              <Tr key={t.id}>
                <td className="td"><Cell text={t.subject} sub={t.requester ? (t.requester.fullName || t.requester.email) : undefined} max={300} /></td>
                <td className="td"><Cell text={t.workspace?.name || '—'} sub={t.plan ? PLAN_LABEL[t.plan] ?? t.plan : undefined} max={200} /></td>
                <td className="td whitespace-nowrap">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {t.priority && <Badge tone="info">Priority</Badge>}
                    {t.overdue && t.status === 'open' && <Badge tone="danger">Overdue</Badge>}
                    <Badge tone={STATUS_TONE[t.status]}>{SUPPORT_STATUS_LABEL[t.status]}</Badge>
                  </div>
                </td>
                <td className="td whitespace-nowrap">{t.status === 'open' ? <When value={t.dueAt} /> : <span className="text-muted">—</span>}</td>
                <td className="td whitespace-nowrap text-right"><SupportTicketButton ticket={t} canEdit={edit} /></td>
              </Tr>
            ))}</tbody>
          </Table>
          <Pagination base={path} params={{ status: p.status, priority: p.priority }} page={r.data.page || p.page} pageSize={r.data.pageSize || PER} total={r.data.total} />
        </>
      )}
    </>
  );
}
