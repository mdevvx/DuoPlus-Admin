// Admins only: there is no support or viewer role. Owners additionally manage other admins.
export const ROLES = ['owner', 'admin'] as const;
export type Role = (typeof ROLES)[number];
export type ProductRole = Exclude<Role, 'owner'>;

const RANK: Record<Role, number> = { admin: 1, owner: 2 };

/** Minimum role needed for each permission. Anything not listed is denied. */
export const PERMISSIONS = {
  'read': 'admin',
  'export.csv': 'admin',
  'server.trial': 'admin',
  'server.mark_removed': 'admin',
  'server.adjust_paid': 'admin',
  'server.whitelist': 'admin',
  'contact.optin_out': 'admin',
  'contact.delete': 'admin',
  'reminder.send': 'admin',
  'maintenance.set': 'admin',
  'email.template': 'admin',
  'email.send': 'admin',
  'email.send.bulk': 'admin',
  'email.outbox': 'admin',
  'email.contact': 'admin',
  'email.settings': 'owner',
  'bot.settings': 'owner',
  'product.branding': 'admin',
  'support.act': 'admin',
  'support.danger': 'admin',
  'hub.admins': 'owner',
  'hub.audit': 'admin',
} as const satisfies Record<string, Role>;
export type Permission = keyof typeof PERMISSIONS;

/** Actions that additionally require a fresh second factor (<= 10 minutes). */
export const DANGEROUS: ReadonlySet<Permission> = new Set<Permission>([
  'server.whitelist', 'server.adjust_paid', 'contact.delete', 'maintenance.set', 'hub.admins', 'support.danger', 'email.send.bulk', 'bot.settings',
]);

/** Display form: first letter capital, rest lower case ("owner" -> "Owner"). */
export function roleLabel(role: string | null | undefined): string {
  const r = (role ?? '').toLowerCase();
  return r ? r.charAt(0).toUpperCase() + r.slice(1) : '—';
}

export function isRole(v: unknown): v is Role {
  return typeof v === 'string' && (ROLES as readonly string[]).includes(v);
}

export function roleAtLeast(role: Role | null | undefined, min: Role): boolean {
  return !!role && RANK[role] >= RANK[min];
}

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return roleAtLeast(role, PERMISSIONS[permission]);
}

export interface AdminAccess {
  role: Role;
  /** product slug -> role override/assignment. Owners implicitly have every product. */
  products: Record<string, ProductRole>;
}

/** Effective role inside a product, or null when the admin has no access to it (deny by default). */
export function roleForProduct(access: AdminAccess, slug: string): Role | null {
  if (access.role === 'owner') return 'owner';
  return access.products[slug] ?? null;
}
