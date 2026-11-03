import { Badge, Card, KV, PageHeader } from '@/components/ui';
import { BrandingCard } from '@/components/branding-card';
import type { ProductModule, RouteCtx } from '@/products/types';
import { SLUG, TmsError, adminBase, connection, getOverview, polarLink, tmsConfigured } from '../api';
import { PolarModeBadge } from '@/components/polar-mode';
import { polarEnv, polarPaymentsConfigured } from '../polar';

async function checkConnection() {
  if (!tmsConfigured()) return { state: 'missing' as const };
  try { await getOverview(); return { state: 'ok' as const }; } catch (e) { return { state: 'error' as const, code: e instanceof TmsError ? (e.status ? `HTTP ${e.status}` : e.code) : 'unknown' }; }
}

export async function SettingsPage({ role, manifest }: { role: RouteCtx['role']; manifest: ProductModule['manifest'] }) {
  const c = await checkConnection();
  const url = connection().url;
  const host = url ? new URL(adminBase(url)).host : null; // only the host: the key and full URL never leave the server
  return (
    <>
      <PageHeader title="Settings" description="Product branding and the connection to Donexel." updatedAt={new Date()} />
      <div className="grid max-w-3xl gap-4">
        <BrandingCard slug={SLUG} role={role} manifest={manifest} />
        <Card title="Connection">
          <KV items={[
            ['Status', c.state === 'ok' ? <Badge key="s" tone="success">Connected</Badge> : c.state === 'missing' ? <Badge key="s" tone="warning">Not set up</Badge> : <Badge key="s" tone="danger">Failed ({c.code})</Badge>],
            ['API host', host ?? '—'],
            ['Admin key', connection().key ? 'Set (never shown)' : 'Not set'],
            ['Polar environment', <PolarModeBadge key="m" sandbox={polarEnv() === 'sandbox'} />],
            ['Payments access', polarPaymentsConfigured() ? <Badge key="p" tone="success">Token set</Badge> : <Badge key="p" tone="warning">No Polar token</Badge>],
          ]} />
          <p className="mt-4 text-muted">The connection details are kept safely on the server and are never shown in the browser. You can only view payments here: refunds, receipts and tax invoices are handled in <a className="text-accent hover:underline" href={polarLink()} target="_blank" rel="noopener noreferrer">Polar</a>.</p>
        </Card>
      </div>
    </>
  );
}
