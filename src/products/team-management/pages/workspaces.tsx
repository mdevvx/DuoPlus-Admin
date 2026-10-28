import { z } from 'zod';
import { Badge, Cell, EmptyState, ErrorPanel, PageHeader, Pagination, Table, Tr, When } from '@/components/ui';
import { Filters } from '@/components/filters';
import { WorkspaceMark } from '@/components/workspace-mark';
import { RefreshButton } from '@/components/refresh-button';
import { int } from '@/lib/format';
import type { RouteCtx } from '@/products/types';
import { describe, listWorkspaces, tmsConfigured } from '../api';
import { PlanText, StatusBadge, base } from './shared';

const PER = 25;
const params = z.object({
  page: z.coerce.number().int().min(1).max(100000).catch(1),
  q: z.string().trim().max(100).optional().catch(undefined),
});

export async function WorkspacesPage({ searchParams }: RouteCtx) {
  const p = params.parse(searchParams);
  const path = `${base}/workspaces`;

  let data: Awaited<ReturnType<typeof listWorkspaces>> | null = null;
  let failure: string | null = null;
  if (!tmsConfigured()) failure = 'Team Management System is not connected. Add DUOPLUS_API_URL and DUOPLUS_ADMIN_KEY to the environment and redeploy.';
  else {
    try { data = await listWorkspaces({ search: p.q, page: p.page, pageSize: PER }); } catch (e) { failure = describe(e); }
  }

  return (
    <>
      <PageHeader title="Workspaces" description="Every workspace across all accounts, with its owner, plan and seat usage." updatedAt={new Date()} actions={<RefreshButton className="btn" />} />
      <Filters action={path} fields={[{ type: 'search', key: 'q', label: 'Search', placeholder: 'Search by workspace name' }]} />
      {failure || !data ? <ErrorPanel message={failure ?? 'Could not load workspaces.'} retryHref={path} />
        : data.items.length === 0 ? <div className="card"><EmptyState title={p.q ? 'No workspaces match' : 'No workspaces yet'} hint={p.q ? 'Check the spelling or clear the search.' : 'Workspaces appear when someone signs up.'} /></div>
        : (
          <>
            <Table label="Workspaces">
              <thead><tr>{['Workspace', 'Owner', 'Plan', 'Status', 'Members', 'Created'].map((h, i) => <th key={h} className={i === 4 ? 'th text-right' : 'th'}>{h}</th>)}</tr></thead>
              <tbody>{data.items.map((w) => (
                <Tr key={w.id}>
                  <td className="td">
                    <div className="flex min-w-0 items-center gap-3">
                      <WorkspaceMark name={w.name} logoUrl={w.logoUrl} />
                      <Cell text={w.name} sub={w.onboardingCompleted ? undefined : 'Setting up'} max={220} />
                    </div>
                  </td>
                  <td className="td"><Cell text={w.owner?.email || '—'} sub={w.owner?.fullName ?? undefined} max={230} /></td>
                  <td className="td whitespace-nowrap"><PlanText plan={w.plan} /></td>
                  <td className="td whitespace-nowrap">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={w.status} />
                      {w.whitelisted && <Badge tone="info">Whitelisted</Badge>}
                    </div>
                  </td>
                  <td className="td num whitespace-nowrap text-right">{int(w.members)}{w.seatLimit > 0 && <span className="text-muted"> / {int(w.seatLimit)}</span>}</td>
                  <td className="td whitespace-nowrap"><When value={w.createdAt || null} /></td>
                </Tr>
              ))}</tbody>
            </Table>
            <Pagination base={path} params={{ q: p.q }} page={data.page || p.page} pageSize={data.pageSize || PER} total={data.total} />
          </>
        )}
    </>
  );
}
