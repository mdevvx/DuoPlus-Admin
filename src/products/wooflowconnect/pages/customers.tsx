import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Download } from 'lucide-react';
import { Badge, Card, Cell, EmptyState, FilterBar, KV, PageHeader, Pagination, Select, Table, Tr, When } from '@/components/ui';
import { ConfirmAction } from '@/components/confirm-action';
import { CopyId } from '@/components/small-client';
import { can } from '@/lib/roles';
import { int, sentence } from '@/lib/format';
import { writeAudit } from '@/lib/audit';
import { listParams } from '@/lib/validation';
import type { RouteCtx } from '@/products/types';
import { SLUG, b, cents, first, list, n, obj, s, totalOf, when, whenOf, wfcGet } from '../api';
import { supportAction } from '../actions';
import { PaymentRows, PlanBadge, StoreBadge, base, load, planOf } from './shared';

const PER = 50;
const STATES: [string, string][] = [['', 'All'], ['none', 'No plan'], ['ready', 'Ready'], ['trialing', 'Trialing'], ['active', 'Active'], ['past_due', 'Past due'], ['canceled', 'Canceled'], ['suspended', 'Suspended'], ['canceling', 'Canceling'], ['no_store', 'No store']];
const SORTS: [string, string][] = [['created', 'Joined'], ['seen', 'Last seen'], ['period', 'Period end'], ['paid', 'Total paid'], ['email', 'Email']];
const params = listParams.extend({
  state: z.enum(STATES.map(([v]) => v).filter(Boolean) as [string, ...string[]]).optional().catch(undefined),
  sort: z.enum(SORTS.map(([v]) => v) as [string, ...string[]]).optional().catch(undefined),
});

export async function CustomersPage({ searchParams }: RouteCtx) {
  const p = params.parse(searchParams);
  const path = `${base}/customers`;
  const r = await load(() => wfcGet('customers', { q: p.q, state: p.state, sort: p.sort, page: p.page, per: PER }), path);
  return (
    <>
      <PageHeader title="Customers" description="Everyone with a WooFlowConnect account, with their plan and activated store." updatedAt={new Date()}
        actions={<a className="btn" href={`/api/export/${SLUG}/users`}><Download className="h-4 w-4" aria-hidden /> Export CSV</a>} />
      <FilterBar action={path}>
        <input className="input w-64" name="q" placeholder="Email, domain or Store ID" defaultValue={p.q} />
        <Select name="state" label="Plan" value={p.state} options={STATES} />
        <Select name="sort" label="Sort" value={p.sort ?? 'created'} options={SORTS} />
      </FilterBar>
      {!r.ok ? r.panel : <CustomerTable data={r.data} p={p} path={path} />}
    </>
  );
}

function CustomerTable({ data, p, path }: { data: unknown; p: z.infer<typeof params>; path: string }) {
  const rows = list(data, 'customers', 'items', 'rows', 'data');
  return (
    <>
      {rows.length === 0 ? <div className="card"><EmptyState title="No customers match" /></div> : (
        <Table label="Customers">
          <thead><tr><th className="th">Customer</th><th className="th">Plan</th><th className="th">Store</th><th className="th">Last seen</th><th className="th text-right">Paid</th><th className="th">Joined</th><th className="th">Period end</th></tr></thead>
          <tbody>{rows.map((c, i) => {
            const id = first(c, 'id', 'user_id', 'customer_id');
            const email = s(c, 'email') ?? `Customer ${id}`;
            const hint = s(c, 'key_hint', 'key');
            const dl = n(c, 'downloads', 'download_count');
            return (
              <Tr key={String(id ?? i)}>
                <td className="td"><Cell max={240} text={email} href={id !== undefined ? `${path}/${encodeURIComponent(String(id))}` : undefined} sub={<>{hint && <span className="font-mono">{hint}</span>}{hint && ' · '}{int(dl)} download{dl === 1 ? '' : 's'}</>} /></td>
                <td className="td"><div className="flex flex-wrap gap-1"><PlanBadge state={planOf(c)} />{b(c, 'suspended') && <Badge tone="danger">Suspended</Badge>}</div></td>
                <td className="td"><Cell max={200} text={s(c, 'store_host', 'host', 'domain') ?? 'No store'} sub={s(c, 'plugin_version', 'version') ? `v${s(c, 'plugin_version', 'version')}` : undefined} /></td>
                <td className="td"><When value={whenOf(c, 'last_seen', 'seen_at', 'last_seen_at')} /></td>
                <td className="td num text-right">{cents(n(c, 'total_paid', 'paid', 'paid_cents'))}</td>
                <td className="td"><When value={whenOf(c, 'created_at', 'created', 'joined_at')} /></td>
                <td className="td"><When value={whenOf(c, 'period_end', 'current_period_end', 'period_ends_at')} /></td>
              </Tr>
            );
          })}</tbody>
        </Table>
      )}
      <Pagination base={path} params={{ q: p.q, state: p.state, sort: p.sort }} page={p.page} pageSize={PER} total={totalOf(data, rows.length, p.page, PER)} />
    </>
  );
}

const days = { name: 'days', label: 'Days (1 to 365)', type: 'number' as const, min: 1, max: 365 };

export async function CustomerDetailPage({ params: rp, role, admin }: RouteCtx) {
  const id = z.string().regex(/^[\w.@+-]{1,120}$/).safeParse(rp.id);
  if (!id.success) notFound();
  const query = id.data.includes('@') ? { email: id.data } : { id: id.data };
  const r = await load(() => wfcGet('customer', query), `${base}/customers`);
  if (!r.ok) return r.panel;
  const raw = obj(r.data);
  const c = obj(first(raw, 'customer', 'user') ?? raw);
  const cid = String(first(c, 'id', 'user_id') ?? id.data);
  await writeAudit({ admin_id: admin.id, admin_email: admin.email, product_slug: SLUG, action: 'view.customer', target_type: 'customer', target_id: cid });

  const keys = list(first(raw, 'keys') ?? first(c, 'keys'), 'keys');
  const stores = list(first(raw, 'stores') ?? first(c, 'stores'), 'stores');
  const payments = list(first(raw, 'payments') ?? first(c, 'payments'), 'payments');
  const downloads = list(first(raw, 'downloads') ?? first(c, 'downloads'), 'downloads');
  const timeline = list(first(raw, 'timeline', 'events') ?? first(c, 'timeline', 'events'), 'timeline');
  const notes = list(first(raw, 'notes') ?? first(c, 'notes'), 'notes');
  const diag = first(raw, 'diagnosis', 'diagnostics') ?? first(c, 'diagnosis', 'diagnostics');
  const diagnosis = (Array.isArray(diag) ? diag : diag ? [diag] : []).map((d) => (typeof d === 'string' ? d : s(obj(d), 'message', 'text') ?? '')).filter(Boolean);
  const suspended = b(c, 'suspended'), canceling = b(c, 'canceling', 'cancel_at_period_end');
  const hidden = { id: cid };
  const act = can(role, 'support.act'), danger = can(role, 'support.danger');
  const ready = stores.find((x) => !b(x, 'released'));

  return (
    <>
      <PageHeader title={s(c, 'email') ?? `Customer ${cid}`} description="Customer detail. Viewing this page is audit-logged." updatedAt={new Date()} />
      {(act || danger) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {act && <ConfirmAction label="Grant days" title="Grant free days" description="Adds days to the customer's current period." action={supportAction} hidden={{ ...hidden, op: 'grant_days' }} fields={[days]} />}
          {act && (suspended
            ? <ConfirmAction label="Unsuspend" title="Unsuspend customer" action={supportAction} hidden={{ ...hidden, op: 'unsuspend' }} />
            : danger && <ConfirmAction label="Suspend" danger title="Suspend customer" description="Their plugin is locked at the next check-in." action={supportAction} hidden={{ ...hidden, op: 'suspend' }} />)}
          {act && (canceling && <ConfirmAction label="Resume plan" title="Resume plan" action={supportAction} hidden={{ ...hidden, op: 'resume' }} />)}
          {act && !canceling && <ConfirmAction label="Cancel at period end" title="Cancel at period end" action={supportAction} hidden={{ ...hidden, op: 'cancel_end' }} />}
          {danger && <ConfirmAction label="Cancel now" danger title="Cancel plan immediately" action={supportAction} hidden={{ ...hidden, op: 'cancel_now' }} />}
          {act && <ConfirmAction label="Log out" title="Log customer out of the website" action={supportAction} hidden={{ ...hidden, op: 'logout_user' }} />}
          {danger && <ConfirmAction label="Release store" danger title="Release store" description="Frees the licence so it can be activated on another store." action={supportAction} hidden={{ ...hidden, op: 'release_store' }} />}
          {danger && <ConfirmAction label="Revoke keys" danger title="Revoke all licence keys" description="The plugin stops working until the customer generates a new key." action={supportAction} hidden={{ ...hidden, op: 'revoke_keys' }} />}
          {act && ready && <ConfirmAction label="Set store label" title="Set store label" action={supportAction} hidden={{ ...hidden, op: 'set_label', ref: s(ready, 'ref', 'store_id', 'id') ?? '' }}
            fields={[{ name: 'label', label: 'Label', placeholder: 'e.g. Main shop' }]} />}
          {act && <ConfirmAction label="Add note" title="Add support note" action={supportAction} hidden={{ ...hidden, op: 'add_note' }} fields={[{ name: 'note', label: 'Note' }]} />}
        </div>
      )}

      {diagnosis.length > 0 && (
        <div className="mb-4 space-y-2">{diagnosis.map((d, i) => <p key={i} className="rounded bg-warning-soft px-3 py-2 text-warning" role="status">{d}</p>)}</div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-4">
        <Card title="Plan">
          <KV items={[
            ['Plan', <span key="p" className="flex flex-wrap gap-1"><PlanBadge state={planOf(c)} />{suspended && <Badge tone="danger">Suspended</Badge>}{canceling && <Badge tone="warning">Cancels at period end</Badge>}</span>],
            ['Trial ends', <When key="t" value={whenOf(c, 'trial_end', 'trial_ends_at')} />],
            ['Period ends', <When key="e" value={whenOf(c, 'period_end', 'current_period_end', 'period_ends_at')} />],
            ['Joined', <When key="j" value={whenOf(c, 'created_at', 'created', 'joined_at')} />],
          ]} />
        </Card>
        <Card title="Summary">
          <KV items={[
            ['Customer ID', <CopyId key="i" value={cid} />],
            ['Total paid', cents(n(c, 'total_paid', 'paid', 'paid_cents') || payments.filter((p) => ['paid', 'succeeded'].includes((s(p, 'status') ?? '').toLowerCase())).reduce((a, p) => a + n(p, 'amount', 'amount_cents', 'cents'), 0))],
            ['Stores', int(stores.length)], ['Downloads', int(downloads.length || n(c, 'downloads'))],
          ]} />
        </Card>
      </div>

      <div className="grid gap-4">
        <Card title="Licence keys">
          {keys.length === 0 ? <EmptyState compact title="No keys" /> : (
            <ul className="divide-y divide-line">{keys.map((k, i) => (
              <li key={i} className="flex items-center justify-between py-2"><span className="font-mono text-xs">{s(k, 'hint', 'key_hint', 'key')}</span>
                <span className="flex items-center gap-3 text-xs text-muted"><When value={whenOf(k, 'created_at', 'created')} />{b(k, 'revoked') ? <Badge tone="danger">Revoked</Badge> : <Badge tone="success">Active</Badge>}</span></li>
            ))}</ul>
          )}
        </Card>
        <Card title="Stores">
          {stores.length === 0 ? <EmptyState compact title="No store activated" /> : (
            <table className="w-full border-collapse text-sm" aria-label="Stores">
              <thead><tr><th className="th">Store</th><th className="th">Label</th><th className="th">State</th><th className="th">First seen</th><th className="th">Last seen</th><th className="th">Version</th></tr></thead>
              <tbody>{stores.map((x, i) => (
                <Tr key={i}>
                  <td className="td"><Cell max={240} text={s(x, 'host', 'domain')} sub={<span className="font-mono">{s(x, 'ref', 'store_id', 'id')}</span>} /></td>
                  <td className="td"><Cell max={140} text={s(x, 'label')} /></td>
                  <td className="td"><StoreBadge state={b(x, 'released') ? 'released' : s(x, 'state', 'status')} /></td>
                  <td className="td"><When value={whenOf(x, 'first_seen', 'first_seen_at')} /></td><td className="td"><When value={whenOf(x, 'last_seen', 'last_seen_at')} /></td>
                  <td className="td num">{s(x, 'plugin_version', 'version') ?? '—'}</td>
                </Tr>
              ))}</tbody>
            </table>
          )}
        </Card>
        <Card title="Payments"><PaymentRows rows={payments} /></Card>
        <div className="grid grid-cols-2 gap-4">
          <Card title="Downloads">
            {downloads.length === 0 ? <EmptyState compact title="No downloads" /> : (
              <ul className="divide-y divide-line">{downloads.slice(0, 20).map((d, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2"><When value={whenOf(d, 'at', 'created_at', 'ts')} /><span className="min-w-0 truncate text-xs text-muted">{s(d, 'ip')} · {s(d, 'browser', 'user_agent', 'ua')}</span></li>
              ))}</ul>
            )}
          </Card>
          <Card title="Notes">
            {notes.length === 0 ? <EmptyState compact title="No notes" /> : (
              <ul className="divide-y divide-line">{notes.map((x, i) => (
                <li key={i} className="py-2"><div>{s(x, 'note', 'text', 'body')}</div><div className="mt-0.5 text-xs text-muted">{s(x, 'by', 'author', 'admin')} · {when(first(x, 'at', 'created_at'))?.toISOString().slice(0, 16).replace('T', ' ')}</div></li>
              ))}</ul>
            )}
          </Card>
        </div>
        <Card title="Timeline">
          {timeline.length === 0 ? <EmptyState compact title="No events yet" /> : (
            <ul className="divide-y divide-line">{timeline.map((e, i) => (
              <li key={i} className="flex items-center justify-between gap-4 py-2"><span><b className="font-medium">{sentence(s(e, 'event', 'type', 'action'))}</b> <span className="text-muted">{s(e, 'detail', 'message') ?? ''}</span></span><When value={whenOf(e, 'at', 'created_at', 'ts')} /></li>
            ))}</ul>
          )}
        </Card>
      </div>
    </>
  );
}
