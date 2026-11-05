import Link from 'next/link';
import { Badge, Card, EmptyState, ErrorPanel, PageHeader, Stat, Table, Tr } from '@/components/ui';
import { guildInfoMap } from '@/lib/discord';
import { int } from '@/lib/format';
import { getFreePlanUsage } from '../queries/freeplan';
import { PlatformBadge, ServerLink, base } from './shared';
import { Download } from 'lucide-react';
import { SLUG } from '../db';
import { can } from '@/lib/roles';
import type { RouteCtx } from '@/products/types';

export async function FreePlanPage({ role }: RouteCtx) {
  let u;
  try { u = await getFreePlanUsage(); } catch { return <ErrorPanel message="Could not load the free-plan report." retryHref={`${base}/free-plan`} />; }
  const infos = await guildInfoMap(u.top.map((t) => t.guild_id));
  const b = u.buckets;
  return (
    <>
      <PageHeader title="Free-plan usage" description="Where the free plan is stretched, who may be ready to pay, and what polling costs." updatedAt={new Date()}
        actions={can(role, 'export.csv') && <a className="btn" href={`/api/export/${SLUG}/grandfathering`}><Download className="h-4 w-4" aria-hidden /> Servers to announce to (CSV)</a>} />
      <div className="mb-5 grid grid-cols-4 gap-5">
        <Card><Stat icon="servers" label="Free servers" value={int(u.freeServers)} hint="With the bot" /></Card>
        <Card><Stat icon="customers" label="With 1 account per platform" value={int(b.one)} hint="Within the free limit" /></Card>
        <Card><Stat icon="subscriptions" label="With 2 accounts" value={int(b.two)} hint="Extras are paused" /></Card>
        <Card><Stat icon="subscriptions" label="With 3 or more" value={int(b.threePlus)} hint={`${int(b.none)} have no accounts yet`} /></Card>
      </div>
      <div className="grid gap-4">
        <Card title="Top 20 free servers by accounts paused by the plan" action={<Link className="text-sm text-accent hover:underline" href={`${base}/servers?flag=over_limit`}>All servers over the limit</Link>}>
          {u.top.length === 0 ? <EmptyState compact title="No paused accounts" hint="Nobody on the free plan is over the limit" /> : (
            <Table label="Servers with paused accounts" bare>
              <thead><tr><th className="th">Server</th><th className="th text-right">Paused</th><th className="th text-right">Accounts</th><th className="th">History</th></tr></thead>
              <tbody>{u.top.map((t) => (
                <Tr key={t.guild_id}>
                  <td className="td"><ServerLink id={t.guild_id} info={infos[t.guild_id]} /></td>
                  <td className="td num text-right">{int(t.paused)}</td><td className="td num text-right">{int(t.total)}</td>
                  <td className="td">{t.wasPaid ? <Badge tone="info">Was paid before</Badge> : <span className="text-muted">Never paid</span>}</td>
                </Tr>
              ))}</tbody>
            </Table>
          )}
        </Card>
        <Card title="Creators being polled" action={<span className="text-xs text-muted">The cost driver: a creator followed by many servers is polled once per server</span>}>
          {u.creators.length === 0 ? <EmptyState compact title="No accounts yet" /> : (
            <Table label="Creators per platform" bare>
              <thead><tr><th className="th">Platform</th><th className="th text-right">Accounts</th><th className="th text-right">Distinct creators</th><th className="th text-right">Polls per creator</th></tr></thead>
              <tbody>{u.creators.map((c) => (
                <Tr key={c.platform}>
                  <td className="td"><PlatformBadge platform={c.platform} /></td>
                  <td className="td num text-right">{int(c.accounts)}</td><td className="td num text-right">{int(c.creators)}</td>
                  <td className="td num text-right">{c.creators ? (c.accounts / c.creators).toFixed(2) : '—'}</td>
                </Tr>
              ))}</tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
