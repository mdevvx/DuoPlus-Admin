import { describe, expect, it } from 'vitest';
import { can, DANGEROUS, PERMISSIONS, roleForProduct, ROLES, type AdminAccess } from '@/lib/roles';

describe('roles (admins only)', () => {
  it('has only owner and admin', () => {
    expect([...ROLES]).toEqual(['owner', 'admin']);
  });

  it('only owners manage admins', () => {
    expect(can('owner', 'hub.admins')).toBe(true);
    expect(can('admin', 'hub.admins')).toBe(false);
  });

  it('denies missing roles by default', () => {
    for (const p of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) {
      expect(can(null, p)).toBe(false);
      expect(can(undefined, p)).toBe(false);
    }
  });

  it('every dangerous action is a known permission', () => {
    for (const d of DANGEROUS) expect(d in PERMISSIONS).toBe(true);
  });

  it('product access: admins only see assigned products, owners see all', () => {
    const admin: AdminAccess = { role: 'admin', products: { pulsenotify: 'admin' } };
    const owner: AdminAccess = { role: 'owner', products: {} };
    expect(roleForProduct(admin, 'pulsenotify')).toBe('admin');
    expect(roleForProduct(admin, 'other')).toBeNull();
    expect(roleForProduct(owner, 'anything')).toBe('owner');
  });
});
