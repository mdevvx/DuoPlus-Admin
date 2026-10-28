import Link from 'next/link';
import { z } from 'zod';
import { Badge, Card, Cell, EmptyState, ErrorPanel, PageHeader, Pagination, Stat, Table, Tr, When } from '@/components/ui';
import { Filters } from '@/components/filters';
import { Notice } from '@/components/form';
import { RefreshButton } from '@/components/refresh-button';
import { WorkspaceMark } from '@/components/workspace-mark';
import { int } from '@/lib/format';
import type { RouteCtx } from '@/products/types';
import { TmsError, describe, getOverview, listAllWorkspaces, listUsers, ownersOf, sumMembers, tmsConfigured } from '../api';
import { humanize } from '../labels';
import { base } from './shared';

const PER = 25;
const params = z.object({
  page: z.coerce.number().int().min(1).max(100000).catch(1),
  q: z.string().trim().max(100).optional().catch(undefined),
});
const path = `${base}/users`;

interface Row {
  key: string; id: string; email: string; name: string | null; avatarUrl: string | null; createdAt: string; whitelisted: boolean;
  confirmed: boolean | null; twoFactor: boolean | null; lastSignInAt: string | null; workspaces: { id: string; name: string; role: string }[];
}

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
      const u = await listUsers({ search: p.q, page: p.page, pageSize: PER });
      fullList = true;
      total = u.total;
      rows = u.items.map((x) => ({ key: x.id || x.email, id: x.id, email: x.email, name: x.fullName, avatarUrl: x.avatarUrl, createdAt: x.createdAt, whitelisted: x.whitelisted, confirmed: x.emailConfirmed, twoFactor: x.twoFactorEnabled, lastSignInAt: x.lastSignInAt, workspaces: x.workspaces }));
    } catch (e) {
      // An older API without the users route (the key works elsewhere, so 401/404/405 means "no such route"): show the owners we can name.
      if (!(e instanceof TmsError) || ![401, 404, 405].includes(e.status)) throw e;
      const q = p.q?.toLowerCase();
      const owners = ownersOf(all).filter((o) => !q || o.email.toLowerCase().includes(q) || (o.fullName ?? '').toLowerCase().includes(q));
      total = owners.length;
      rows = owners.slice((p.page - 1) * PER, p.page * PER).map((o) => ({ key: o.key, id: '', email: o.email, name: o.fullName, avatarUrl: null, createdAt: '', whitelisted: false, confirmed: null, twoFactor: null, lastSignInAt: null, workspaces: o.workspaces.map((w) => ({ id: '', name: w.name, role: 'admin' })) }));
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
          {!fullList && <div className="mb-4"><Notice tone="info">This API does not list users yet, so only workspace owners are shown. Add <b>GET /api/v1/admin/users</b> to list everyone.</Notice></div>}
          <Filters action={path} fields={[{ type: 'search', key: 'q', label: 'Search', placeholder: 'Search by email or name' }]} />
          {rows.length === 0 ? <div className="card"><EmptyState title={p.q ? 'No users match' : 'No users yet'} hint={p.q ? 'Check the spelling or clear the search.' : undefined} /></div> : (
            <>
              <Table label="Users">
                <thead><tr>{['User', 'Workspaces', 'Account', 'Last sign-in'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                <tbody>{rows.map((r) => (
                  <Tr key={r.key}>
                    <td className="td">
                      <div className="flex min-w-0 items-center gap-3">
                        <WorkspaceMark name={r.name || r.email} logoUrl={r.avatarUrl} size={32} round />
                        <div className="min-w-0">
                          <Cell text={r.name || r.email || '—'} sub={r.name ? r.email : undefined} max={230} />
                          {r.whitelisted && <div className="mt-1"><Badge tone="info">Whitelisted</Badge></div>}
                        </div>
                      </div>
                    </td>
                    <td className="td">
                      {r.workspaces.length === 0 ? <Badge tone="neutral">No workspace</Badge> : (
                        <ul className="space-y-0.5">
                          {r.workspaces.slice(0, 3).map((w, i) => (
                            <li key={`${w.id}-${i}`} className="flex max-w-[300px] items-baseline gap-1.5">
                              {w.id ? <Link className="truncate text-accent hover:underline" href={`${base}/workspaces/${encodeURIComponent(w.id)}`}>{w.name}</Link> : <span className="truncate">{w.name}</span>}
                              {w.role && <span className="shrink-0 text-xs text-muted">{humanize(w.role)}</span>}
                            </li>
                          ))}
                          {r.workspaces.length > 3 && (r.id
                            ? <li><Link className="text-xs text-accent hover:underline" href={`${base}/workspaces?user=${encodeURIComponent(r.id)}`}>+{r.workspaces.length - 3} more</Link></li>
                            : <li className="text-xs text-muted">+{r.workspaces.length - 3} more</li>)}
                        </ul>
                      )}
                    </td>
                    <td className="td whitespace-nowrap">
                      {r.confirmed === null && r.twoFactor === null ? <span className="text-muted">—</span> : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {r.confirmed !== null && (r.confirmed ? <Badge tone="success">Confirmed</Badge> : <Badge tone="warning">Not confirmed</Badge>)}
                          {r.twoFactor !== null && (r.twoFactor ? <Badge tone="info">2FA on</Badge> : <Badge tone="neutral">2FA off</Badge>)}
                        </div>
                      )}
                      {r.createdAt && <div className="mt-1 text-xs text-muted">Signed up <When value={r.createdAt} /></div>}
                    </td>
                    <td className="td whitespace-nowrap">{r.lastSignInAt ? <When value={r.lastSignInAt} /> : <span className="text-muted">{fullList ? 'Never' : '—'}</span>}</td>
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
