import type { ReactNode } from 'react';
import type { Admin } from '@/lib/auth';
import type { Permission, Role } from '@/lib/roles';

export interface NavItem {
  label: string;
  /** Path below /p/<slug>/ ('' = product home). */
  path: string;
  icon: string;
  permission?: Permission;
  /** Second key of the `g` chord (g then <key>). */
  shortcut?: string;
}

export interface RouteCtx {
  admin: Admin;
  /** Effective role in this product. */
  role: Role;
  slug: string;
  params: Record<string, string>;
  searchParams: Record<string, string | undefined>;
}

export interface RouteDef {
  permission: Permission;
  render: (ctx: RouteCtx) => Promise<ReactNode> | ReactNode;
}

export interface SearchHit { type: string; label: string; sub?: string; href: string }
export interface Headline { label: string; value: string }
export interface Attention { label: string; detail: string; href: string; tone: 'warning' | 'danger' | 'info' }

export interface ProductModule {
  manifest: { slug: string; name: string; description: string; icon: string; /** Optional logo under /public, e.g. /products/<slug>.png */ logo?: string };
  navigation: NavItem[];
  /** Keys are path patterns below /p/<slug>/, e.g. '', 'servers', 'servers/:id'. */
  routes: Record<string, RouteDef>;
  headline?: () => Promise<Headline[]>;
  attention?: () => Promise<Attention[]>;
  health?: () => Promise<'ok' | 'warn' | 'down'>;
  search?: (q: string) => Promise<SearchHit[]>;
  exports?: Record<string, { permission: Permission; filename: string; rows: (sp: Record<string, string | undefined>) => Promise<Record<string, unknown>[]> }>;
}
