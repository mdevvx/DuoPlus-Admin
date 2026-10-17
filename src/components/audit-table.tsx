import { Badge, EmptyState, Table, Tr } from './ui';
import { ClampText, SideSheet } from './small-client';
import type { AuditRow } from '@/lib/audit-query';
import { dateTime, sentence } from '@/lib/format';

const tone = (a: string) => (a.startsWith('auth.failure') || a.includes('delete') ? 'danger' : a.startsWith('auth') ? 'info' : a.includes('whitelist') || a.includes('adjust') || a.includes('maintenance') ? 'warning' : 'neutral') as 'danger' | 'info' | 'warning' | 'neutral';

export function AuditTable({ rows, showProduct = true }: { rows: (AuditRow & { source?: string })[]; showProduct?: boolean }) {
  if (rows.length === 0) return <div className="card"><EmptyState title="No audit entries" hint="Try widening the filters." /></div>;
  return (
    <Table label="Audit log">
      <thead><tr><th className="th">Time</th><th className="th">Admin</th>{showProduct && <th className="th">Product</th>}<th className="th">Action</th><th className="th">Target</th><th className="th">Reason</th><th className="th" /></tr></thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={`${r.source ?? 'hub'}-${r.id}`}>
            <td className="td num whitespace-nowrap">{dateTime(r.at)}</td>
            <td className="td">{r.admin_email ?? (r.source === 'bot' ? <span className="text-muted">bot</span> : '—')}</td>
            {showProduct && <td className="td">{r.product_slug ?? '—'}</td>}
            <td className="td"><Badge tone={tone(r.action)}>{sentence(r.action.replace('.', ': '))}</Badge></td>
            <td className="td font-mono text-xs">{r.target_type ? `${r.target_type}:${r.target_id ?? ''}` : '—'}</td>
            <td className="td">{r.reason ? <ClampText text={r.reason} title="Reason" max={48} /> : '—'}</td>
            <td className="td text-right">
              <SideSheet trigger="Details" title={r.action}>
                <p className="mb-2 text-xs text-muted">{dateTime(r.at)} · {r.admin_email ?? 'system'}{r.ip ? ` · ${r.ip}` : ''}</p>
                <h4 className="mb-1 text-xs font-semibold uppercase text-muted">Before</h4>
                <pre className="mb-3 overflow-auto rounded bg-canvas p-2 text-xs">{JSON.stringify(r.before ?? null, null, 2)}</pre>
                <h4 className="mb-1 text-xs font-semibold uppercase text-muted">After</h4>
                <pre className="overflow-auto rounded bg-canvas p-2 text-xs">{JSON.stringify(r.after ?? null, null, 2)}</pre>
              </SideSheet>
            </td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
