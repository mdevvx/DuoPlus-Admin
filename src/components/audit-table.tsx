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
                <dl className="mb-5 grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 rounded-lg text-left border border-line bg-canvas p-3 text-sm">
                  <dt className="text-muted">Time</dt><dd className="num">{dateTime(r.at)}</dd>
                  <dt className="text-muted">Admin</dt><dd className="break-all">{r.admin_email ?? 'system'}</dd>
                  {r.ip && <><dt className="text-muted">IP</dt><dd className="font-mono text-xs">{r.ip}</dd></>}
                  {r.target_type && <><dt className="text-muted">Target</dt><dd className="break-all font-mono text-xs">{r.target_type}:{r.target_id ?? ''}</dd></>}
                  {r.reason && <><dt className="text-muted">Reason</dt><dd className="break-words">{r.reason}</dd></>}
                </dl>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Before</h4>
                <pre className="thin-scroll mb-4 max-h-[40vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-canvas p-3 text-left font-mono text-xs leading-relaxed">{JSON.stringify(r.before ?? null, null, 2)}</pre>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">After</h4>
                <pre className="thin-scroll max-h-[40vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-canvas p-3 text-left font-mono text-xs leading-relaxed">{JSON.stringify(r.after ?? null, null, 2)}</pre>
              </SideSheet>
            </td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
