import { Badge, Card, KV, PageHeader } from '@/components/ui';
import { BrandingCard } from '@/components/branding-card';
import { env } from '@/lib/env';
import type { ProductModule, RouteCtx } from '@/products/types';
import { SLUG, TmsError, adminBase, getOverview, polarLink, tmsConfigured } from '../api';
import { polarEnv, polarPaymentsConfigured } from '../polar';

async function connection() {
  if (!tmsConfigured()) return { state: 'missing' as const };
  try { await getOverview(); return { state: 'ok' as const }; } catch (e) { return { state: 'error' as const, code: e instanceof TmsError ? (e.status ? `HTTP ${e.status}` : e.code) : 'unknown' }; }
}

export async function SettingsPage({ role, manifest }: { role: RouteCtx['role']; manifest: ProductModule['manifest'] }) {
  const c = await connection();
  const url = env().DUOPLUS_API_URL;
  const host = url ? new URL(adminBase(url)).host : null; // only the host: the key and full URL never leave the server
  return (
    <>
      <PageHeader title="Settings" description="Product branding and the connection to the Team Management System." updatedAt={new Date()} />
      <div className="grid max-w-3xl gap-4">
        <BrandingCard slug={SLUG} role={role} manifest={manifest} />
        <Card title="Connection">
          <KV items={[
            ['Status', c.state === 'ok' ? <Badge key="s" tone="success">Connected</Badge> : c.state === 'missing' ? <Badge key="s" tone="warning">Not set up</Badge> : <Badge key="s" tone="danger">Failed ({c.code})</Badge>],
            ['API host', host ?? '—'],
            ['Admin key', env().DUOPLUS_ADMIN_KEY ? 'Set (never shown)' : 'Not set'],
            ['Payments', `Polar ${polarEnv() === 'sandbox' ? 'sandbox' : 'live'}`],
            ['Payments access', polarPaymentsConfigured() ? <Badge key="p" tone="success">Token set</Badge> : <Badge key="p" tone="warning">No Polar token</Badge>],
          ]} />
          <p className="mt-4 text-muted">The address and key live in the server environment as DUOPLUS_API_URL and DUOPLUS_ADMIN_KEY and are never sent to the browser. Payments are read-only here, read from Polar with its own token (TMS_POLAR_ACCESS_TOKEN). Receipts, refunds and tax happen in <a className="text-accent hover:underline" href={polarLink()} target="_blank" rel="noopener noreferrer">Polar</a>.</p>
        </Card>
      </div>
    </>
  );
}
