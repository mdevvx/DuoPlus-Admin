import Link from 'next/link';
import { Building2, CreditCard } from 'lucide-react';
import { RefreshButton } from '@/components/refresh-button';
import { Badge, Card, Cell, EmptyState, Hero, HeroChip, MiniStat, StatCard, Table, Tr, When, heroBtn, heroBtnSolid } from '@/components/ui';
import { AreaChart, BarChart, Donut, MiniBars, ProgressBar, RankedBars, SegmentBar, Sparkline, type Segment } from '@/components/charts';
import { int, money } from '@/lib/format';
import type { RouteCtx } from '@/products/types';
import { PLAN_LABEL, getOverview, sumMembers, tmsConfigured, type AppUser, type Overview, type Workspace } from '../api';
import { allUsers, allWorkspaces } from '../people';
import { STATUS_COLOR, STATUS_ORDER, humanize, statusLabel } from '../labels';
import { REASON_LABEL, STATUS_LABEL as PAY_STATUS, type PaymentRow } from '../payments';
import { listPayments, polarEnv, polarPaymentsConfigured } from '../polar';
import { dailyCounts, dailySums, pct, windowTotals } from '../series';
import { StatusBadge, base, load } from './shared';

const PLAN_COLOR = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];
const EMPTY: Overview = {
  generatedAt: '', users: { total: 0, new30d: 0 }, workspaces: { total: 0, new30d: 0 },
  subscriptions: { byStatus: {}, byPlan: {}, whitelisted: 0 }, billing: { payingAccounts: 0, trialingAccounts: 0, trialsEndingIn3Days: 0, mrrCents: 0 },
};

/** What a payment brought in: what was charged minus what was refunded. Pending orders are not revenue. */
const earned = (p: PaymentRow) => (p.status === 'pending' ? 0 : p.amount - (p.status === 'refunded' ? p.refunded || p.amount : p.refunded)) / 100;

export async function OverviewPage({ admin }: RouteCtx) {
  const r = await load(getOverview, base);
  const ready = tmsConfigured();
  // Each extra source is optional: the page still renders without it.
  const [ws, users, pay] = await Promise.all([
    ready ? allWorkspaces().catch((): Workspace[] | null => null) : null,
    ready ? allUsers().catch((): AppUser[] | null => null) : null,
    polarPaymentsConfigured() ? listPayments().catch(() => null) : null,
  ]);
  const o = r.ok ? r.data : EMPTY;
  const name = admin.displayName ?? admin.email.split('@')[0] ?? 'there';
  const b = o.billing;
  const { byStatus, byPlan, whitelisted } = o.subscriptions;

  const people = ws ? sumMembers(ws) : null;
  const wsDates = (ws ?? []).map((w) => ({ date: w.createdAt, value: 1 }));
  const newWs = windowTotals(wsDates);
  const wsSeries = dailySums(wsDates);
  const userSeries = dailyCounts((users ?? []).map((u) => u.createdAt));
  const payments = pay?.rows ?? [];
  const revItems = payments.map((p) => ({ date: p.createdAt, value: earned(p) }));
  const rev = windowTotals(revItems);
  const revSeries = dailySums(revItems);
  const revDelta = pct(rev.cur, rev.prev);
  const wsDelta = pct(newWs.cur, newWs.prev);
  const week = wsSeries.slice(-7).reduce((a, d) => a + d.value, 0);

  const paying = b.payingAccounts;
  const status = (k: string) => byStatus[k] ?? 0;
  const statusKeys = [...STATUS_ORDER.filter((k) => k in byStatus), ...Object.keys(byStatus).filter((k) => !(STATUS_ORDER as readonly string[]).includes(k))];
  const statuses: Segment[] = statusKeys.map((k) => ({ label: statusLabel(k), value: byStatus[k] ?? 0, color: STATUS_COLOR[k] ?? 'var(--chart-grid)' }));
  const plans: Segment[] = Object.entries(byPlan).map(([k, v], i) => ({ label: PLAN_LABEL[k] ?? humanize(k), value: v, color: PLAN_COLOR[i % PLAN_COLOR.length] }));
  const totalWs = r.ok ? o.workspaces.total : 0;
  const covered = status('active') + status('trialing') + status('comped') + status('past_due');
  const payLabel = polarEnv() === 'sandbox' ? 'Payments via Polar (sandbox)' : 'Payments via Polar';
  const dash = (v: string) => (r.ok ? v : '—');

  return (
    <>
      {!r.ok && <div className="mb-6">{r.panel}</div>}
      <Hero
        title={`Welcome back, ${name}`}
        text={!r.ok ? 'Connect Donexel to see its workspaces, people, subscriptions and revenue here.' : <>Donexel has <b>{int(totalWs)}</b> workspaces{people !== null && <> with <b>{int(people)}</b> people</>}, <b>{int(paying)}</b> paying accounts and <b>{int(b.trialingAccounts)}</b> on trial.
          {revDelta !== null && <> Paid revenue is {revDelta >= 0 ? 'up' : 'down'} <b>{Math.abs(revDelta).toFixed(1)}%</b> on the previous 30 days.</>}
          {b.trialsEndingIn3Days > 0 && <> {int(b.trialsEndingIn3Days)} trial{b.trialsEndingIn3Days === 1 ? '' : 's'} end within 3 days.</>}</>}
        chips={<><HeroChip live>Live data</HeroChip><HeroChip>{payLabel}</HeroChip></>}
        actions={<>
          <Link href={`${base}/workspaces`} className={heroBtn}><Building2 className="h-4 w-4" aria-hidden /> Workspaces</Link>
          <Link href={`${base}/payments`} className={heroBtn}><CreditCard className="h-4 w-4" aria-hidden /> Payments</Link>
          <RefreshButton className={heroBtnSolid} />
        </>}
        aside={`Updated ${new Date().toISOString().slice(11, 16)} UTC`}
        metrics={[
          { label: 'MRR (estimate)', value: dash(money(b.mrrCents / 100)) },
          { label: 'Revenue, 30 days', value: pay ? money(rev.cur) : '—' },
          { label: 'Workspaces', value: dash(int(totalWs)) },
          { label: 'People', value: people !== null ? int(people) : dash(int(o.users.total)) },
        ]}
      />

      <div className="mb-5 grid grid-cols-4 gap-5">
        <StatCard icon="payments" hue="green" label="Paid revenue, 30 days" value={pay ? money(rev.cur) : '—'} delta={revDelta}
          rows={[['Previous 30 days', pay ? money(rev.prev) : '—'], ['MRR (estimate)', dash(money(b.mrrCents / 100))]]}>
          {pay ? <Sparkline values={revSeries.map((d) => d.value)} /> : <p className="text-xs text-muted">Add a Polar token to see revenue.</p>}
        </StatCard>
        <StatCard icon="workspace" hue="blue" label="New workspaces, 30 days" value={ws ? int(newWs.cur) : dash(int(o.workspaces.new30d))} delta={wsDelta}
          rows={[['Previous 30 days', ws ? int(newWs.prev) : '—'], ['This week', ws ? int(week) : '—']]}>
          <MiniBars values={wsSeries.slice(-14).map((d) => d.value)} />
        </StatCard>
        <section className="card rise col-span-2 p-5">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent"><svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 12h4l3-8 4 16 3-8h4" /></svg></span>
            <div className="text-[15px] font-semibold">Subscription health</div>
          </div>
          <p className="mb-4 text-muted">
            {int(covered)} workspaces are on a paid or free plan: <b className="text-ink">{int(status('active'))}</b> pay, <b className="text-ink">{int(status('comped'))}</b> are complimentary and <b className="text-ink">{int(status('trialing'))}</b> are on trial.
            {status('past_due') > 0 ? ` ${int(status('past_due'))} payment${status('past_due') === 1 ? ' has' : 's have'} failed.` : ' No payments are overdue.'}
          </p>
          <div className="grid grid-cols-4 gap-3">
            <MiniStat label="Paying" value={dash(int(paying))} /><MiniStat label="On trial" value={dash(int(status('trialing')))} />
            <MiniStat label="Complimentary" value={dash(int(status('comped')))} /><MiniStat label="Past due" value={dash(int(status('past_due')))} />
          </div>
          <div className="mt-4">
            <SegmentBar segments={[
              { label: 'Paying', value: status('active'), color: 'var(--chart-1)' }, { label: 'On trial', value: status('trialing'), color: 'var(--chart-2)' },
              { label: 'Complimentary', value: status('comped'), color: 'var(--chart-4)' }, { label: 'Past due', value: status('past_due'), color: 'var(--chart-3)' },
            ]} />
          </div>
        </section>
      </div>

      <div className="mb-6 grid grid-cols-4 gap-5">
        <StatCard icon="workspace" hue="violet" label="Workspaces" value={dash(int(totalWs))}
          rows={[['New in the last 30 days', dash(int(o.workspaces.new30d))], ['On a plan', dash(int(covered))]]}>
          <ProgressBar value={covered} max={Math.max(1, totalWs)} color="var(--chart-4)" />
        </StatCard>
        <StatCard icon="customers" hue="amber" label="People in workspaces" value={people !== null ? int(people) : '—'}
          rows={[['Registered users', dash(int(o.users.total))], ['New users, 30 days', dash(int(o.users.new30d))]]}>
          <ProgressBar value={Math.min(people ?? 0, o.users.total)} max={Math.max(1, o.users.total)} color="var(--chart-3)" />
        </StatCard>
        <StatCard icon="reminders" hue="rose" label="Trials ending in 3 days" value={dash(int(b.trialsEndingIn3Days))}
          rows={[['Trials running', dash(int(b.trialingAccounts))], ['Past due', dash(int(status('past_due')))]]}>
          <ProgressBar value={b.trialsEndingIn3Days} max={Math.max(1, b.trialingAccounts)} color="var(--chart-5)" />
        </StatCard>
        <StatCard icon="whitelist" hue="blue" label="Whitelisted emails" value={dash(int(whitelisted))}
          rows={[['Complimentary workspaces', dash(int(status('comped')))]]}>
          <Link className="text-sm font-medium text-accent hover:underline" href={`${base}/whitelist`}>Manage the whitelist</Link>
        </StatCard>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-5">
        <Card title="Paid revenue, last 30 days" className="col-span-2" action={pay ? <span className="num text-xs text-muted">Total {money(rev.cur)}</span> : undefined}>
          {pay ? <BarChart data={revSeries} format={money} label="Paid revenue" /> : <EmptyState compact title="Revenue is not connected" hint="Add TMS_POLAR_ACCESS_TOKEN to read orders from Polar." />}
        </Card>
        <Card title="Workspaces by plan">
          {plans.length === 0 || plans.every((s) => s.value === 0) ? <EmptyState compact title="No plan data yet" /> : <Donut centerLabel="workspaces" segments={plans} />}
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-5">
        <Card title="Subscriptions by status">
          {statuses.length === 0 || statuses.every((s) => s.value === 0) ? <EmptyState compact title="No subscriptions yet" /> : <RankedBars items={statuses} />}
        </Card>
        <Card title="New users, last 30 days" className="col-span-2" action={users ? <span className="num text-xs text-muted">Total {int(userSeries.reduce((a, d) => a + d.value, 0))}</span> : undefined}>
          {users ? <AreaChart data={userSeries} color="var(--chart-2)" label="New users" height={230} /> : <EmptyState compact title="No user data yet" />}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <Card title="Newest workspaces" action={<Link className="text-xs font-medium text-accent" href={`${base}/workspaces`}>All workspaces</Link>}>
          {!ws || ws.length === 0 ? <EmptyState compact title="No workspaces yet" /> : (
            <Table label="Newest workspaces" bare>
              <thead><tr>{['Workspace', 'Status', 'Created'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>{[...ws].sort((a, c) => c.createdAt.localeCompare(a.createdAt)).slice(0, 6).map((w) => (
                <Tr key={w.id}>
                  <td className="td"><Cell text={w.name} sub={w.owner?.email} max={240} href={`${base}/workspaces/${encodeURIComponent(w.id)}`} /></td>
                  <td className="td whitespace-nowrap"><StatusBadge status={w.status} /></td>
                  <td className="td whitespace-nowrap"><When value={w.createdAt || null} /></td>
                </Tr>
              ))}</tbody>
            </Table>
          )}
        </Card>
        <Card title="Latest payments" action={<Link className="text-xs font-medium text-accent" href={`${base}/payments`}>All payments</Link>}>
          {!pay ? <EmptyState compact title="Payments are not connected" hint="Add TMS_POLAR_ACCESS_TOKEN to read orders from Polar." /> : payments.length === 0 ? <EmptyState compact title="No payments yet" /> : (
            <Table label="Latest payments" bare>
              <thead><tr>{['Customer', 'Amount', 'Status'].map((h, i) => <th key={h} className={i === 1 ? 'th text-right' : 'th'}>{h}</th>)}</tr></thead>
              <tbody>{payments.slice(0, 6).map((p) => (
                <Tr key={p.id}>
                  <td className="td"><Cell text={p.email || '—'} sub={`${p.plan ? PLAN_LABEL[p.plan] : p.productName || 'Plan'} · ${REASON_LABEL[p.reason] ?? 'Payment'}`} max={240} /></td>
                  <td className="td num whitespace-nowrap text-right">{money(p.amount / 100)}</td>
                  <td className="td whitespace-nowrap"><Badge tone={p.status === 'paid' ? 'success' : p.status === 'pending' ? 'warning' : 'neutral'}>{PAY_STATUS[p.status] ?? humanize(p.status)}</Badge></td>
                </Tr>
              ))}</tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
