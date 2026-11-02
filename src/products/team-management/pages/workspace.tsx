import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Badge, Card, Cell, EmptyState, ErrorPanel, KV, PageHeader, Stat, Table, Tr, When } from '@/components/ui';
import { ProgressBar } from '@/components/charts';
import { Notice } from '@/components/form';
import { CopyId } from '@/components/small-client';
import { BrandSwatch, WorkspaceMark } from '@/components/workspace-mark';
import { int } from '@/lib/format';
import type { RouteCtx } from '@/products/types';
import { describe, tmsConfigured, type Member } from '../api';
import { loadWorkspaceMembers } from '../actions';
import { allWorkspaces } from '../people';
import { humanize, termLabel } from '../labels';
import { PlanText, StatusBadge, base } from './shared';

const ROLE_ORDER = ['admin', 'manager', 'member', 'guest'];
const roleTone = (r: string) => (r === 'admin' ? 'info' : 'neutral') as 'info' | 'neutral';

export async function WorkspaceDetailPage({ params }: RouteCtx) {
  const id = params.id ?? '';
  const back = <Link className="btn" href={`${base}/workspaces`}><ArrowLeft className="h-4 w-4" aria-hidden /> All workspaces</Link>;
  if (!tmsConfigured()) return <><PageHeader title="Workspace" actions={back} /><Card><EmptyState title="Donexel is not connected" hint="Add DONEXEL_API_URL and DONEXEL_ADMIN_KEY to the environment and redeploy." /></Card></>;

  let ws;
  try { ws = (await allWorkspaces()).find((w) => w.id === id); } catch (e) { return <><PageHeader title="Workspace" actions={back} /><ErrorPanel message={describe(e)} retryHref={`${base}/workspaces/${id}`} /></>; }
  if (!ws) return <><PageHeader title="Workspace" actions={back} /><div className="card"><EmptyState title="Workspace not found" hint="It may have been deleted, or the link is old." /></div></>;

  // The people list needs an endpoint the DuoPlus API may not have yet; the page still works without it.
  const m = await loadWorkspaceMembers(id);
  const members: Member[] = m.ok ? [...m.members].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.email.localeCompare(b.email)) : [];
  const byRole = ROLE_ORDER.map((r) => [r, members.filter((x) => x.role === r).length] as const).filter(([, n]) => n > 0);
    const pct = ws.seatLimit > 0 ? Math.min(100, Math.round((ws.members / ws.seatLimit) * 100)) : 0;

  return (
    <>
      <PageHeader icon={<WorkspaceMark name={ws.name} logoUrl={ws.logoUrl} size={52} />} title={ws.name} description={`Workspace detail · ${ws.id}`} updatedAt={new Date()}
        actions={back} />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <StatusBadge status={ws.status} />
        {ws.whitelisted && <Badge tone="info">Whitelisted</Badge>}
        {!ws.onboardingCompleted && <Badge tone="warning">Still setting up</Badge>}
        {ws.ownEmail && <Badge tone={ws.ownEmail.verified ? 'neutral' : 'warning'}>{ws.ownEmail.verified ? `Own email: ${ws.ownEmail.fromEmail}` : `Own email not verified: ${ws.ownEmail.fromEmail}`}</Badge>}
        <BrandSwatch color={ws.brandColor} />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Card><Stat label="Plan" value={<span className="text-[22px]"><PlanText plan={ws.plan} /></span>} hint={ws.whitelisted ? 'Set from the whitelist' : termLabel(ws.billingTerm) ?? undefined} /></Card>
        <Card>
          <Stat label="People" value={<>{int(ws.members)}{ws.seatLimit > 0 && <span className="text-base font-medium text-muted"> / {int(ws.seatLimit)}</span>}</>} hint="Seats in use" />
          {ws.seatLimit > 0 && <div className="mt-3"><ProgressBar value={pct} color={pct >= 90 ? 'var(--chart-4)' : 'var(--chart-1)'} /></div>}
        </Card>
        <Card><Stat label="Created" value={<span className="text-[22px]">{ws.createdAt ? new Date(ws.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span>} /></Card>
        <Card><Stat label="Owner" value={<span className="block max-w-full truncate text-[22px]">{ws.owner?.fullName || ws.owner?.email || '—'}</span>} hint={ws.owner?.fullName ? ws.owner.email : undefined} /></Card>
      </div>

      <div className="grid gap-5">
        <Card title={`People${members.length ? ` (${members.length})` : ''}`}>
          {!m.ok ? (
            <>
              <Notice tone={m.unsupported ? 'info' : 'danger'}>
                {m.error}{m.unsupported && <> Add <b>GET /api/v1/admin/users</b> to its operator API and everyone in this workspace appears here with their role.</>}
              </Notice>
              {ws.owner?.email && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Known from the workspace list</p>
                  <KV items={[['Owner', ws.owner.email], ['Name', ws.owner.fullName ?? '—'], ['People in total', `${int(ws.members)}${ws.seatLimit > 0 ? ` of ${int(ws.seatLimit)} seats` : ''}`]]} />
                </div>
              )}
            </>
          ) : members.length === 0 ? <EmptyState compact title="Nobody is listed in this workspace" /> : (
            <>
              <p className="mb-4 text-sm text-muted">
                {byRole.map(([r, n]) => `${n} ${humanize(r).toLowerCase()}${n === 1 ? '' : 's'}`).join(' · ')}
              </p>
              {members.length < ws.members && <p className="mb-3 text-xs text-muted">{ws.members - members.length} more {ws.members - members.length === 1 ? 'seat is' : 'seats are'} counted for this workspace but not listed, for example pending invites.</p>}
              <Table label="People in this workspace" bare>
                <thead><tr>{['Person', 'Role', 'Signed up'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                <tbody>{members.map((x) => (
                  <Tr key={x.id || x.email}>
                    <td className="td"><Cell text={x.fullName || x.email || '—'} sub={x.fullName ? x.email : undefined} max={300} /></td>
                    <td className="td whitespace-nowrap"><Badge tone={roleTone(x.role)}>{humanize(x.role)}</Badge></td>
                    <td className="td whitespace-nowrap">{x.createdAt ? <When value={x.createdAt} /> : <span className="text-muted">—</span>}</td>
                  </Tr>
                ))}</tbody>
              </Table>
            </>
          )}
        </Card>
        <Card title="Reference"><KV items={[['Workspace ID', <CopyId key="i" value={ws.id} />], ['Owner ID', ws.owner?.id ? <CopyId key="o" value={ws.owner.id} /> : '—']]} /></Card>
      </div>
    </>
  );
}
