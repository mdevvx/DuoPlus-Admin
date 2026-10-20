import { z } from 'zod';
import { Download, ExternalLink } from 'lucide-react';
import { Badge, Card, Cell, EmptyState, FilterBar, PageHeader, Pagination, Select, Stat, Table, Tr, When } from '@/components/ui';
import { AuditTable } from '@/components/audit-table';
import { DateField } from '@/components/date-field';
import { env } from '@/lib/env';
import { int, sentence } from '@/lib/format';
import { PAGE_SIZE, listParams } from '@/lib/validation';
import { auditFilters, queryAudit } from '@/lib/audit-query';
import type { RouteCtx } from '@/products/types';
import { SLUG, b, cents, first, list, n, obj, s, totalOf, whenOf, wfcGet, type J } from '../api';
import { ClampText } from '@/components/small-client';
import { CustomerLink, PAYMENT_TONE, PlanBadge, StoreBadge, base, load, planOf } from './shared';

const PER = 50;
const exportBtn = (what: string) => <a className="btn" href={`/api/export/${SLUG}/${what}`}><Download className="h-4 w-4" aria-hidden /> Export CSV</a>;
const idOf = (r: J) => first(r, 'customer_id', 'user_id', 'owner_id');

// ------------------------------------------------------------------ stores
const STORE_STATES: [string, string][] = [['', 'All'], ['online', 'Online'], ['quiet', 'Quiet'], ['stale', 'Stale'], ['released', 'Released']];
export async function StoresPage({ searchParams }: RouteCtx) {
  const p = listParams.extend({ state: z.enum(['online', 'quiet', 'stale', 'released']).optional().catch(undefined) }).parse(searchParams);
  const path = `${base}/stores`;
  const r = await load(() => wfcGet('stores', { q: p.q, state: p.state, page: p.page, per: PER }), path);
  return (
    <>
      <PageHeader title="Stores" description="WooCommerce stores activated with a licence. Online means a check-in within 30 hours, quiet up to 3 days, stale after that." updatedAt={new Date()} actions={exportBtn('stores')} />
      <FilterBar action={path}>
        <input className="input w-64" name="q" placeholder="Domain, Store ID or owner email" defaultValue={p.q} />
        <Select name="state" label="State" value={p.state} options={STORE_STATES} />
      </FilterBar>
      {!r.ok ? r.panel : (() => {
        const rows = list(r.data, 'stores', 'items', 'rows', 'data');
        return (
          <>
            {rows.length === 0 ? <div className="card"><EmptyState title="No stores match" /></div> : (
              <Table label="Stores">
                <thead><tr><th className="th">Store</th><th className="th">Owner</th><th className="th">Plan</th><th className="th">State</th><th className="th">Last seen</th><th className="th">Version</th><th className="th">Label</th></tr></thead>
                <tbody>{rows.map((x, i) => (
                  <Tr key={i}>
                    <td className="td"><Cell max={240} text={s(x, 'host', 'domain')} sub={<span className="font-mono">{s(x, 'ref', 'store_id', 'id')}</span>} /></td>
                    <td className="td"><CustomerLink id={idOf(x)} label={s(x, 'email', 'owner_email', 'owner') ?? '—'} /></td>
                    <td className="td"><PlanBadge state={planOf(x)} /></td>
                    <td className="td"><StoreBadge state={b(x, 'released') ? 'released' : s(x, 'state', 'store_state', 'status')} /></td>
                    <td className="td"><When value={whenOf(x, 'last_seen', 'last_seen_at')} /></td>
                    <td className="td num">{s(x, 'plugin_version', 'version') ?? '—'}</td><td className="td"><Cell max={140} text={s(x, 'label')} /></td>
                  </Tr>
                ))}</tbody>
              </Table>
            )}
            <Pagination base={path} params={{ q: p.q, state: p.state }} page={p.page} pageSize={PER} total={totalOf(r.data, rows.length, p.page, PER)} />
          </>
        );
      })()}
    </>
  );
}

// ---------------------------------------------------------------- payments
export async function PaymentsPage({ searchParams }: RouteCtx) {
  const p = listParams.extend({ status: z.enum(['paid', 'failed']).optional().catch(undefined) }).parse(searchParams);
  const path = `${base}/payments`;
  const r = await load(() => wfcGet('payments', { status: p.status, q: p.q, page: p.page, per: PER }), path);
  const org = env().WFC_POLAR_ORG_SLUG ?? env().POLAR_DASHBOARD_ORG_SLUG;
  return (
    <>
      <PageHeader title="Payments" description="Payments recorded by the licence server. Billing runs through Polar." updatedAt={new Date()}
        actions={<>
          <a className="btn" href={org ? `https://polar.sh/dashboard/${org}/sales` : 'https://polar.sh/dashboard'} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" aria-hidden /> Open Polar</a>
          {exportBtn('payments')}
        </>} />
      <FilterBar action={path}>
        <input className="input w-64" name="q" placeholder="Customer email or reference" defaultValue={p.q} />
        <Select name="status" label="Status" value={p.status} options={[['', 'All'], ['paid', 'Paid'], ['failed', 'Failed']]} />
      </FilterBar>
      {!r.ok ? r.panel : (() => {
        const rows = list(r.data, 'payments', 'items', 'rows', 'data');
        const total = first(obj(r.data), 'total_paid', 'paid_total', 'sum_cents');
        return (
          <>
            <div className="mb-4 grid grid-cols-3 gap-5">
              <div className="card p-5"><Stat label="Total paid (this filter)" value={total !== undefined ? cents(total) : '—'} icon="payments" /></div>
              <div className="card p-5"><Stat label="Payments in view" value={int(rows.length)} icon="subscriptions" /></div>
              <div className="card p-5"><Stat label="Failed in view" value={int(rows.filter((x) => PAYMENT_TONE(s(x, 'status')) === 'danger').length)} icon="health" /></div>
            </div>
            {rows.length === 0 ? <div className="card"><EmptyState title="No payments match" /></div> : (
              <Table label="Payments">
                <thead><tr><th className="th">Date</th><th className="th">Customer</th><th className="th">Kind</th><th className="th">Status</th><th className="th text-right">Amount</th></tr></thead>
                <tbody>{rows.map((x, i) => (
                  <Tr key={i}>
                    <td className="td"><When value={whenOf(x, 'at', 'created_at', 'date', 'ts')} /></td>
                    <td className="td"><CustomerLink id={idOf(x)} label={s(x, 'email', 'customer_email', 'customer') ?? '—'} /></td>
                    <td className="td">{sentence(s(x, 'kind', 'type'))}</td>
                    <td className="td"><Badge tone={PAYMENT_TONE(s(x, 'status'))}>{sentence(s(x, 'status'))}</Badge></td>
                    <td className="td num text-right">{cents(n(x, 'amount', 'amount_cents', 'cents'))}</td>
                  </Tr>
                ))}</tbody>
              </Table>
            )}
            <Pagination base={path} params={{ q: p.q, status: p.status }} page={p.page} pageSize={PER} total={totalOf(r.data, rows.length, p.page, PER)} />
          </>
        );
      })()}
    </>
  );
}

// --------------------------------------------------------------- downloads
export async function DownloadsPage({ searchParams }: RouteCtx) {
  const p = listParams.parse(searchParams);
  const path = `${base}/downloads`;
  const r = await load(() => wfcGet('downloads', { q: p.q, page: p.page, per: PER }), path);
  return (
    <>
      <PageHeader title="Downloads" description="Every plugin download, with who and from where." updatedAt={new Date()} actions={exportBtn('downloads')} />
      <FilterBar action={path}><input className="input w-64" name="q" placeholder="Email, IP or browser" defaultValue={p.q} /></FilterBar>
      {!r.ok ? r.panel : (() => {
        const rows = list(r.data, 'downloads', 'items', 'rows', 'data');
        const unique = first(obj(r.data), 'unique', 'unique_downloaders', 'unique_users');
        return (
          <>
            {unique !== undefined && <p className="mb-3 text-muted">{int(Number(unique))} unique downloaders</p>}
            {rows.length === 0 ? <div className="card"><EmptyState title="No downloads match" /></div> : (
              <Table label="Downloads">
                <thead><tr><th className="th">Date</th><th className="th">Customer</th><th className="th">IP</th><th className="th">Browser</th></tr></thead>
                <tbody>{rows.map((x, i) => (
                  <Tr key={i}>
                    <td className="td"><When value={whenOf(x, 'at', 'created_at', 'ts')} /></td>
                    <td className="td"><CustomerLink id={idOf(x)} label={s(x, 'email', 'customer_email') ?? 'Not signed in'} /></td>
                    <td className="td"><Cell max={140} mono text={s(x, 'ip')} /></td><td className="td"><Cell max={360} text={s(x, 'browser', 'user_agent', 'ua')} /></td>
                  </Tr>
                ))}</tbody>
              </Table>
            )}
            <Pagination base={path} params={{ q: p.q }} page={p.page} pageSize={PER} total={totalOf(r.data, rows.length, p.page, PER)} />
          </>
        );
      })()}
    </>
  );
}

// ---------------------------------------------------------------- activity
const eventTone = (e: string) => (/fail|refus|revoke|suspend/.test(e) ? 'danger' : /cancel|quiet|stale/.test(e) ? 'warning' : /activat|charge|signup|paid/.test(e) ? 'success' : 'neutral') as 'danger' | 'warning' | 'success' | 'neutral';
export async function ActivityPage({ searchParams }: RouteCtx) {
  const p = listParams.extend({ event: z.string().max(40).optional().catch(undefined) }).parse(searchParams);
  const path = `${base}/activity`;
  const r = await load(() => wfcGet('activity', { event: p.event, q: p.q, page: p.page, per: PER }), path);
  return (
    <>
      <PageHeader title="Activity" description="Activations, charges, charge failures, refusals and admin actions." updatedAt={new Date()} />
      <FilterBar action={path}>
        <input className="input w-44" name="event" placeholder="Event, e.g. charge" defaultValue={p.event} />
        <input className="input w-64" name="q" placeholder="Email or detail" defaultValue={p.q} />
      </FilterBar>
      {!r.ok ? r.panel : (() => {
        const rows = list(r.data, 'activity', 'events', 'items', 'rows', 'data');
        return (
          <>
            {rows.length === 0 ? <div className="card"><EmptyState title="No activity matches" /></div> : (
              <Table label="Activity">
                <thead><tr><th className="th">Time</th><th className="th">Event</th><th className="th">Customer</th><th className="th">Detail</th></tr></thead>
                <tbody>{rows.map((x, i) => {
                  const ev = s(x, 'event', 'type', 'action') ?? '';
                  return (
                    <Tr key={i}>
                      <td className="td"><When value={whenOf(x, 'at', 'created_at', 'ts')} /></td>
                      <td className="td"><Badge tone={eventTone(ev.toLowerCase())}>{sentence(ev)}</Badge></td>
                      <td className="td"><CustomerLink id={idOf(x)} label={s(x, 'email', 'customer_email') ?? '—'} /></td>
                      <td className="td">{s(x, 'detail', 'message', 'meta') ? <ClampText text={s(x, 'detail', 'message', 'meta')!} title="Event detail" max={60} /> : '—'}</td>
                    </Tr>
                  );
                })}</tbody>
              </Table>
            )}
            <Pagination base={path} params={{ event: p.event, q: p.q }} page={p.page} pageSize={PER} total={totalOf(r.data, rows.length, p.page, PER)} />
          </>
        );
      })()}
    </>
  );
}

// ------------------------------------------------------------------ lookup
export async function LookupPage({ searchParams }: RouteCtx) {
  const q = (searchParams.q ?? '').trim().slice(0, 100);
  const path = `${base}/lookup`;
  const r = q.length >= 2 ? await load(() => wfcGet('lookup', { q }), path) : null;
  return (
    <>
      <PageHeader title="Support lookup" description="Paste an email, Store ID, domain or licence key hint to find the customer." />
      <FilterBar action={path}><input className="input w-96" name="q" placeholder="Email, WFS-XXXX-XXXX, domain or key hint" defaultValue={q} autoFocus /></FilterBar>
      {r === null ? <div className="card"><EmptyState title="Search for a customer" hint="Type at least 2 characters." /></div>
        : !r.ok ? r.panel : (() => {
          const rows = list(r.data, 'results', 'matches', 'customers', 'items');
          return rows.length === 0 ? <div className="card"><EmptyState title="No match" hint="Check the spelling or try the domain." /></div> : (
            <Card>
              <ul className="divide-y divide-line">{rows.map((x, i) => (
                <li key={i} className="flex items-center justify-between gap-4 py-2.5">
                  <span className="min-w-0"><CustomerLink id={first(x, 'id', 'customer_id', 'user_id')} label={s(x, 'email') ?? 'Customer'} /><span className="ml-2 text-muted">{s(x, 'match', 'host', 'domain', 'ref', 'key_hint')}</span></span>
                  <PlanBadge state={planOf(x)} />
                </li>
              ))}</ul>
            </Card>
          );
        })()}
    </>
  );
}

// ------------------------------------------------------------------- audit
export async function AuditPage({ searchParams }: RouteCtx) {
  const f = auditFilters.parse(searchParams);
  const { rows, total } = await queryAudit(f, { product: SLUG });
  const params = { action: f.action, admin: f.admin, target: f.target, from: f.from, to: f.to };
  return (
    <>
      <PageHeader title="Audit" description="Admin actions on this product: customer views, support actions, exports and branding." updatedAt={new Date()} />
      <FilterBar action={`${base}/audit`}>
        <input className="input w-44" name="action" placeholder="Action prefix" defaultValue={f.action} />
        <input className="input w-52" name="admin" placeholder="Admin email contains" defaultValue={f.admin} />
        <input className="input w-44" name="target" placeholder="Customer ID" defaultValue={f.target} />
        <DateField name="from" defaultValue={f.from} placeholder="From date" />
        <DateField name="to" defaultValue={f.to} placeholder="To date" />
      </FilterBar>
      <AuditTable rows={rows} showProduct={false} />
      <Pagination base={`${base}/audit`} params={params} page={f.page} pageSize={PAGE_SIZE} total={total} />
    </>
  );
}
