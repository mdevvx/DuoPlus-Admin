import Link from 'next/link';
import { ProductMark } from '@/components/icons';
import type { Metadata } from 'next';
import { requirePage } from '@/lib/auth';
import { accessibleProducts } from '@/products/registry';
import { Badge, Card, EmptyState, Hero, HeroChip, IconTile, Stat } from '@/components/ui';
import { roleLabel } from '@/lib/roles';
import type { Attention, Headline } from '@/products/types';

export const metadata: Metadata = { title: 'Home' };

export default async function HubHome({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { admin } = await requirePage();
  const { denied } = await searchParams;
  const products = await accessibleProducts(admin);
  const loaded = await Promise.all(products.map(async (p) => {
    try {
      const [headline, attention] = await Promise.all([p.module.headline?.() ?? [], p.module.attention?.() ?? []]);
      return { p, headline: headline as Headline[], attention: attention as Attention[], failed: false };
    } catch {
      return { p, headline: [] as Headline[], attention: [] as Attention[], failed: true };
    }
  }));
  const attention = loaded.flatMap((l) => l.attention.map((a) => ({ ...a, product: l.p.name })));

  return (
    <>
      <Hero
        title={`Welcome back${admin.displayName ? ', ' + admin.displayName : ''}`}
        text="Everything across your products at a glance. Pick a product below or use the search box to jump straight to a server, customer or payment."
        chips={<><HeroChip live>Live data</HeroChip><HeroChip>{roleLabel(admin.role)}</HeroChip></>}
        aside={`Updated ${new Date().toISOString().slice(11, 16)} UTC`}
        metrics={[{ label: 'Products', value: String(loaded.length) }, { label: 'Needs attention', value: String(attention.length) }]}
      />
      {denied && <p className="mb-4 rounded bg-warning-soft px-3 py-2 text-warning" role="alert">You do not have access to that page.</p>}
      {loaded.length === 0 ? (
        <Card><EmptyState title="No products assigned" hint="Ask an owner to give you access to a product." /></Card>
      ) : (
        <div className="grid grid-cols-2 gap-5">
          {loaded.map(({ p, headline, failed }) => (
            <Link key={p.slug} href={`/p/${p.slug}`} className="card rise block p-5 transition-shadow hover:shadow-pop">
              <div className="mb-5 flex items-center gap-3">
                {p.logo ? <ProductMark logo={p.logo} icon={p.icon} size={40} className="shrink-0 rounded-xl" /> : <IconTile icon={p.icon} />}
                <div><div className="text-[15px] font-semibold">{p.name}</div><div className="text-xs text-muted">{p.description}</div></div>
              </div>
              {failed ? <Badge tone="danger">Could not load numbers</Badge> : (
                <div className="grid grid-cols-3 gap-4">{headline.map((h) => <Stat key={h.label} label={h.label} value={h.value} />)}</div>
              )}
            </Link>
          ))}
        </div>
      )}
      <div className="mt-6">
        <Card title="Needs attention">
          {attention.length === 0 ? <EmptyState title="Nothing needs attention" hint="Billing, platform health and payments all look normal." /> : (
            <ul className="divide-y divide-line">
              {attention.map((a, i) => (
                <li key={i}>
                  <Link href={a.href} className="flex items-center justify-between gap-4 py-2 hover:text-accent">
                    <span><span className="text-muted">{a.product} · </span>{a.label}</span>
                    <Badge tone={a.tone}>{a.detail}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
