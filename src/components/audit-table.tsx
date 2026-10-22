import { Badge, DetailRow, EmptyState, Table, Tr } from './ui';
import { DetailModal } from './small-client';
import type { AuditRow } from '@/lib/audit-query';
import { dateTime, sentence } from '@/lib/format';

const LABEL: Record<string, string> = {
  'email.template.save': 'Email template saved', 'email.template.toggle': 'Email template switched on or off', 'email.template.restore': 'Email template restored',
  'email.layout.save': 'Email layout saved', 'email.schedule.save': 'Email schedule saved', 'email.send': 'Manual email sent',
  'email.outbox.retry': 'Email retried', 'email.outbox.cancel': 'Email cancelled', 'email.contact.add': 'Email contact added',
  'email.contact.remove': 'Email contact removed', 'email.contact.resubscribe': 'Contact re-subscribed', 'email.contact.unsubscribe': 'Contact unsubscribed',
  'email.contact.erase': 'Email address erased', 'email.contact.reveal': 'Email address revealed', 'email.outbox.reveal': 'Email recipient revealed', 'export.csv': 'CSV export',
};
const label = (a: string) => LABEL[a] ?? sentence(a.replace('.', ': '));

const tone = (a: string) => (a.startsWith('auth.failure') || a.includes('delete') ? 'danger' : a.startsWith('auth') ? 'info' : a.includes('whitelist') || a.includes('adjust') || a.includes('maintenance') || a === 'email.send' || a.endsWith('.erase') || a.endsWith('.reveal') ? 'warning' : 'neutral') as 'danger' | 'info' | 'warning' | 'neutral';

export function AuditTable({ rows, showProduct = true }: { rows: (AuditRow & { source?: string })[]; showProduct?: boolean }) {
  if (rows.length === 0) return <div className="card"><EmptyState title="No audit entries" hint="Try widening the filters." /></div>;
  return (
    <Table label="Audit log">
      <thead><tr><th className="th">Time</th><th className="th">Admin</th>{showProduct && <th className="th">Product</th>}<th className="th">Action</th><th className="th">Target</th><th className="th" /></tr></thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={`${r.source ?? 'hub'}-${r.id}`}>
            <td className="td num whitespace-nowrap">{dateTime(r.at)}</td>
            <td className="td whitespace-nowrap">{r.admin_email ?? (r.source === 'bot' ? <span className="text-muted">bot</span> : '—')}</td>
            {showProduct && <td className="td">{r.product_slug ?? '—'}</td>}
            <td className="td"><Badge tone={tone(r.action)}>{label(r.action)}</Badge></td>
            <td className="td font-mono text-xs">{r.target_type ? `${r.target_type}:${r.target_id ?? ''}` : '—'}</td>
            <td className="td text-right">
              <DetailModal trigger="Details" title="Audit entry">
                <div className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-subtle px-4 py-3">
                  <Badge tone={tone(r.action)}>{label(r.action)}</Badge>
                  <span className="num text-xs text-muted">{dateTime(r.at)}</span>
                </div>
                <dl className="divide-y divide-line text-sm">
                  <DetailRow label="Admin">{r.admin_email ?? (r.source === 'bot' ? 'bot' : 'system')}</DetailRow>
                  {r.ip && <DetailRow label="IP"><span className="font-mono text-xs">{r.ip}</span></DetailRow>}
                  {r.target_type && <DetailRow label="Target"><span className="break-all font-mono text-xs">{r.target_type}:{r.target_id ?? ''}</span></DetailRow>}
                  {r.reason && <DetailRow label="Reason"><span className="break-words">{r.reason}</span></DetailRow>}
                </dl>
                <h4 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Before</h4>
                <pre className="thin-scroll mb-4 max-h-[30vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-subtle p-3 text-left font-mono text-xs leading-relaxed">{JSON.stringify(r.before ?? null, null, 2)}</pre>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">After</h4>
                <pre className="thin-scroll max-h-[30vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-subtle p-3 text-left font-mono text-xs leading-relaxed">{JSON.stringify(r.after ?? null, null, 2)}</pre>
              </DetailModal>
            </td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
