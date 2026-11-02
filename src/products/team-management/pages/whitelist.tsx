import { z } from 'zod';
import { Card, Cell, EmptyState, PageHeader, Table, Tr, When } from '@/components/ui';
import { ConfirmAction } from '@/components/confirm-action';
import { Filters } from '@/components/filters';
import { Notice } from '@/components/form';
import { WhitelistAdd } from '@/components/whitelist-form';
import { can } from '@/lib/roles';
import type { RouteCtx } from '@/products/types';
import { listWhitelist, polarLink } from '../api';
import { removeWhitelistEntry } from '../actions';
import { PlanText, base, load } from './shared';

const params = z.object({ q: z.string().trim().toLowerCase().max(100).optional().catch(undefined) });

export async function WhitelistPage({ role, searchParams }: RouteCtx) {
  const p = params.parse(searchParams);
  const r = await load(listWhitelist, `${base}/whitelist`);
  const canEdit = can(role, 'tms.whitelist');
  // The list is small, so searching it here is simpler than another API round trip.
  const rows = r.ok ? r.data.filter((e) => !p.q || e.email.toLowerCase().includes(p.q) || (e.note ?? '').toLowerCase().includes(p.q)) : [];

  return (
    <>
      <PageHeader title="Whitelist" description="People on this list never pay. Their workspaces are complimentary on the plan you choose." updatedAt={new Date()} />

      {canEdit && (
        <div className="mb-5">
          <Card title="Add an email"><WhitelistAdd polarUrl={polarLink()} /></Card>
        </div>
      )}

      {!r.ok ? r.panel : (
        <>
          <Filters action={`${base}/whitelist`} fields={[{ type: 'search', key: 'q', label: 'Search', placeholder: 'Search by email or note' }]} />
          {rows.length === 0 ? <div className="card"><EmptyState title={p.q ? 'No emails match' : 'The whitelist is empty'} hint={p.q ? 'Clear the search to see everyone.' : 'Add an email above. It is matched exactly, so domains and wildcards are not supported.'} /></div> : (
            <Table label="Whitelisted emails">
              <thead><tr>{['Email', 'Plan', 'People limit', 'Note', 'Added', ''].map((h, i) => <th key={i} className="th">{h}</th>)}</tr></thead>
              <tbody>{rows.map((e) => (
                <Tr key={e.email}>
                  <td className="td"><Cell text={e.email} max={300} /></td>
                  <td className="td whitespace-nowrap"><PlanText plan={e.plan} /></td>
                  <td className="td whitespace-nowrap">{e.seats ? e.seats.toLocaleString('en-US') : <span className="text-muted">Plan default</span>}</td>
                  <td className="td"><Cell text={e.note} max={320} /></td>
                  <td className="td whitespace-nowrap"><When value={e.createdAt || null} /></td>
                  <td className="td whitespace-nowrap text-right">
                    {canEdit && (
                      <ConfirmAction label="Remove" title="Remove from the whitelist" danger compact action={removeWhitelistEntry} hidden={{ email: e.email }} typeToConfirm={e.email}
                        description="They will pay like everyone else. Workspaces that were made complimentary through this entry go back to normal billing and show the paywall unless the person subscribes. Older complimentary workspaces are not touched." />
                    )}
                  </td>
                </Tr>
              ))}</tbody>
            </Table>
          )}
          <div className="mt-4"><Notice tone="info">Whitelisted people cannot start checkout or change their plan inside the app. The plan is set only here. Receipts and refunds live in Polar.</Notice></div>
        </>
      )}
    </>
  );
}
