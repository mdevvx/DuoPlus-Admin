import Link from 'next/link';
import { RefreshCw, Users } from 'lucide-react';
import { Badge, Card, EmptyState, Hero, HeroChip, MiniStat, StatCard, heroBtn, heroBtnSolid, When } from '@/components/ui';
import { AreaChart, BarChart, Donut, MiniBars, ProgressBar, RankedBars, Sparkline } from '@/components/charts';
import { int, sentence } from '@/lib/format';
import type { RouteCtx } from '@/products/types';
import { cents, first, isObj, list, n, obj, points, s, whenOf, wfcGet, type J } from '../api';
import { CustomerLink, base, load } from './shared';

const MONEYISH = /(mrr|revenue|paid|amount|cents|arr)/i;
const PERCENTISH = /(rate|conversion|pct|percent)/i;

export interface Overview {
  stats: J; funnel: { label: string; value: number }[]; signups: { day: string; value: number }[];
  downloads: { day: string; value: number }[]; revenue: { day: string; value: number }[]; alerts: J[]; recent: J[];
}

export async function getOverview(): Promise<Overview> {
  const d = obj(await wfcGet('overview', {}, 30));
  const series = obj(first(d, 'series', 'charts', 'daily'));
  const f = first(d, 'funnel');
  const funnel = Array.isArray(f)
    ? f.map((x) => ({ label: sentence(s(obj(x), 'label', 'name', 'step', 'stage') ?? ''), value: n(obj(x), 'value', 'count', 'n') }))
    : isObj(f) ? Object.entries(f).map(([k, v]) => ({ label: sentence(k), value: Number(v) || 0 })) : [];
  return {
    stats: obj(first(d, 'stats', 'kpis', 'totals')),
    funnel,
    signups: points(first(series, 'signups', 'users', 'customers')),
    downloads: points(first(series, 'downloads')),
    revenue: points(first(series, 'revenue', 'payments')),
    alerts: list(first(d, 'alerts', 'attention'), 'alerts'),
    recent: list(first(d, 'recent', 'recent_events', 'events', 'activity'), 'events'),
  };
}

const sum = (p: { value: number }[]) => p.reduce((a, x) => a + x.value, 0);
const fmtStat = (k: string, v: number) => (PERCENTISH.test(k) ? `${v <= 1 ? Math.round(v * 1000) / 10 : Math.round(v * 10) / 10}%` : MONEYISH.test(k) ? cents(v) : int(v));

export async function OverviewPage({ admin }: RouteCtx) {
  const r = await load(getOverview, base);
  // Without data (key missing, server unreachable) keep the full layout, empty, with the reason on top.
  const o: Overview = r.ok ? r.data : { stats: {}, funnel: [], signups: [], downloads: [], revenue: [], alerts: [], recent: [] };
  const st = o.stats;
  const customers = n(st, 'customers', 'customers_total', 'total_customers', 'users');
  const trialing = n(st, 'trialing', 'trials', 'plan_trialing'), active = n(st, 'active', 'paying', 'plan_active');
  const pastDue = n(st, 'past_due', 'plan_past_due'), canceled = n(st, 'canceled', 'plan_canceled');
  const mrr = n(st, 'mrr', 'mrr_cents'), rev30 = n(st, 'revenue_30d', 'revenue30', 'revenue_30');
  const stores = n(st, 'stores', 'stores_total', 'stores_live'), online = n(st, 'stores_online', 'online');
  const stale = n(st, 'stores_stale', 'stale');
  const downloads = n(st, 'downloads', 'downloads_total');
  const name = admin.displayName ?? admin.email.split('@')[0] ?? 'there';
  const plan = [
    { label: 'Trialing', value: trialing, color: 'var(--chart-2)' }, { label: 'Active', value: active, color: 'var(--chart-1)' },
    { label: 'Past due', value: pastDue, color: 'var(--chart-5)' }, { label: 'Canceled', value: canceled, color: 'var(--chart-3)' },
  ];
  const shown = new Set(['customers', 'customers_total', 'total_customers', 'users', 'trialing', 'trials', 'active', 'paying', 'past_due', 'canceled', 'mrr', 'mrr_cents', 'revenue_30d', 'stores', 'stores_total', 'stores_live', 'stores_online', 'online', 'stores_stale', 'stale', 'downloads', 'downloads_total']);
  const extra = Object.entries(st).filter(([k, v]) => !shown.has(k) && typeof v === 'number');

  return (
    <>
      {!r.ok && <div className="mb-6">{r.panel}</div>}
      <Hero
        title={`Welcome back, ${name}`}
        text={!r.ok ? 'Connect the licence server to see customers, stores, payments and downloads for WooFlowConnect here.' : <>WooFlowConnect has <b>{int(customers)}</b> customers, <b>{int(active)}</b> paying and <b>{int(trialing)}</b> on trial, with <b>{int(online || stores)}</b> stores {online ? 'online' : 'activated'}.
          {o.alerts.length > 0 && <> {int(o.alerts.length)} item{o.alerts.length === 1 ? '' : 's'} need attention.</>}</>}
        chips={<><HeroChip live>Live data</HeroChip><HeroChip>Payments via Polar</HeroChip></>}
        actions={<>
          <Link href={`${base}/customers`} className={heroBtn}><Users className="h-4 w-4" aria-hidden /> Customers</Link>
          <Link href={base} className={heroBtnSolid}><RefreshCw className="h-4 w-4" aria-hidden /> Refresh</Link>
        </>}
        aside={`Updated ${new Date().toISOString().slice(11, 16)} UTC`}
        metrics={[
          { label: 'MRR', value: cents(mrr) }, { label: 'Revenue, 30 days', value: cents(rev30 || sum(o.revenue)) },
          { label: 'Customers', value: int(customers) }, { label: 'Stores online', value: int(online) },
        ]}
      />

      <div className="mb-5 grid grid-cols-4 gap-5">
        <StatCard icon="payments" hue="green" label="Revenue, 30 days" value={cents(rev30 || sum(o.revenue))}
          rows={[['MRR', cents(mrr)], ['Total revenue', cents(n(st, 'revenue_total', 'revenue_all', 'total_revenue'))], ['Failed payments, 30 days', int(n(st, 'failed_payments_30d', 'failed_30d', 'failed_payments'))]]}>
          <Sparkline values={o.revenue.map((d) => d.value)} />
        </StatCard>
        <StatCard icon="customers" hue="blue" label="Customers" value={int(customers)}
          rows={[['Signups, 7 days', int(n(st, 'signups_7d', 'signups7'))], ['Signups, 30 days', int(n(st, 'signups_30d', 'signups30') || sum(o.signups))]]}>
          <MiniBars values={o.signups.slice(-14).map((d) => d.value)} />
        </StatCard>
        <StatCard icon="store" hue="violet" label="Stores" value={int(stores || online + stale)}
          rows={[['Online now', int(online)], ['Stale (3+ days)', int(stale)]]}>
          <ProgressBar value={online} max={Math.max(1, stores || online + stale)} color="var(--chart-4)" />
        </StatCard>
        <StatCard icon="download" hue="amber" label="Downloads" value={int(downloads || sum(o.downloads))}
          rows={[['Last 7 days', int(n(st, 'downloads_7d', 'downloads7'))], ['Last 30 days', int(n(st, 'downloads_30d', 'downloads30') || sum(o.downloads))]]}>
          <MiniBars values={o.downloads.slice(-14).map((d) => d.value)} color="var(--chart-3)" />
        </StatCard>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-5">
        <Card title="Revenue, last 30 days" className="col-span-2" action={<span className="num text-xs text-muted">Total {cents(sum(o.revenue))}</span>}>
          {o.revenue.length ? <BarChart data={o.revenue} format={(v) => cents(v)} label="Revenue" /> : <EmptyState title="No revenue yet" />}
        </Card>
        <Card title="Customers by plan">
          <Donut centerLabel="customers" segments={plan} />
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-5">
        <Card title="Signup funnel">
          {o.funnel.length ? <RankedBars items={o.funnel} /> : <EmptyState compact title="No funnel data" />}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <MiniStat label="Trial to paid" value={fmtStat('conversion', n(st, 'conversion', 'trial_conversion', 'conversion_rate'))} />
            <MiniStat label="Trials ending in 3 days" value={int(n(st, 'trials_ending', 'trials_ending_3d'))} />
          </div>
        </Card>
        <Card title="Signups and downloads, 30 days" className="col-span-2">
          {o.signups.length ? <AreaChart data={o.signups} color="var(--chart-2)" label="Signups" height={230} /> : <EmptyState title="No signups yet" />}
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-5">
        <Card title="Needs attention" action={<span className="num text-xs text-muted">{o.alerts.length}</span>}>
          {o.alerts.length === 0 ? <EmptyState compact title="Nothing needs attention" /> : (
            <ul className="divide-y divide-line">{o.alerts.map((a, i) => <AlertRow key={i} a={a} />)}</ul>
          )}
        </Card>
        <Card title="Recent activity" action={<Link className="text-xs font-medium text-accent" href={`${base}/activity`}>All activity</Link>}>
          {o.recent.length === 0 ? <EmptyState compact title="No recent events" /> : (
            <ul className="divide-y divide-line">{o.recent.slice(0, 12).map((e, i) => (
              <li key={i} className="flex items-center justify-between gap-4 py-2">
                <span className="min-w-0 truncate"><b className="font-medium">{sentence(s(e, 'event', 'type', 'action'))}</b> <span className="text-muted">{s(e, 'email', 'customer', 'detail', 'message') ?? ''}</span></span>
                <span className="shrink-0 text-xs"><When value={whenOf(e, 'at', 'ts', 'created_at', 'time')} /></span>
              </li>
            ))}</ul>
          )}
        </Card>
      </div>

      {extra.length > 0 && (
        <Card title="All metrics">
          <div className="grid grid-cols-4 gap-3">{extra.map(([k, v]) => <MiniStat key={k} label={sentence(k)} value={fmtStat(k, v as number)} />)}</div>
        </Card>
      )}
    </>
  );
}

export function alertTone(a: J): 'danger' | 'warning' | 'info' {
  const t = `${s(a, 'type', 'kind', 'code') ?? ''} ${s(a, 'message', 'label', 'text') ?? ''}`.toLowerCase();
  return /fail|past.?due|refus|mismatch/.test(t) ? 'danger' : /trial|ending/.test(t) ? 'info' : 'warning';
}

function AlertRow({ a }: { a: J }) {
  const label = s(a, 'message', 'label', 'text', 'title') ?? sentence(s(a, 'type', 'kind'));
  const who = s(a, 'email', 'customer_email', 'detail');
  return (
    <li className="flex items-center justify-between gap-4 py-2">
      <span className="min-w-0 truncate"><CustomerLink id={first(a, 'customer_id', 'user_id', 'id')} label={label} />{who && who !== label && <span className="text-muted"> · {who}</span>}</span>
      <Badge tone={alertTone(a)}>{sentence(s(a, 'type', 'kind') ?? 'alert')}</Badge>
    </li>
  );
}
