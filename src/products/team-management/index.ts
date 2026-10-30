import 'server-only';
import { int, money } from '@/lib/format';
import type { Attention, ProductModule } from '../types';
import { SLUG, getOverview, listWorkspaces, tmsConfigured } from './api';
import { OverviewPage } from './pages/overview';
import { WorkspacesPage } from './pages/workspaces';
import { WhitelistPage } from './pages/whitelist';
import { AuditPage } from './pages/audit';
import { PaymentsPage } from './pages/payments';
import { UsersPage } from './pages/users';
import { WorkspaceDetailPage } from './pages/workspace';
import { filterPayments, filtersFromParams, REASON_LABEL, STATUS_LABEL } from './payments';
import { listPayments } from './polar';
import { peopleInWorkspaces } from './people';
import { SupportPage } from './pages/support';
import { SettingsPage } from './pages/settings';
import { EmailContactsPage, EmailOutboxPage, EmailRemindersPage, EmailSendPage, EmailSettingsPage, EmailTemplatePage, EmailTemplatesPage } from './pages/email';

const base = `/p/${SLUG}`;

const teamManagement: ProductModule = {
  manifest: { slug: SLUG, name: 'Donexel', description: 'Workspaces, subscriptions and the billing whitelist', icon: 'workspace' },
  navigation: [
    { label: 'Overview', path: '', icon: 'overview', shortcut: 'o' },
    { label: 'Workspaces', path: 'workspaces', icon: 'workspace', shortcut: 'w' },
    { label: 'Users', path: 'users', icon: 'customers', shortcut: 'u' },
    { label: 'Payments', path: 'payments', icon: 'payments', shortcut: 'p' },
    { label: 'Whitelist', path: 'whitelist', icon: 'whitelist', shortcut: 'l' },
    { label: 'Support', path: 'support', icon: 'support', shortcut: 's' },
    { label: 'Reminders & email', path: 'email', icon: 'reminders', shortcut: 'r' },
    { label: 'Email templates', path: 'email/templates', icon: 'template', shortcut: 't' },
    { label: 'Send email', path: 'email/send', icon: 'outbox', shortcut: 'm' },
    { label: 'Email outbox', path: 'email/outbox', icon: 'outbox', shortcut: 'b' },
    { label: 'Email contacts', path: 'email/contacts', icon: 'contact', shortcut: 'c' },
    { label: 'Email settings', path: 'email/settings', icon: 'settings' },
    { label: 'Audit', path: 'audit', icon: 'audit', permission: 'hub.audit' },
    { label: 'Settings', path: 'settings', icon: 'settings' },
  ],
  routes: {
    '': { permission: 'read', render: OverviewPage },
    workspaces: { permission: 'read', render: WorkspacesPage },
    'workspaces/:id': { permission: 'read', render: WorkspaceDetailPage },
    users: { permission: 'read', render: UsersPage },
    payments: { permission: 'read', render: PaymentsPage },
    whitelist: { permission: 'read', render: WhitelistPage },
    support: { permission: 'read', render: SupportPage },
    email: { permission: 'read', render: EmailRemindersPage },
    'email/templates': { permission: 'read', render: EmailTemplatesPage },
    'email/templates/:key': { permission: 'read', render: EmailTemplatePage },
    'email/send': { permission: 'read', render: EmailSendPage },
    'email/outbox': { permission: 'read', render: EmailOutboxPage },
    'email/contacts': { permission: 'read', render: EmailContactsPage },
    'email/settings': { permission: 'read', render: EmailSettingsPage },
    audit: { permission: 'hub.audit', render: AuditPage },
    settings: { permission: 'read', render: ({ role }) => SettingsPage({ role, manifest: teamManagement.manifest }) },
  },
  exports: {
    payments: {
      permission: 'export.csv', filename: 'team-management-payments',
      rows: async (sp) => filterPayments((await listPayments()).rows, filtersFromParams(sp)).map((r) => ({
        date: r.createdAt, email: r.email, name: r.name, plan: r.plan ?? r.productName, reason: REASON_LABEL[r.reason] ?? r.reason,
        amount: (r.amount / 100).toFixed(2), refunded: (r.refunded / 100).toFixed(2), currency: r.currency.toUpperCase(), status: STATUS_LABEL[r.status] ?? r.status,
        order_id: r.id, app_user_id: r.externalId, invoice: r.invoice,
      })),
    },
  },
  headline: async () => {
    if (!tmsConfigured()) return [{ label: 'Users', value: '—' }, { label: 'Paying', value: '—' }, { label: 'MRR', value: '—' }];
    const [o, ppl] = await Promise.all([getOverview(), peopleInWorkspaces().catch(() => null)]);
    return [
      { label: 'People', value: int(ppl ? ppl.people : o.users.total) },
      { label: 'Paying', value: int(o.billing.payingAccounts) },
      { label: 'MRR', value: money(o.billing.mrrCents / 100) },
    ];
  },
  attention: async () => {
    if (!tmsConfigured()) return [{ label: 'Donexel is not connected', detail: 'Setup', href: `${base}/settings`, tone: 'warning' }];
    const o = await getOverview();
    const out: Attention[] = [];
    if (o.billing.trialsEndingIn3Days > 0) out.push({ label: 'Trials ending within 3 days', detail: String(o.billing.trialsEndingIn3Days), href: `${base}/workspaces`, tone: 'info' });
    return out;
  },
  health: async () => {
    if (!tmsConfigured()) return 'warn';
    await getOverview();
    return 'ok';
  },
  search: async (q) => {
    if (!tmsConfigured()) return [];
    const r = await listWorkspaces({ search: q, page: 1, pageSize: 8 });
    return r.items.map((w) => ({ type: 'Workspace', label: w.name, sub: w.owner?.email || undefined, href: `${base}/workspaces?q=${encodeURIComponent(w.name)}` }));
  },
};
export default teamManagement;
