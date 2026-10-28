import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { RefreshButton } from '@/components/refresh-button';
import { Card, EmptyState, PageHeader, StatCard } from '@/components/ui';
import { Donut, RankedBars, type Segment } from '@/components/charts';
import { int, money } from '@/lib/format';
import type { RouteCtx } from '@/products/types';
import { getOverview, PLAN_LABEL, polarLink, type Overview } from '../api';
import { peopleInWorkspaces } from '../people';
import { STATUS_COLOR, STATUS_ORDER, humanize, statusLabel } from '../labels';
import { base, load } from './shared';

const PLAN_COLOR = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];
const EMPTY: Overview = {
  generatedAt: '', users: { total: 0, new30d: 0 }, workspaces: { total: 0, new30d: 0 },
  subscriptions: { byStatus: {}, byPlan: {}, whitelisted: 0 }, billing: { payingAccounts: 0, trialingAccounts: 0, trialsEndingIn3Days: 0, mrrCents: 0 },
};

export async function OverviewPage(_ctx: RouteCtx) {
  const r = await load(getOverview, base);
  const o = r.ok ? r.data : EMPTY;
  // Only people who are in a workspace; falls back to the API's registered-accounts total if the workspace list cannot be read.
  const ppl = r.ok ? await peopleInWorkspaces().catch(() => null) : null;
  const updated = o.generatedAt && !Number.isNaN(Date.parse(o.generatedAt)) ? new Date(o.generatedAt) : new Date();
  const { byStatus, byPlan, whitelisted } = o.subscriptions;
  const b = o.billing;

  // Known statuses first in a fixed order, then anything new the API starts sending.
  const statusKeys = [...STATUS_ORDER.filter((k) => k in byStatus), ...Object.keys(byStatus).filter((k) => !(STATUS_ORDER as readonly string[]).includes(k))];
  const statuses: Segment[] = statusKeys.map((k) => ({ label: statusLabel(k), value: byStatus[k] ?? 0, color: STATUS_COLOR[k] ?? 'var(--chart-grid)' }));
  const plans: Segment[] = Object.entries(byPlan).map(([k, v], i) => ({ label: PLAN_LABEL[k] ?? humanize(k), value: v, color: PLAN_COLOR[i % PLAN_COLOR.length] }));

  return (
    <>
      <PageHeader title="Overview" description="Accounts, subscriptions and estimated revenue for Donexel." updatedAt={updated}
        actions={<>
          <RefreshButton className="btn" />
          <a className="btn" href={polarLink()} target="_blank" rel="noopener noreferrer">Billing in Polar <ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>
        </>} />
      {!r.ok && <div className="mb-6">{r.panel}</div>}

      <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard icon="workspace" hue="blue" label="Workspaces" value={r.ok ? int(o.workspaces.total) : '—'} rows={[['New in the last 30 days', r.ok ? int(o.workspaces.new30d) : '—']]}>
          <Link className="text-sm font-medium text-accent hover:underline" href={`${base}/workspaces`}>See all workspaces</Link>
        </StatCard>
        <StatCard icon="customers" hue="green" label="People in workspaces" value={r.ok && ppl ? int(ppl.people) : '—'} rows={[['Across workspaces', r.ok && ppl ? int(ppl.workspaces) : '—']]}>
          <p className="text-xs text-muted">Counted per workspace, so someone in two workspaces counts twice.</p>
        </StatCard>
        <StatCard icon="customers" hue="violet" label="Registered users" value={r.ok ? int(o.users.total) : '—'} rows={[['New in the last 30 days', r.ok ? int(o.users.new30d) : '—']]}>
          <Link className="text-sm font-medium text-accent hover:underline" href={`${base}/users`}>See all users</Link>
        </StatCard>
        <StatCard icon="payments" hue="amber" label="Estimated MRR" value={r.ok ? money(b.mrrCents / 100) : '—'} rows={[['Paying accounts', r.ok ? int(b.payingAccounts) : '—']]}>
          <p className="text-xs text-muted">Paying accounts times their plan price. Trials, complimentary and whitelisted accounts are not revenue.</p>
        </StatCard>
        <StatCard icon="reminders" hue="amber" label="Trialing accounts" value={r.ok ? int(b.trialingAccounts) : '—'}
          rows={[['Trials ending within 3 days', r.ok ? <span key="t" className={b.trialsEndingIn3Days > 0 ? 'text-warning' : undefined}>{int(b.trialsEndingIn3Days)}</span> : '—']]} />
        <StatCard icon="whitelist" hue="rose" label="Whitelisted emails" value={r.ok ? int(whitelisted) : '—'}>
          <Link className="text-sm font-medium text-accent hover:underline" href={`${base}/whitelist`}>Manage the whitelist</Link>
        </StatCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Subscriptions by status">
          {statuses.length === 0 || statuses.every((s) => s.value === 0) ? <EmptyState compact title="No subscriptions yet" /> : <RankedBars items={statuses} />}
        </Card>
        <Card title="Workspaces by plan">
          {plans.length === 0 || plans.every((s) => s.value === 0) ? <EmptyState compact title="No plan data yet" /> : <Donut segments={plans} centerLabel="Workspaces" />}
        </Card>
      </div>
    </>
  );
}
