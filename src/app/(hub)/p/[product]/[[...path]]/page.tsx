import { notFound, redirect } from 'next/navigation';
import { requirePage } from '@/lib/auth';
import { can } from '@/lib/roles';
import { flatParams } from '@/lib/validation';
import { MODULE_BY_SLUG, accessibleProducts, matchRoute } from '@/products/registry';

export default async function ProductPage({ params, searchParams }: {
  params: Promise<{ product: string; path?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { product, path = [] } = await params;
  if (!MODULE_BY_SLUG[product]) notFound();
  const { admin, role } = await requirePage({ product });
  const p = (await accessibleProducts(admin)).find((x) => x.slug === product);
  if (!p) redirect('/?denied=1');

  const match = matchRoute(p.module, path);
  if (!match) notFound();
  if (!can(role, match.route.permission)) redirect('/?denied=1');
  const page = await match.route.render({ admin, role, slug: product, params: match.params, searchParams: flatParams(await searchParams) });
  // Keyed by the route, so opening another page eases in again; changing a filter on the same page does not.
  return <div key={path.join('/')} className="page-in">{page}</div>;
}
