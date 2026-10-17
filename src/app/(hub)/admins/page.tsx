import type { Metadata } from 'next';
import { requirePage } from '@/lib/auth';
import { hubDb, must } from '@/lib/supabase-server';
import { MODULE_BY_SLUG } from '@/products/registry';
import { Badge, EmptyState, PageHeader, Table, Tr } from '@/components/ui';
import { ConfirmAction } from '@/components/confirm-action';
import { dateTime } from '@/lib/format';
import { roleLabel } from '@/lib/roles';
import { inviteAdmin, updateAdmin } from './actions';

export const metadata: Metadata = { title: 'Admins' };

const ROLE_OPTS: [string, string][] = [['admin', 'Admin'], ['owner', 'Owner']];

export default async function AdminsPage() {
  const { admin } = await requirePage({ permission: 'hub.admins' });
  const db = hubDb();
  const admins = must(await db.from('hub_admins').select('id,email,display_name,role,active,last_login_at').order('created_at'), 'admins');
  const assigned = must(await db.from('hub_admin_products').select('admin_id,product_slug,role'), 'assignments');
  const products = must(await db.from('hub_products').select('slug,name'), 'products').filter((p: { slug: string }) => MODULE_BY_SLUG[p.slug]);

  const productFields = (current: Record<string, string>) =>
    products.map((p: { slug: string; name: string }) => ({
      name: `prod_${p.slug}`, label: `${p.name} access`, type: 'select' as const, defaultValue: current[p.slug] ?? 'none',
      options: [['none', 'No access'], ['admin', 'Admin']] as [string, string][],
    }));

  return (
    <>
      <PageHeader title="Admins" description="Only people on this list can sign in. Owners see every product; others see assigned products."
        actions={
          <ConfirmAction label="Invite admin" title="Invite an admin" small={false} action={inviteAdmin} hidden={{}}
            description="They sign in with this email and password, then enrol an authenticator. Share the password securely."
            fields={[{ name: 'email', label: 'Email' }, { name: 'password', label: 'Initial password (12+ characters)', type: 'password' }, { name: 'name', label: 'Display name', optional: true },
              { name: 'role', label: 'Global role', type: 'select', options: ROLE_OPTS, defaultValue: 'admin' }, ...productFields({})]} />
        } />
      {admins.length === 0 ? <div className="card"><EmptyState title="No admins" /></div> : (
        <Table label="Admins">
          <thead><tr><th className="th">Admin</th><th className="th">Role</th><th className="th">Products</th><th className="th">Status</th><th className="th">Last login</th><th className="th" /></tr></thead>
          <tbody>
            {admins.map((a: { id: string; email: string; display_name: string | null; role: string; active: boolean; last_login_at: string | null }) => {
              const mine = assigned.filter((x: { admin_id: string }) => x.admin_id === a.id);
              const cur = Object.fromEntries(mine.map((x: { product_slug: string; role: string }) => [x.product_slug, x.role]));
              return (
                <Tr key={a.id}>
                  <td className="td"><div className="font-medium">{a.display_name ?? a.email}</div><div className="text-xs text-muted">{a.email}</div></td>
                  <td className="td"><Badge tone={a.role === 'owner' ? 'info' : 'neutral'}>{roleLabel(a.role)}</Badge></td>
                  <td className="td text-muted">{a.role === 'owner' ? 'All' : mine.map((x: { product_slug: string; role: string }) => `${x.product_slug} (${roleLabel(x.role)})`).join(', ') || 'None'}</td>
                  <td className="td">{a.active ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Deactivated</Badge>}</td>
                  <td className="td num">{dateTime(a.last_login_at)}</td>
                  <td className="td text-right">
                    {a.id !== admin.id && (
                      <ConfirmAction label="Edit" title={`Edit ${a.email}`} action={updateAdmin} hidden={{ id: a.id }}
                        fields={[{ name: 'name', label: 'Display name', optional: true, defaultValue: a.display_name ?? '' },
                          { name: 'role', label: 'Global role', type: 'select', options: ROLE_OPTS, defaultValue: a.role },
                          { name: 'active', label: 'Status', type: 'select', options: [['true', 'Active'], ['false', 'Deactivated']], defaultValue: String(a.active) },
                          ...productFields(cur)]} />
                    )}
                  </td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
