import Link from 'next/link';
import { Badge, Card, EmptyState, ErrorPanel, Filters, PageHeader, Pagination, Stat, Table, Tr, When } from '@/components/ui';
import { CopyId } from '@/components/small-client';
import { guildInfoMap } from '@/lib/discord';
import { int, sentence } from '@/lib/format';
import { PAGE_SIZE } from '@/lib/validation';
import { BOT_OFFLINE_BURST, jobCode, jobParams, jobStats, listJobs } from '../queries/jobs';
import { str, type Row } from '../db';
import { ServerLink, base } from './shared';
import type { RouteCtx } from '@/products/types';

const JOB_TONE = (s: string): 'success' | 'danger' | 'warning' | 'neutral' => (s === 'done' || s === 'succeeded' ? 'success' : s === 'failed' ? 'danger' : s === 'pending' || s === 'running' ? 'warning' : 'neutral');
const seconds = (n: number | null) => (n === null ? '—' : n < 90 ? `${n.toFixed(1)} s` : `${(n / 60).toFixed(1)} min`);

/** Jobs as a compact table. Only the status and the result code are shown, never the payload. */
export function JobsTable({ rows, infos, showServer = true }: { rows: Row[]; infos?: Awaited<ReturnType<typeof guildInfoMap>>; showServer?: boolean }) {
  if (rows.length === 0) return <EmptyState compact title="No jobs in the last 24 hours" />;
  return (
    <Table label="Dashboard jobs" bare={!showServer}>
      <thead><tr><th className="th">Time</th>{showServer && <th className="th">Server</th>}<th className="th">Job</th><th className="th">Status</th><th className="th">Requested by</th></tr></thead>
      <tbody>{rows.map((r) => {
        const s = str(r.status) ?? 'unknown', code = jobCode(r), gid = String(r.guild_id);
        return (
          <Tr key={String(r.id)}>
            <td className="td num whitespace-nowrap"><When value={str(r.created_at)} /></td>
            {showServer && <td className="td"><ServerLink id={gid} info={infos?.[gid]} /></td>}
            <td className="td">{sentence(str(r.kind))}</td>
            <td className="td"><span className="inline-flex flex-wrap items-center gap-1"><Badge tone={JOB_TONE(s)}>{sentence(s)}</Badge>{code && <span className="text-xs text-muted">{sentence(code)}</span>}</span></td>
            <td className="td">{r.requested_by ? <CopyId value={String(r.requested_by)} /> : '—'}</td>
          </Tr>
        );
      })}</tbody>
    </Table>
  );
}

export async function JobsPage({ searchParams }: RouteCtx) {
  const p = jobParams.parse(searchParams);
  let data, stats;
  try { [data, stats] = await Promise.all([listJobs(p), jobStats()]); } catch { return <ErrorPanel message="Could not load dashboard jobs." retryHref={`${base}/jobs`} />; }
  const infos = await guildInfoMap(data.rows.map((r) => String(r.guild_id)));
  const path = `${base}/jobs`;
  const down = stats.offlineLastHour >= BOT_OFFLINE_BURST;
  return (
    <>
      <PageHeader title="Dashboard jobs" description="What customers asked the bot to do from the dashboard, last 24 hours." updatedAt={new Date()} />
      {down && <p className="mb-4 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{int(stats.offlineLastHour)} jobs failed with “Bot offline” in the last hour. The bot is probably down.</p>}
      <div className="mb-5 grid grid-cols-4 gap-5">
        <Card><Stat icon="overview" label="Jobs per hour" value={stats.perHour.toFixed(1)} hint={`${int(stats.total)} in 24 hours`} /></Card>
        <Card><Stat icon="health" label="Failure rate" value={`${(stats.failureRate * 100).toFixed(1)}%`} hint={`${int(stats.failed)} failed`} /></Card>
        <Card><Stat icon="reminders" label="Time to finish (p95)" value={seconds(stats.p95Seconds)} /></Card>
        <Card><Stat icon="servers" label="Bot offline, last hour" value={int(stats.offlineLastHour)} /></Card>
      </div>
      <Filters action={path} fields={[
        { type: 'select', key: 'failed', label: 'Show', options: [['', 'All jobs'], ['1', 'Failed only']] },
        { type: 'select', key: 'code', label: 'Result', options: [['', 'Any'], ...stats.codes.map((c): [string, string] => [c, sentence(c)])] },
      ]} />
      {p.guild && <p className="mb-3 text-muted">Showing one server. <Link className="text-accent" href={path}>Show all servers</Link></p>}
      {data.rows.length === 0 ? <div className="card"><EmptyState title="No jobs match" hint="Finished jobs are deleted after a day." /></div> : <JobsTable rows={data.rows} infos={infos} />}
      <Pagination base={path} params={{ failed: p.failed, code: p.code, guild: p.guild }} page={p.page} pageSize={PAGE_SIZE} total={data.total} />
    </>
  );
}
