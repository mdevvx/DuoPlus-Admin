import Link from 'next/link';
import { Badge, Card, EmptyState, ErrorPanel, FilterBar, PageHeader, Pagination, Select, Stat, Table, Tr } from '@/components/ui';
import { CopyId } from '@/components/small-client';
import { dateOnly, int, platformLabel } from '@/lib/format';
import { PAGE_SIZE } from '@/lib/validation';
import { botParams, getBotDashboard, listBotServers } from '../queries/bot';
import type { RouteCtx } from '@/products/types';
import { ServerLink, base } from './shared';
import { guildInfoMap } from '@/lib/discord';
import { RankedBars } from '@/components/charts';
import { DiscordNotice } from '@/components/discord-notice';
import { str } from '../db';

const ok = (s: string) => ['ok', 'healthy', 'operational', 'up'].includes(s.toLowerCase());

export async function BotStatusPage({ searchParams }: RouteCtx) {
  const p = botParams.parse(searchParams);
  let dash, list;
  try { [dash, list] = await Promise.all([getBotDashboard(), listBotServers(p)]); } catch { return <ErrorPanel message="Could not load bot status." retryHref={`${base}/bot`} />; }
  const path = `${base}/bot`;
  const infos = await guildInfoMap(list.rows.map((r) => r.guild_id));

  return (
    <>
      <PageHeader title="Bot status" description="Where the bot is installed and which integrations each server has set up." updatedAt={new Date()} />
      <div className="mb-6 grid grid-cols-6 gap-4">
        <Card><Stat icon="servers" label="Servers with bot" value={int(dash.present)} hint={`${int(dash.removed)} removed`} /></Card>
        <Card><Stat icon="customers" label="Monitored accounts" value={int(dash.accounts)} /></Card>
        <Card><Stat icon="reminders" label="Notification channels" value={int(dash.channels)} /></Card>
        <Card><Stat icon="bell" label="Alert configurations" value={int(dash.alerts)} /></Card>
        <Card><Stat icon="health" label="Live now" value={int(dash.live)} /></Card>
        <Card><Stat icon="overview" label="Events, 24 hours" value={int(dash.events24h)} /></Card>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-5">
        <Card title="Integrations by platform">
          {dash.byPlatform.length === 0 ? <EmptyState title="No monitored accounts yet" /> : (
            <RankedBars items={dash.byPlatform.slice(0, 8).map(([name, n]) => ({ label: platformLabel(name), value: n }))} />
          )}
        </Card>
        <Card title="Platform status" action={<Link className="text-xs text-accent" href={`${base}/health`}>Details</Link>}>
          {dash.health.length === 0 ? <EmptyState title="No platform data" /> : (
            <ul className="space-y-2">{dash.health.map((h, i) => { const s = str(h.status) ?? 'unknown'; return (
              <li key={i} className="flex justify-between"><span>{platformLabel(str(h.platform ?? h.name))}</span><Badge tone={ok(s) ? 'success' : 'warning'}>{s}</Badge></li>
            ); })}</ul>
          )}
        </Card>
      </div>

      <DiscordNotice />
      <FilterBar action={path}>
        <input className="input w-64" name="q" placeholder="Server ID" defaultValue={p.q} />
        <Select name="bot" label="Bot" value={p.bot} options={[['present', 'Installed'], ['removed', 'Removed'], ['all', 'All']]} />
      </FilterBar>
      {list.rows.length === 0 ? <div className="card"><EmptyState title="No servers match" /></div> : (
        <Table label="Servers and integrations">
          <thead><tr><th className="th">Server</th><th className="th">ID</th><th className="th">Bot</th><th className="th">Monitored accounts</th><th className="th text-right">Channels</th><th className="th text-right">Alerts</th><th className="th">Added</th></tr></thead>
          <tbody>{list.rows.map((r) => (
            <Tr key={r.guild_id}>
              <td className="td"><ServerLink id={r.guild_id} info={infos[r.guild_id]} showId={false} /></td>
              <td className="td"><CopyId value={r.guild_id} /></td>
              <td className="td">{r.bot_present === false ? <Badge>Removed</Badge> : <Badge tone="success">Installed</Badge>}</td>
              <td className="td">{r.platforms.length === 0 ? <span className="text-muted">None set up</span> : (
                <span className="flex flex-wrap gap-1">{r.platforms.map(([n, c]) => <Badge key={n} tone="info">{platformLabel(n)} · {c}</Badge>)}</span>
              )}</td>
              <td className="td num text-right">{r.channels}</td><td className="td num text-right">{r.alerts}</td><td className="td num">{dateOnly(r.created_at)}</td>
            </Tr>
          ))}</tbody>
        </Table>
      )}
      <Pagination base={path} params={{ q: p.q, bot: p.bot }} page={p.page} pageSize={PAGE_SIZE} total={list.total} />
    </>
  );
}
