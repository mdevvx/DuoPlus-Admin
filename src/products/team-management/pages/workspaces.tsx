import { z } from 'zod';
import { Badge, Cell, EmptyState, ErrorPanel, PageHeader, Pagination, Table, Tr, When } from '@/components/ui';
import { Filters } from '@/components/filters';
import { WorkspaceMark } from '@/components/workspace-mark';
import { WorkspacePeople } from '@/components/workspace-people';
import { RefreshButton } from '@/components/refresh-button';
import { int } from '@/lib/format';
import type { RouteCtx } from '@/products/types';
import { Card, Stat } from '@/components/ui';
import { describe, getOverview, listWorkspaces, tmsConfigured } from '../api';
import { allUsers, peopleInWorkspaces } from '../people';
import { Notice } from '@/components/form';
import Link from 'next/link';
import { PlanText, StatusBadge, base } from './shared';

const PER = 25;
const params = z.object({
  page: z.coerce.number().int().min(1).max(100000).catch(1),
  q: z.string().trim().max(100).optional().catch(undefined),
  user: z.string().regex(/^[\w-]{8,64}$/).optional().catch(undefined), // only this person's workspaces (from the Users page)
});

export async function WorkspacesPage({ searchParams }: RouteCtx) {
  const p = params.parse(searchParams);
  const path = `${base}/workspaces`;

  let data: Awaited<ReturnType<typeof listWorkspaces>> | null = null;
  let failure: string | null = null;
  if (!tmsConfigured()) failure = 'Donexel is not connected. Add DONEXEL_API_URL and DONEXEL_ADMIN_KEY to the environment and redeploy.';
  else {
    try { data = await listWorkspaces({ search: p.q, userId: p.user, page: p.page, pageSize: PER }); } catch (e) { failure = describe(e); }
  }

  const who = p.user ? await allUsers().then((u) => u.find((x) => x.id === p.user)).catch(() => undefined) : undefined;
  // All-workspace totals (not narrowed by the search below), so the three numbers always add up.
  const totals = failure || !data ? null : await Promise.all([getOverview(), peopleInWorkspaces()]).then(([o, ppl]) => ({ workspaces: o.workspaces.total, people: ppl.people, users: o.users.total })).catch(() => null);

  return (
    <>
      <PageHeader title="Workspaces" description="Every workspace across all accounts, with its owner, plan and seat usage." updatedAt={new Date()} actions={<RefreshButton className="btn" />} />
      {totals && (
        <div className="mb-5 grid max-w-3xl grid-cols-3 gap-4">
          <Card><Stat label="Workspaces" value={int(totals.workspaces)} hint="All of them" /></Card>
          <Card><Stat label="People in workspaces" value={int(totals.people)} hint="Counted per workspace" /></Card>
          <Card><Stat label="Registered users" value={int(totals.users)} hint="All accounts" /></Card>
        </div>
      )}
      {p.user && <div className="mb-4"><Notice tone="info">Showing only the workspaces of <b>{who?.email ?? 'one person'}</b>. <Link className="font-medium underline" href={path}>Show all workspaces</Link></Notice></div>}
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
                      <Cell text={w.name} sub={w.onboardingCompleted ? undefined : 'Setting up'} max={220} href={`${base}/workspaces/${encodeURIComponent(w.id)}`} />
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
                  <td className="td whitespace-nowrap text-right"><WorkspacePeople id={w.id} name={w.name} members={w.members} seatLimit={w.seatLimit} /></td>
                  <td className="td whitespace-nowrap"><When value={w.createdAt || null} /></td>
                </Tr>
              ))}</tbody>
            </Table>
            <Pagination base={path} params={{ q: p.q, user: p.user }} page={data.page || p.page} pageSize={data.pageSize || PER} total={data.total} />
          </>
        )}
    </>
  );
}
