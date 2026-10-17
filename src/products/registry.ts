import 'server-only';
import { unstable_cache } from 'next/cache';
import { hubDb } from '@/lib/supabase-server';
import { roleForProduct, can, type Role } from '@/lib/roles';
import type { Admin } from '@/lib/auth';
import type { ProductModule, RouteDef } from './types';
import pulsenotify from './pulsenotify';

/**
 * Code side of the registry. Adding a product = add a folder under src/products/<slug>/ and list it here,
 * plus one row in hub.hub_products. The shell never mentions a specific product.
 */
const MODULES: ProductModule[] = [pulsenotify];
export const MODULE_BY_SLUG: Record<string, ProductModule> = Object.fromEntries(MODULES.map((m) => [m.manifest.slug, m]));

export interface AccessibleProduct {
  slug: string;
  name: string;
  description: string;
  icon: string;
  status: string;
  role: Role;
  module: ProductModule;
}

/** Products that exist in code AND in hub_products (not disabled) AND are assigned to this admin. */
export async function accessibleProducts(admin: Admin): Promise<AccessibleProduct[]> {
  const { data } = await hubDb().from('hub_products').select('slug,name,description,icon,status');
  const out: AccessibleProduct[] = [];
  for (const row of data ?? []) {
    const mod = MODULE_BY_SLUG[row.slug];
    const role = roleForProduct(admin, row.slug);
    if (!mod || !role || row.status === 'disabled') continue;
    out.push({ slug: row.slug, name: row.name, description: row.description ?? '', icon: row.icon ?? mod.manifest.icon, status: row.status, role, module: mod });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function visibleNav(p: AccessibleProduct) {
  return p.module.navigation.filter((n) => !n.permission || can(p.role, n.permission));
}

export const productHealth = unstable_cache(
  async (slug: string): Promise<'ok' | 'warn' | 'down'> => {
    try { return (await MODULE_BY_SLUG[slug]?.health?.()) ?? 'ok'; } catch { return 'down'; }
  },
  ['product-health'],
  { revalidate: 60 },
);

/** Match 'servers/123' against patterns like 'servers/:id'. */
export function matchRoute(module: ProductModule, segments: string[]): { route: RouteDef; params: Record<string, string> } | null {
  for (const [pattern, route] of Object.entries(module.routes)) {
    const parts = pattern === '' ? [] : pattern.split('/');
    if (parts.length !== segments.length) continue;
    const params: Record<string, string> = {};
    const ok = parts.every((p, i) => {
      const seg = segments[i]!;
      if (p.startsWith(':')) { params[p.slice(1)] = decodeURIComponent(seg); return true; }
      return p === seg;
    });
    if (ok) return { route, params };
  }
  return null;
}
