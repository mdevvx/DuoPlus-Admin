import { z } from 'zod';
import { Badge, Card, Cell, EmptyState, ErrorPanel, PageHeader, Pagination, Stat, Table, Tr, When } from '@/components/ui';
import { Filters } from '@/components/filters';
import { Notice } from '@/components/form';
import { RefreshButton } from '@/components/refresh-button';
import { int } from '@/lib/format';
import type { RouteCtx } from '@/products/types';
import { TmsError, describe, getOverview, listAllWorkspaces, listUsers, ownersOf, sumMembers, tmsConfigured } from '../api';
import { base } from './shared';

const PER = 25;
const params = z.object({
  page: z.coerce.number().int().min(1).max(100000).catch(1),
  q: z.string().trim().max(100).optional().catch(undefined),
});
const path = `${base}/users`;

interface Row { key: string; email: string; name: string | null; workspaces: string[]; createdAt: string; confirmed: boolean | null }

export async function UsersPage({ searchParams }: RouteCtx) {
  const p = params.parse(searchParams);
  if (!tmsConfigured()) return <><PageHeader title="Users" description="Everyone who has an account." /><Card><EmptyState title="Team Management System is not connected" hint="Add DUOPLUS_API_URL and DUOPLUS_ADMIN_KEY to the environment and redeploy." /></Card></>;

  let rows: Row[] = [];
  let total = 0;
  let fullList = false;
  let failure: string | null = null;
  let people = 0;
  let workspaces = 0;
  let registered = 0;
  try {
    const [overview, all] = await Promise.all([getOverview(), listAllWorkspaces()]);
    registered = overview.users.total;
    workspaces = all.length;
    people = sumMembers(all);
    try {
      // Preferred: the real list of every account.
      const u = await listUsers({ search: p.q, page: p.page, pageSize: PER });
      fullList = true;
      total = u.total;
      rows = u.items.map((x) => ({ key: x.id || x.email, email: x.email, name: x.fullName, workspaces: x.workspaces.map((w) => w.name), createdAt: x.createdAt, confirmed: x.confirmed }));
    } catch (e) {
      // The app has no users endpoint yet (the key works elsewhere, so 401/404/405 here means "no such route"): show the owners we can name.
      if (!(e instanceof TmsError) || ![401, 404, 405].includes(e.status)) throw e;
      const q = p.q?.toLowerCase();
      const owners = ownersOf(all).filter((o) => !q || o.email.toLowerCase().includes(q) || (o.fullName ?? '').toLowerCase().includes(q));
      total = owners.length;
      rows = owners.slice((p.page - 1) * PER, p.page * PER).map((o) => ({ key: o.key, email: o.email, name: o.fullName, workspaces: o.workspaces.map((w) => w.name), createdAt: '', confirmed: null }));
    }
  } catch (e) {
    failure = describe(e);
  }

  return (
    <>
      <PageHeader title="Users" description="Everyone who has an account, and the workspaces they belong to." updatedAt={new Date()} actions={<RefreshButton className="btn" />} />
      {failure ? <ErrorPanel message={failure} retryHref={path} /> : (
        <>
          <div className="mb-5 grid max-w-3xl grid-cols-3 gap-4">
            <Card><Stat label="Registered users" value={int(registered)} hint="All accounts" /></Card>
            <Card><Stat label="People in workspaces" value={int(people)} hint="Counted per workspace" /></Card>
            <Card><Stat label="Workspaces" value={int(workspaces)} /></Card>
          </div>
          {!fullList && (
            <div className="mb-4">
              <Notice tone="info">Showing the workspace owners only. To list every user, add <b>GET /api/v1/admin/users</b> to the Team Management System operator API; this page then shows everyone, including people who have no workspace. A person&apos;s workspaces are also listed under <b>Workspaces</b> (click the people count).</Notice>
            </div>
          )}
          <Filters action={path} fields={[{ type: 'search', key: 'q', label: 'Search', placeholder: 'Search by email or name' }]} />
          {rows.length === 0 ? <div className="card"><EmptyState title={p.q ? 'No users match' : 'No users yet'} hint={p.q ? 'Check the spelling or clear the search.' : undefined} /></div> : (
            <>
              <Table label="Users">
                <thead><tr>{['User', 'Workspaces', 'Joined', 'Email'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                <tbody>{rows.map((r) => (
                  <Tr key={r.key}>
                    <td className="td"><Cell text={r.email || '—'} sub={r.name ?? undefined} max={260} /></td>
                    <td className="td"><Cell text={r.workspaces.length ? r.workspaces.join(', ') : 'None'} sub={r.workspaces.length ? `${r.workspaces.length} workspace${r.workspaces.length === 1 ? '' : 's'}` : undefined} max={280} /></td>
                    <td className="td whitespace-nowrap">{r.createdAt ? <When value={r.createdAt} /> : <span className="text-muted">—</span>}</td>
                    <td className="td whitespace-nowrap">{r.confirmed === null ? <span className="text-muted">—</span> : r.confirmed ? <Badge tone="success">Confirmed</Badge> : <Badge tone="warning">Not confirmed</Badge>}</td>
                  </Tr>
                ))}</tbody>
              </Table>
              <Pagination base={path} params={{ q: p.q }} page={p.page} pageSize={PER} total={total} />
            </>
          )}
        </>
      )}
    </>
  );
}
