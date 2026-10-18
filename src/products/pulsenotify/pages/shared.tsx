import Link from 'next/link';
import { Badge, EmptyState, Table, Tr } from '@/components/ui';
import { ClampText, CopyId } from '@/components/small-client';
import { ServerIdentity } from '@/components/server-avatar';
import type { GuildInfo } from '@/lib/discord';
import { dateTime, money, platformLabel, providerLabel, sentence, statusTone } from '@/lib/format';
import { STATE_LABEL, subscriptionState } from '../state';
import { pick, str, type Row } from '../db';
import { SLUG } from '../db';

export const base = `/p/${SLUG}`;

export function StateBadge({ billing, botPresent }: { billing: Row; botPresent: boolean | null | undefined }) {
  const s = subscriptionState({
    trial_ends_at: str(billing.trial_ends_at), paid_until: str(billing.paid_until), whitelisted: billing.whitelisted as boolean,
    card_subscription_id: str(billing.card_subscription_id), card_status: str(billing.card_status),
  }, botPresent);
  return <Badge tone={STATE_LABEL[s].tone}>{STATE_LABEL[s].label}</Badge>;
}

export function PaymentStatus({ status }: { status: unknown }) {
  const s = String(status ?? '');
  return <Badge tone={s === 'paid' ? 'success' : s === 'pending' ? 'warning' : s === 'failed' ? 'danger' : 'neutral'}>{sentence(s)}</Badge>;
}

export function PaymentsMini({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return <EmptyState title="No payments" />;
  return (
    <Table label="Payments" bare>
      <thead><tr><th className="th">Date</th><th className="th">Provider</th><th className="th">Months</th><th className="th text-right">Amount</th><th className="th">Status</th></tr></thead>
      <tbody>{rows.map((p, i) => (
        <Tr key={i}>
          <td className="td num">{dateTime(str(p.paid_at ?? p.created_at))}</td><td className="td">{providerLabel(str(p.provider))}</td>
          <td className="td num">{str(p.months)}</td><td className="td num text-right">{money(p.amount_usd as number)}</td><td className="td"><PaymentStatus status={p.status} /></td>
        </Tr>
      ))}</tbody>
    </Table>
  );
}

const DM_KIND: Record<string, string> = {
  checkout_abandoned: 'Unfinished checkout', payment_success: 'Payment received', payment_failed: 'Payment failed',
  card_cancelling: 'Card cancelling', card_ended: 'Card subscription ended', expiry_reminder: 'Upgrade reminder',
};
export const dmKindLabel = (k: unknown) => DM_KIND[String(k)] ?? sentence(String(k ?? ''));

export function DmStatus({ status }: { status: unknown }) {
  const s = String(status ?? '');
  return s === 'sent' ? <Badge tone="success">Sent</Badge> : s === 'dm_closed' ? <Badge tone="warning">DMs closed</Badge> : <Badge tone="danger">Failed</Badge>;
}

export function ChannelsMini({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return <EmptyState compact title="No notification channels" />;
  return (
    <Table label="Notification channels" bare>
      <thead><tr><th className="th">Name</th><th className="th">Channel ID</th><th className="th">Status</th><th className="th">Added</th></tr></thead>
      <tbody>{rows.map((c, i) => (
        <Tr key={i}>
          <td className="td font-medium">{str(c.name) ?? '—'}</td>
          <td className="td">{c.channel_id ? <CopyId value={String(c.channel_id)} /> : '—'}</td>
          <td className="td">{c.is_valid === false ? <Badge tone="danger">Invalid</Badge> : <Badge tone="success">Valid</Badge>}</td>
          <td className="td num whitespace-nowrap">{dateTime(str(c.created_at))}</td>
        </Tr>
      ))}</tbody>
    </Table>
  );
}

export function ServerLink({ id, info, showId = true }: { id: string; info?: GuildInfo | null; showId?: boolean }) {
  return (
    <ServerIdentity id={id} info={info} size={28} showId={showId}
      link={<Link className="text-accent hover:underline" data-row-link href={`${base}/servers/${id}`}>{info?.name ?? `Server …${id.slice(-6)}`}</Link>} />
  );
}

const SKIP = /(token|secret|password|settings|payload|webhook|key)/i;
/** Renders rows of a table whose columns we only know at runtime: scalar columns, no secrets, IDs copyable. */
export function GenericRows({ rows, prefer = [], label, max = 7, compact }: { rows: Row[]; prefer?: string[]; label: string; max?: number; compact?: boolean }) {
  if (rows.length === 0) return <EmptyState compact={compact} title={`No ${label.toLowerCase()}`} />;
  const all = Object.keys(rows[0]!).filter((k) => !SKIP.test(k) && rows.some((r) => r[k] !== null && typeof r[k] !== 'object'));
  const cols = [...prefer.filter((p) => all.includes(p)), ...all.filter((c) => !prefer.includes(c))].slice(0, max);
  return (
    <Table label={label}>
      <thead><tr>{cols.map((c) => <th key={c} className="th">{c.replace(/_/g, ' ')}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => (
        <Tr key={i}>{cols.map((c) => {
          const v = r[c];
          const s = v === null || v === undefined ? '—' : String(v);
          if (c === 'status' && typeof v === 'string') return <td key={c} className="td"><Badge tone={statusTone(v)}>{sentence(v)}</Badge></td>;
          if (c === 'platform' && typeof v === 'string') return <td key={c} className="td">{platformLabel(v)}</td>;
          if (c === 'provider' && typeof v === 'string') return <td key={c} className="td">{providerLabel(v)}</td>;
          if (typeof v === 'string' && /(_type|^type|action|kind|category|level)$/.test(c) && /^[a-z0-9_.:-]{2,40}$/.test(v)) return <td key={c} className="td">{sentence(v)}</td>;
          if (typeof v === 'string' && v.length > 64) return <td key={c} className="td"><ClampText text={v} title={c.replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase())} /></td>;
          return <td key={c} className="td">{/^\d{15,}$/.test(s) ? <CopyId value={s} /> : /^\d{4}-\d{2}-\d{2}T/.test(s) ? <span className="num">{dateTime(s)}</span> : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : s}</td>;
        })}</Tr>
      ))}</tbody>
    </Table>
  );
}

export const nameOf = (r: Row) => pick(r, 'name') ?? '—';
