import 'server-only';
import { int, sentence } from '@/lib/format';
import type { Attention, ProductModule } from '../types';
import { SLUG, cents, first, n, wfcConfigured, wfcExport, parseCsv, wfcGet, obj, s } from './api';
import { OverviewPage, alertTone, getOverview } from './pages/overview';
import { CustomerDetailPage, CustomersPage } from './pages/customers';
import { ActivityPage, AuditPage, DownloadsPage, LookupPage, PaymentsPage, StoresPage } from './pages/lists';
import { SettingsPage } from './pages/settings';

const base = `/p/${SLUG}`;

const exportOf = (what: string, filename: string) => ({
  permission: 'export.csv' as const, filename,
  rows: async () => parseCsv(await wfcExport(what)),
});

const wooflowconnect: ProductModule = {
  manifest: { slug: SLUG, name: 'WooFlowConnect', description: 'WooCommerce automation plugin, licensed and billed per store', icon: 'plug' },
  navigation: [
    { label: 'Overview', path: '', icon: 'overview', shortcut: 'o' },
    { label: 'Customers', path: 'customers', icon: 'customers', shortcut: 'c' },
    { label: 'Stores', path: 'stores', icon: 'store', shortcut: 's' },
    { label: 'Payments', path: 'payments', icon: 'payments', shortcut: 'p' },
    { label: 'Downloads', path: 'downloads', icon: 'download', shortcut: 'd' },
    { label: 'Activity', path: 'activity', icon: 'health', shortcut: 'y' },
    { label: 'Support lookup', path: 'lookup', icon: 'search', shortcut: 'l' },
    { label: 'Audit', path: 'audit', icon: 'audit', permission: 'hub.audit' },
    { label: 'Settings', path: 'settings', icon: 'settings' },
  ],
  routes: {
    '': { permission: 'read', render: OverviewPage },
    customers: { permission: 'read', render: CustomersPage },
    'customers/:id': { permission: 'read', render: CustomerDetailPage },
    stores: { permission: 'read', render: StoresPage },
    payments: { permission: 'read', render: PaymentsPage },
    downloads: { permission: 'read', render: DownloadsPage },
    activity: { permission: 'read', render: ActivityPage },
    lookup: { permission: 'read', render: LookupPage },
    audit: { permission: 'hub.audit', render: AuditPage },
    settings: { permission: 'read', render: ({ role }) => SettingsPage({ role, manifest: wooflowconnect.manifest }) },
  },
  headline: async () => {
    if (!wfcConfigured()) return [{ label: 'Customers', value: '—' }, { label: 'Paying', value: '—' }, { label: 'MRR', value: '—' }];
    const { stats: st } = await getOverview();
    return [
      { label: 'Customers', value: int(n(st, 'customers', 'customers_total', 'total_customers', 'users')) },
      { label: 'Paying', value: int(n(st, 'active', 'paying', 'plan_active')) },
      { label: 'MRR', value: cents(n(st, 'mrr', 'mrr_cents')) },
    ];
  },
  attention: async () => {
    if (!wfcConfigured()) return [{ label: 'WooFlowConnect API key is not set', detail: 'Setup', href: `${base}/settings`, tone: 'warning' }];
    const { alerts } = await getOverview();
    return alerts.map((a): Attention => {
      const id = first(a, 'customer_id', 'user_id', 'id');
      return {
        label: s(a, 'message', 'label', 'text', 'title') ?? 'Alert', detail: sentence(s(a, 'type', 'kind') ?? 'Alert'),
        href: id !== undefined ? `${base}/customers/${encodeURIComponent(String(id))}` : base, tone: alertTone(a),
      };
    });
  },
  health: async () => {
    if (!wfcConfigured()) return 'warn';
    await wfcGet('health');
    return 'ok';
  },
  search: async (q) => {
    if (!wfcConfigured()) return [];
    const d = obj(await wfcGet('lookup', { q }));
    const rows = Array.isArray(d.results) ? d.results : Array.isArray(d.matches) ? d.matches : Array.isArray(d.customers) ? d.customers : [];
    return rows.slice(0, 8).map((x) => {
      const r = obj(x);
      const id = first(r, 'id', 'customer_id', 'user_id');
      return { type: 'Customer', label: s(r, 'email') ?? 'Customer', sub: s(r, 'host', 'domain', 'ref', 'key_hint') ?? undefined, href: id !== undefined ? `${base}/customers/${encodeURIComponent(String(id))}` : `${base}/lookup?q=${encodeURIComponent(q)}` };
    });
  },
  exports: {
    users: exportOf('users', 'wooflowconnect-customers'),
    payments: exportOf('payments', 'wooflowconnect-payments'),
    stores: exportOf('stores', 'wooflowconnect-stores'),
    downloads: exportOf('downloads', 'wooflowconnect-downloads'),
  },
};
export default wooflowconnect;
