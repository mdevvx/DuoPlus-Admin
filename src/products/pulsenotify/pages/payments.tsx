import { ExternalLink } from 'lucide-react';
import { DetailRow, EmptyState, ErrorPanel, FilterBar, PageHeader, Pagination, Select, Table, Tr, When } from '@/components/ui';
import Link from 'next/link';
import { DetailModal, CopyId } from '@/components/small-client';
import { DateField } from '@/components/date-field';
import { money, providerLabel } from '@/lib/format';
import { can } from '@/lib/roles';
import { env } from '@/lib/env';
import { PAGE_SIZE } from '@/lib/validation';
import { listPayments, paymentParams } from '../queries/payments';
import { polarLink } from '../state';
import type { RouteCtx } from '@/products/types';
import { PaymentStatus, ServerLink, TestBadge, base } from './shared';
import { guildInfoMap } from '@/lib/discord';
import { isTestGuild, str } from '../db';

export async function PaymentsPage({ searchParams, role }: RouteCtx) {
  const p = paymentParams.parse(searchParams);
  let data;
  try { data = await listPayments(p); } catch { return <ErrorPanel message="Could not load payments." retryHref={`${base}/payments`} />; }
  const path = `${base}/payments`;
  const infos = await guildInfoMap(data.rows.map((r) => str(r.guild_id)).filter((g): g is string => !!g));
  const keep = Object.fromEntries(Object.entries(p).filter(([k, v]) => k !== 'page' && v !== undefined).map(([k, v]) => [k, String(v)]));
  const qs = new URLSearchParams(keep).toString();
  const org = env().POLAR_DASHBOARD_ORG_SLUG;
  return (
    <>
      <PageHeader title="Payments" description="Ledger across Polar (card) and NOWPayments (crypto). Read only: refunds happen in the provider." updatedAt={new Date()}
        actions={can(role, 'export.csv') && <a className="btn" href={`/api/export/pulsenotify/payments${qs ? `?${qs}` : ''}`}>Export CSV</a>} />
      <FilterBar action={path}>
        <Select name="provider" label="Provider" value={p.provider} options={[['', 'All'], ['polar', 'Polar (card)'], ['nowpayments', 'NOWPayments']]} />
        <Select name="mode" label="Mode" value={p.mode} options={[['live', 'Live'], ['test', 'Test (sandbox)'], ['all', 'Live and test']]} />
        <Select name="status" label="Status" value={p.status} options={[['', 'All'], ['paid', 'Paid'], ['pending', 'Pending'], ['failed', 'Failed'], ['expired', 'Expired']]} />
        <DateField name="from" defaultValue={p.from} placeholder="From date" />
        <DateField name="to" defaultValue={p.to} placeholder="To date" />
        <input className="input w-24" type="number" step="0.01" name="min" placeholder="Min $" defaultValue={p.min} />
        <input className="input w-24" type="number" step="0.01" name="max" placeholder="Max $" defaultValue={p.max} />
      </FilterBar>
      {p.mode === 'test' && <p className="mb-3 rounded-lg bg-warning-soft px-4 py-3 text-warning" role="status">Sandbox payments from test servers. They are not real revenue and are left out of the Overview, MRR and live totals.</p>}
      {p.mode === 'live' && data.testCount > 0 && <p className="mb-3 text-muted">{data.testCount} sandbox payment{data.testCount === 1 ? '' : 's'} are hidden from this live view. <Link className="font-medium text-accent hover:underline" href={`${path}?mode=test`}>View sandbox payments</Link></p>}
      <p className="mb-3 text-sm text-muted">{p.mode === 'test' ? 'Sandbox' : 'Live'} paid total for this filter: <span className="num font-semibold text-ink">{money(p.mode === 'test' ? data.testPaidTotal : data.paidTotal)}</span>
        {p.mode === 'all' && data.testPaidTotal > 0 && <> · Sandbox paid: <span className="num font-semibold text-ink">{money(data.testPaidTotal)}</span>, not real revenue</>} · {data.total.toLocaleString('en-US')} rows</p>
      {data.rows.length === 0 ? <div className="card"><EmptyState title="No payments match" /></div> : (
        <Table label="Payments">
          <thead><tr><th className="th">Created</th><th className="th">Provider</th><th className="th">Server</th><th className="th">Months</th><th className="th text-right">Amount</th><th className="th">Status</th><th className="th">Paid</th><th className="th" /></tr></thead>
          <tbody>{data.rows.map((r, i) => {
            const gid = str(r.guild_id);
            const sub = gid ? data.subByGuild[gid] : null;
            const test = isTestGuild(gid);
            const polar = r.provider === 'polar' ? polarLink(sub, org, test) : null;
            return (
              <Tr key={i}>
                <td className="td"><When value={str(r.created_at)} /></td><td className="td">{providerLabel(str(r.provider))}</td>
                <td className="td">{gid ? <ServerLink id={gid} info={infos[gid]} showId={false} /> : '—'}</td>
                <td className="td num">{str(r.months)}</td><td className="td num text-right">{money(r.amount_usd as number)}</td>
                <td className="td"><div className="flex flex-wrap items-center gap-1"><PaymentStatus status={r.status} /><TestBadge guildId={gid} /></div></td><td className="td"><When value={str(r.paid_at)} /></td>
                <td className="td text-right">
                  <span className="inline-flex items-center gap-2">
                    {polar && <a className="inline-flex items-center gap-1 text-xs text-accent" href={polar} target="_blank" rel="noopener noreferrer">{test ? 'Polar sandbox' : 'Polar'} <ExternalLink className="h-3 w-3" aria-hidden /></a>}
                    <DetailModal trigger="Quick view" title="Payment details">
                      <div className="mb-4 flex items-center justify-between rounded-lg bg-subtle px-4 py-3">
                        <div>
                          <div className="num text-2xl font-semibold">{money(r.amount_usd as number)}</div>
                          <div className="text-xs text-muted">{str(r.months)} month{Number(r.months) === 1 ? '' : 's'} · {providerLabel(str(r.provider))}</div>
                        </div>
                        <PaymentStatus status={r.status} />
                      </div>
                      <dl className="divide-y divide-line text-sm">
                        <DetailRow label="Server">{gid ? <CopyId value={gid} /> : '—'}</DetailRow>
                        <DetailRow label="Created"><When value={str(r.created_at)} /></DetailRow>
                        <DetailRow label="Paid"><When value={str(r.paid_at)} /></DetailRow>
                        <DetailRow label="Provider reference">{str(r.external_id) ? <CopyId value={String(r.external_id)} mono={false} /> : '—'}</DetailRow>
                        <DetailRow label="Requested by">{str(r.requested_by) ? <CopyId value={String(r.requested_by)} /> : '—'}</DetailRow>
                        <DetailRow label="Channel">{str(r.channel_id) ? <CopyId value={String(r.channel_id)} /> : '—'}</DetailRow>
                      </dl>
                      {gid && <Link className="btn mt-4 w-full" href={`${base}/servers/${gid}`}>Open server</Link>}
                    </DetailModal>
                  </span>
                </td>
              </Tr>
            );
          })}</tbody>
        </Table>
      )}
      <Pagination base={path} params={keep} page={p.page} pageSize={PAGE_SIZE} total={data.total} />
    </>
  );
}
