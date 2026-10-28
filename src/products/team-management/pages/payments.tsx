import { z } from 'zod';
import { ExternalLink } from 'lucide-react';
import { Badge, Card, Cell, DetailRow, EmptyState, ErrorPanel, PageHeader, Pagination, Stat, Table, Tr, When, type Tone } from '@/components/ui';
import { CopyId, DetailModal } from '@/components/small-client';
import { Filters } from '@/components/filters';
import { Notice } from '@/components/form';
import { RefreshButton } from '@/components/refresh-button';
import { can } from '@/lib/roles';
import { money, int } from '@/lib/format';
import { PAGE_SIZE, csvEnum, splitCsv } from '@/lib/validation';
import type { RouteCtx } from '@/products/types';
import { PLAN_LABEL, polarLink } from '../api';
import { PLAN_NAMES, REASON_LABEL, STATUS_LABEL, filterPayments, totals, type PaymentRow } from '../payments';
import { describePolar, listPayments, polarEnv, polarPaymentsConfigured } from '../polar';
import { base } from './shared';

const params = z.object({
  page: z.coerce.number().int().min(1).max(100000).catch(1),
  q: z.string().trim().max(100).optional().catch(undefined),
  plan: csvEnum(PLAN_NAMES),
  status: csvEnum(['paid', 'pending', 'refunded', 'partially_refunded']),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  min: z.coerce.number().min(0).max(1e7).optional().catch(undefined),
  max: z.coerce.number().min(0).max(1e7).optional().catch(undefined),
});

const TONE: Record<string, Tone> = { paid: 'success', pending: 'warning', refunded: 'neutral', partially_refunded: 'warning' };
/** Polar amounts are in cents; other currencies are shown with their code rather than guessed as dollars. */
const amountOf = (r: PaymentRow, v = r.amount) => (r.currency === 'usd' ? money(v / 100) : `${(v / 100).toFixed(2)} ${r.currency.toUpperCase()}`);

export async function PaymentsPage({ role, searchParams }: RouteCtx) {
  const p = params.parse(searchParams);
  const path = `${base}/payments`;
  const org = polarLink();
  if (!polarPaymentsConfigured()) {
    return (
      <>
        <PageHeader title="Payments" description="Orders for the Starter, Growth and Scale plans, read from Polar." />
        <Card><EmptyState title="Polar is not connected for payments" hint="Add TMS_POLAR_ACCESS_TOKEN (a Polar token with order read access, from the same Polar environment as the Donexel) and redeploy." /></Card>
      </>
    );
  }

  let all: Awaited<ReturnType<typeof listPayments>>;
  try { all = await listPayments(); } catch (e) { return <ErrorPanel message={describePolar(e)} retryHref={path} />; }

  const filters = { q: p.q, plan: splitCsv(p.plan), status: splitCsv(p.status), from: p.from, to: p.to, min: p.min, max: p.max };
  const rows = filterPayments(all.rows, filters);
  const t = totals(rows);
  const view = rows.slice((p.page - 1) * PAGE_SIZE, p.page * PAGE_SIZE);
  const keep = Object.fromEntries(Object.entries(p).filter(([k, v]) => k !== 'page' && v !== undefined).map(([k, v]) => [k, String(v)]));
  const qs = new URLSearchParams(keep).toString();

  return (
    <>
      <PageHeader title="Payments" description="Orders for the Starter, Growth and Scale plans, read from Polar. Refunds and receipts happen in Polar." updatedAt={new Date()}
        actions={<>
          <RefreshButton className="btn" />
          {can(role, 'export.csv') && <a className="btn" href={`/api/export/team-management/payments${qs ? `?${qs}` : ''}`}>Export CSV</a>}
          <a className="btn" href={org} target="_blank" rel="noopener noreferrer">Open Polar <ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>
        </>} />

      <Filters action={path} fields={[
        { type: 'search', key: 'q', label: 'Search', placeholder: 'Search by email, name or order ID' },
        { type: 'multi', key: 'plan', label: 'Plan', options: PLAN_NAMES.map((n): [string, string] => [n, PLAN_LABEL[n] ?? n]) },
        { type: 'multi', key: 'status', label: 'Status', options: Object.entries(STATUS_LABEL) as [string, string][] },
        { type: 'daterange', key: 'date', label: 'Date', fromKey: 'from', toKey: 'to' },
        { type: 'numrange', key: 'amount', label: 'Amount', minKey: 'min', maxKey: 'max', prefix: '$' },
      ]} />

      <div className="mb-5 grid max-w-4xl grid-cols-2 gap-4 lg:grid-cols-4">
        <Card><Stat label="Collected" value={money(t.gross / 100)} hint="before refunds" /></Card>
        <Card><Stat label="Refunded" value={money(t.refunded / 100)} /></Card>
        <Card><Stat label="Net" value={money(t.net / 100)} /></Card>
        <Card><Stat label="Orders" value={int(t.orders)} /></Card>
      </div>
      {!all.byProductIds && <div className="mb-4"><Notice tone="info">Plans are recognised by product name (Starter, Growth, Scale). Set TMS_POLAR_PRODUCT_IDS to match them exactly.</Notice></div>}
      {all.rows.length >= 500 && <p className="mb-3 text-xs text-muted">Showing the latest 500 orders from Polar. Use Polar for older history.</p>}

      {rows.length === 0 ? <div className="card"><EmptyState title={all.rows.length === 0 ? 'No orders yet' : 'No payments match'} hint={all.rows.length === 0 ? `Nothing in Polar ${polarEnv() === 'sandbox' ? 'sandbox' : 'live'} for these plans.` : 'Change or reset the filters.'} /></div> : (
        <>
          <Table label="Payments">
            <thead><tr>{['Date', 'Customer', 'Plan', 'Amount', 'Status', ''].map((h, i) => <th key={i} className={i === 3 ? 'th text-right' : 'th'}>{h}</th>)}</tr></thead>
            <tbody>{view.map((r) => (
              <Tr key={r.id}>
                <td className="td whitespace-nowrap"><When value={r.createdAt || null} /></td>
                <td className="td"><Cell text={r.email || '—'} sub={r.name || undefined} max={240} /></td>
                <td className="td"><Cell text={r.plan ? PLAN_LABEL[r.plan] : r.productName || '—'} sub={REASON_LABEL[r.reason] ?? undefined} max={180} /></td>
                <td className="td num whitespace-nowrap text-right"><div>{amountOf(r)}</div>{r.refunded > 0 && <div className="text-xs text-muted">refunded {amountOf(r, r.refunded)}</div>}</td>
                <td className="td whitespace-nowrap"><Badge tone={TONE[r.status] ?? 'neutral'}>{STATUS_LABEL[r.status] ?? r.status}</Badge></td>
                <td className="td whitespace-nowrap text-right">
                  <DetailModal trigger="Details" title="Payment details">
                    <dl className="divide-y divide-line text-sm">
                      <DetailRow label="Customer">{r.email || '—'}{r.name ? ` · ${r.name}` : ''}</DetailRow>
                      <DetailRow label="Plan">{r.plan ? PLAN_LABEL[r.plan] : r.productName || '—'}</DetailRow>
                      <DetailRow label="Reason">{REASON_LABEL[r.reason] ?? (r.reason || '—')}</DetailRow>
                      <DetailRow label="Amount">{amountOf(r)}</DetailRow>
                      <DetailRow label="Refunded">{r.refunded > 0 ? amountOf(r, r.refunded) : '—'}</DetailRow>
                      <DetailRow label="Status">{STATUS_LABEL[r.status] ?? r.status}</DetailRow>
                      <DetailRow label="Created"><When value={r.createdAt || null} /></DetailRow>
                      <DetailRow label="Order ID"><CopyId value={r.id} /></DetailRow>
                      <DetailRow label="App user ID">{r.externalId ? <CopyId value={r.externalId} /> : '—'}</DetailRow>
                      <DetailRow label="Invoice">{r.invoice || '—'}</DetailRow>
                      <DetailRow label="Polar">
                        <a className="inline-flex items-center gap-1 text-accent hover:underline" href={r.subscriptionId ? `${org.replace(/\/sales$/, '')}/sales/subscriptions/${encodeURIComponent(r.subscriptionId)}` : org} target="_blank" rel="noopener noreferrer">
                          {r.subscriptionId ? 'Open the subscription' : 'Open sales'} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        </a>
                      </DetailRow>
                    </dl>
                  </DetailModal>
                </td>
              </Tr>
            ))}</tbody>
          </Table>
          <Pagination base={path} params={keep} page={p.page} pageSize={PAGE_SIZE} total={rows.length} />
        </>
      )}
    </>
  );
}
