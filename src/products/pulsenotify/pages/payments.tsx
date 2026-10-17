import { ExternalLink } from 'lucide-react';
import { EmptyState, ErrorPanel, FilterBar, PageHeader, Pagination, Select, Table, Tr, When } from '@/components/ui';
import { SideSheet, CopyId } from '@/components/small-client';
import { DateField } from '@/components/date-field';
import { money, providerLabel } from '@/lib/format';
import { can } from '@/lib/roles';
import { env } from '@/lib/env';
import { PAGE_SIZE } from '@/lib/validation';
import { listPayments, paymentParams } from '../queries/payments';
import { polarLink } from '../state';
import type { RouteCtx } from '@/products/types';
import { PaymentStatus, ServerLink, base } from './shared';
import { guildInfoMap } from '@/lib/discord';
import { str } from '../db';

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
        <Select name="status" label="Status" value={p.status} options={[['', 'All'], ['paid', 'Paid'], ['pending', 'Pending'], ['failed', 'Failed'], ['expired', 'Expired']]} />
        <DateField name="from" defaultValue={p.from} placeholder="From date" />
        <DateField name="to" defaultValue={p.to} placeholder="To date" />
        <input className="input w-24" type="number" step="0.01" name="min" placeholder="Min $" defaultValue={p.min} />
        <input className="input w-24" type="number" step="0.01" name="max" placeholder="Max $" defaultValue={p.max} />
      </FilterBar>
      <p className="mb-3 text-sm text-muted">Paid total for this filter: <span className="num font-semibold text-ink">{money(data.paidTotal)}</span> · {data.total.toLocaleString('en-US')} rows</p>
      {data.rows.length === 0 ? <div className="card"><EmptyState title="No payments match" /></div> : (
        <Table label="Payments">
          <thead><tr><th className="th">Created</th><th className="th">Provider</th><th className="th">Server</th><th className="th">Months</th><th className="th text-right">Amount</th><th className="th">Status</th><th className="th">Paid</th><th className="th" /></tr></thead>
          <tbody>{data.rows.map((r, i) => {
            const gid = str(r.guild_id);
            const sub = gid ? data.subByGuild[gid] : null;
            const polar = r.provider === 'polar' ? polarLink(sub, org) : null;
            return (
              <Tr key={i}>
                <td className="td"><When value={str(r.created_at)} /></td><td className="td">{providerLabel(str(r.provider))}</td>
                <td className="td">{gid ? <ServerLink id={gid} info={infos[gid]} showId={false} /> : '—'}</td>
                <td className="td num">{str(r.months)}</td><td className="td num text-right">{money(r.amount_usd as number)}</td>
                <td className="td"><PaymentStatus status={r.status} /></td><td className="td"><When value={str(r.paid_at)} /></td>
                <td className="td text-right">
                  <span className="inline-flex items-center gap-2">
                    {polar && <a className="inline-flex items-center gap-1 text-xs text-accent" href={polar} target="_blank" rel="noopener noreferrer">Polar <ExternalLink className="h-3 w-3" aria-hidden /></a>}
                    <SideSheet trigger="Quick view" title="Payment">
                      <dl className="space-y-2 text-sm">
                        <div><dt className="text-xs text-muted">Provider reference</dt><dd>{str(r.external_id) ? <CopyId value={String(r.external_id)} /> : '—'}</dd></div>
                        <div><dt className="text-xs text-muted">Requested by (Discord ID)</dt><dd>{str(r.requested_by) ? <CopyId value={String(r.requested_by)} /> : '—'}</dd></div>
                        <div><dt className="text-xs text-muted">Channel</dt><dd>{str(r.channel_id) ? <CopyId value={String(r.channel_id)} /> : '—'}</dd></div>
                        <div><dt className="text-xs text-muted">Amount / months</dt><dd className="num">{money(r.amount_usd as number)} · {str(r.months)} mo</dd></div>
                      </dl>
                    </SideSheet>
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
