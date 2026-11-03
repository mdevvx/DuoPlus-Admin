import { Badge, Card, KV, PageHeader } from '@/components/ui';
import { BrandingCard } from '@/components/branding-card';
import { env } from '@/lib/env';
import type { RouteCtx } from '@/products/types';
import { SLUG, WfcError, obj, s, wfcConfigured, wfcGet } from '../api';
import type { ProductModule } from '@/products/types';

async function connection() {
  if (!wfcConfigured()) return { state: 'missing' as const };
  try {
    const d = obj(await wfcGet('health'));
    const key = obj(d.key);
    return { state: 'ok' as const, name: s(key, 'name') ?? s(d, 'key_name'), scopes: s(key, 'scopes', 'scope') ?? s(d, 'scopes') };
  } catch (e) {
    return { state: 'error' as const, code: e instanceof WfcError ? e.code : 'unknown' };
  }
}

export async function SettingsPage({ role, manifest }: { role: RouteCtx['role']; manifest: ProductModule['manifest'] }) {
  const c = await connection();
  const base = env().WFC_API_BASE ?? 'https://wooflowconnect.duoplus.org/api/ext/v1';
  const org = env().WFC_POLAR_ORG_SLUG ?? env().DISCONOTIFY_POLAR_ORG_SLUG;
  return (
    <>
      <PageHeader title="Settings" description="Product branding and the connection to the WooFlowConnect licence server." updatedAt={new Date()} />
      <div className="grid max-w-3xl gap-4">
        <BrandingCard slug={SLUG} role={role} manifest={manifest} />
        <Card title="Licence server connection">
          <KV items={[
            ['Status', c.state === 'ok' ? <Badge key="s" tone="success">Connected</Badge> : c.state === 'missing' ? <Badge key="s" tone="warning">API key not set</Badge> : <Badge key="s" tone="danger">Failed ({c.code})</Badge>],
            ['API base', base],
            ['Key name', c.state === 'ok' ? c.name : null],
            ['Key scopes', c.state === 'ok' ? c.scopes : null],
            ['Payments', org ? `Polar (${org})` : 'Polar (organisation slug not set)'],
          ]} />
          <p className="mt-4 text-muted">The key lives in the server environment as WFC_API_KEY and is never sent to the browser. Support actions (grant days, suspend, cancel...) need a key created with “Read and support actions”.</p>
        </Card>
      </div>
    </>
  );
}
