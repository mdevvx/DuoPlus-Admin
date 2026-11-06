import Link from 'next/link';
import { Download } from 'lucide-react';
import { RefreshButton } from '@/components/refresh-button';
import { Badge, Card, ErrorPanel, Hero, HeroChip, MiniStat, StatCard, heroBtn, heroBtnSolid } from '@/components/ui';
import { AreaChart, Donut, MiniBars, ProgressBar, Ring, SegmentBar, Sparkline } from '@/components/charts';
import { int, money, platformLabel, sentence, statusTone } from '@/lib/format';
import { getOverview, type Overview } from '../queries/overview';
import { PaymentsMini, base } from './shared';
import { str } from '../db';
import type { RouteCtx } from '@/products/types';

const pct = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

export async function OverviewPage({ admin }: RouteCtx) {
  let o;
  try { o = await getOverview(); } catch { return <ErrorPanel message="Could not load the overview." retryHref={base} />; }
  const name = admin.displayName ?? admin.email.split('@')[0] ?? 'there';
  return <OverviewView o={o} name={name} />;
}

export function OverviewView({ o, name }: { o: Overview; name: string }) {
  const revDelta = pct(o.revenue30Total, o.revenuePrev30);
  const srvDelta = pct(o.servers30Total, o.serversPrev30);
  const totalBotServers = o.botPresent + o.removed;
  const okCount = o.health.filter((h) => statusTone(str(h.status)) === 'success').length;
  const healthScore = o.health.length ? (okCount / o.health.length) * 100 : 100;
  const planTotal = Math.max(1, o.free + o.paidTotal + o.grace + o.whitelisted);
  const conv = o.conversion30 === null ? '—' : `${(o.conversion30 * 100).toFixed(1)}%`;

  return (
    <>
      <Hero
        title={`Welcome back, ${name}`}
        text={<>DiscoNotify has <b>{int(o.botPresent)}</b> servers with the bot: <b>{int(o.paidTotal)}</b> paid, <b>{int(o.free)}</b> on the free plan.
          {revDelta !== null && <> Paid revenue is {revDelta >= 0 ? 'up' : 'down'} <b>{Math.abs(revDelta).toFixed(1)}%</b> on the previous 30 days.</>}
          {o.overLimit > 0 && <> {int(o.overLimit)} free server{o.overLimit === 1 ? ' is' : 's are'} over the free limit.</>}</>}
        chips={<><HeroChip live>Live data</HeroChip><HeroChip>{o.maintenance ? 'Maintenance mode on' : 'Maintenance mode off'}</HeroChip></>}
        actions={<>
          <Link href={`${base}/payments`} className={heroBtn}><Download className="h-4 w-4" aria-hidden /> Payments</Link>
          <RefreshButton className={heroBtnSolid} />
        </>}
        aside={`Updated ${new Date().toISOString().slice(11, 16)} UTC`}
        metrics={[
          { label: 'Revenue, 30 days', value: money(o.revenue30Total) },
          { label: 'MRR (estimate)', value: money(o.mrr) },
          { label: 'Servers with bot', value: int(o.botPresent) },
          { label: 'Free to paid, 30 days', value: conv },
        ]}
      />

      <div className="mb-5 grid grid-cols-4 gap-5">
        <StatCard icon="payments" hue="green" label="Paid revenue, 30 days" value={money(o.revenue30Total)} delta={revDelta}
          rows={[['Previous 30 days', money(o.revenuePrev30)], ['MRR (estimate)', money(o.mrr)]]}>
          <Sparkline values={o.revenue30.map((d) => d.value)} />
        </StatCard>
        <StatCard icon="servers" hue="blue" label="New servers, 30 days" value={int(o.servers30Total)} delta={srvDelta}
          rows={[['Previous 30 days', int(o.serversPrev30)], ['This week', int(o.newThisWeek)]]}>
          <MiniBars values={o.servers30.slice(-14).map((d) => d.value)} />
        </StatCard>
        <section className="card rise col-span-2 p-5">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent"><svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 12h4l3-8 4 16 3-8h4" /></svg></span>
            <div className="text-[15px] font-semibold">Plans</div>
          </div>
          <p className="mb-4 text-muted">
            <b className="text-ink">{int(o.paidCard)}</b> servers pay by card, <b className="text-ink">{int(o.paidCrypto)}</b> by crypto, <b className="text-ink">{int(o.grace)}</b> are in the grace period and <b className="text-ink">{int(o.whitelisted)}</b> are whitelisted. Everyone else is on the free plan.
          </p>
          <div className="grid grid-cols-5 gap-3">
            <MiniStat label="Free" value={int(o.free)} /><MiniStat label="Paid · card" value={int(o.paidCard)} /><MiniStat label="Paid · crypto" value={int(o.paidCrypto)} />
            <MiniStat label="Grace" value={int(o.grace)} /><MiniStat label="Whitelisted" value={int(o.whitelisted)} />
          </div>
          <div className="mt-4">
            <SegmentBar segments={[
              { label: 'Free', value: o.free, color: 'var(--chart-3)' }, { label: 'Card', value: o.paidCard, color: 'var(--chart-1)' }, { label: 'Crypto', value: o.paidCrypto, color: 'var(--chart-2)' },
              { label: 'Grace', value: o.grace, color: 'var(--chart-5)' }, { label: 'Whitelisted', value: o.whitelisted, color: 'var(--chart-4)' },
            ]} />
          </div>
        </section>
      </div>

      <div className="mb-5 grid grid-cols-4 gap-5">
        <StatCard icon="subscriptions" hue="violet" label="New paid this week" value={int(o.newPaidThisWeek)}
          rows={[['Churned this month', int(o.churnThisMonth)], ['Paid servers', int(o.paidTotal)]]}>
          <ProgressBar value={o.paidTotal} max={planTotal} color="var(--chart-4)" />
        </StatCard>
        <StatCard icon="customers" hue="green" label="Free to paid, 30 days" value={conv}
          rows={[['Became paid', int(o.converted30)], ['Were free at the start', int(o.freeAtStart)]]}>
          <ProgressBar value={o.converted30} max={Math.max(1, o.freeAtStart)} color="var(--chart-1)" />
        </StatCard>
        <StatCard icon="servers" hue="amber" label="Servers over the free limit" value={int(o.overLimit)}
          rows={[['Extra accounts are paused', 'Yes']]}>
          <Link className="text-xs font-medium text-accent" href={`${base}/servers?flag=over_limit`}>Open the list</Link>
        </StatCard>
        <StatCard icon="reminders" hue="rose" label="Paid servers about to lapse" value={int(o.aboutToLapse)}
          rows={[['Card cancelling, or crypto ending within 7 days', '']]}>
          <Link className="text-xs font-medium text-accent" href={`${base}/servers?flag=card_cancelling`}>Cards cancelling</Link>
        </StatCard>
      </div>

      <div className="mb-6 grid grid-cols-4 gap-5">
        <StatCard icon="bell" hue="amber" label="Servers with the bot" value={int(o.botPresent)}
          rows={[['Removed', int(o.removed)], ['Installed share', `${totalBotServers ? Math.round((o.botPresent / totalBotServers) * 100) : 0}%`]]}>
          <ProgressBar value={o.botPresent} max={Math.max(1, totalBotServers)} color="var(--chart-3)" />
        </StatCard>
        <StatCard icon="health" hue="blue" label="API budget (YouTube, today)" value={o.youtube ? `${int(o.youtube.used)} / ${int(o.youtube.limit)}` : 'N/A'}
          rows={[['Free servers add polling load', '']]}>
          {o.youtube
            ? <ProgressBar value={o.youtube.used} max={o.youtube.limit} color={o.youtube.used / o.youtube.limit > 0.8 ? 'var(--danger)' : 'var(--chart-2)'} />
            : <span className="text-xs text-muted">The bot has not reported YouTube quota yet</span>}
        </StatCard>
        <StatCard icon="health" hue="blue" label="Maintenance mode" value={o.maintenance ? 'On' : 'Off'}
          rows={[['Platforms reporting', int(o.health.length)], ['Needs attention', int(o.health.filter((h) => statusTone(str(h.status)) !== 'success').length)]]}>
          <Badge tone={o.maintenance ? 'warning' : 'success'}>{o.maintenance ? 'Alerts may pause' : 'Bot running normally'}</Badge>
        </StatCard>
        <Card title="Plans mix">
          <Donut centerLabel="servers" segments={[
            { label: 'Free', value: o.free, color: 'var(--chart-3)' }, { label: 'Card', value: o.paidCard, color: 'var(--chart-1)' }, { label: 'Crypto', value: o.paidCrypto, color: 'var(--chart-2)' },
            { label: 'Grace', value: o.grace, color: 'var(--chart-5)' }, { label: 'Whitelisted', value: o.whitelisted, color: 'var(--chart-4)' },
          ]} />
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-5">
        <Card title="Platform status" action={<Link className="text-xs font-medium text-accent" href={`${base}/health`}>Details</Link>}>
          {o.health.length === 0 ? <p className="text-muted">No platform data yet.</p> : (
            <>
              <div className="mb-4 flex items-center justify-between rounded-xl bg-subtle px-4 py-3">
                <Ring value={healthScore} label={'Platforms\nhealthy'} color={healthScore >= 75 ? 'var(--success)' : healthScore >= 40 ? 'var(--warning)' : 'var(--danger)'} />
                <span className="text-xs text-muted">{okCount} of {o.health.length} reporting normally</span>
              </div>
              <ul className="space-y-3">
                {o.health.map((h, i) => {
                  const s = str(h.status) ?? 'unknown';
                  return <li key={i} className="flex items-center justify-between"><span className="font-medium">{platformLabel(str(h.platform ?? h.name))}</span><Badge tone={statusTone(s)}>{sentence(s)}</Badge></li>;
                })}
              </ul>
            </>
          )}
        </Card>
        <Card title="New servers, last 30 days" className="col-span-2" action={<span className="num text-xs text-muted">Total {int(o.servers30Total)}</span>}>
          <AreaChart data={o.servers30} color="var(--chart-2)" label="New servers" height={230} />
        </Card>
      </div>

      <Card title="Latest payments" action={<Link className="text-xs font-medium text-accent" href={`${base}/payments`}>All payments</Link>}>
        <PaymentsMini rows={o.lastPayments} />
      </Card>
    </>
  );
}
