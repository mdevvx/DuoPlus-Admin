import 'server-only';
import { int, money } from '@/lib/format';
import type { ProductModule } from '../types';
import { getOverview } from './queries/overview';
import { attentionCounts, productHealthSummary } from './queries/ops';
import { searchServers } from './queries/servers';
import { searchCustomers } from './queries/customers';
import { exportPayments } from './queries/payments';
import { OverviewPage } from './pages/overview';
import { ServerDetailPage, ServersPage } from './pages/servers';
import { CustomerDetailPage, CustomersPage } from './pages/customers';
import { BotStatusPage } from './pages/bot';
import { PaymentsPage } from './pages/payments';
import { AuditPage, HealthPage, RemindersPage, SettingsPage, SubscriptionsPage } from './pages/ops';
import { SLUG, str } from './db';

const base = `/p/${SLUG}`;

const pulsenotify: ProductModule = {
  manifest: { slug: SLUG, name: 'PulseNotify', description: 'Discord bot for social-media alerts, billed per server', icon: 'bell', logo: '/products/pulsenotify.png' },
  navigation: [
    { label: 'Overview', path: '', icon: 'overview', shortcut: 'o' },
    { label: 'Bot status', path: 'bot', icon: 'health', shortcut: 'k' },
    { label: 'Servers', path: 'servers', icon: 'servers', shortcut: 's' },
    { label: 'Customers', path: 'customers', icon: 'customers', shortcut: 'c' },
    { label: 'Payments', path: 'payments', icon: 'payments', shortcut: 'p' },
    { label: 'Subscriptions', path: 'subscriptions', icon: 'subscriptions', shortcut: 'b' },
    { label: 'Reminders & email', path: 'reminders', icon: 'reminders', shortcut: 'r' },
    { label: 'Platform health', path: 'health', icon: 'health', shortcut: 'e' },
    { label: 'Audit', path: 'audit', icon: 'audit', permission: 'hub.audit' },
    { label: 'Settings', path: 'settings', icon: 'settings' },
  ],
  routes: {
    '': { permission: 'read', render: OverviewPage },
    bot: { permission: 'read', render: BotStatusPage },
    servers: { permission: 'read', render: ServersPage },
    'servers/:id': { permission: 'read', render: ServerDetailPage },
    customers: { permission: 'read', render: CustomersPage },
    'customers/:id': { permission: 'read', render: CustomerDetailPage },
    payments: { permission: 'read', render: PaymentsPage },
    subscriptions: { permission: 'read', render: () => SubscriptionsPage() },
    reminders: { permission: 'read', render: RemindersPage },
    health: { permission: 'read', render: HealthPage },
    audit: { permission: 'hub.audit', render: AuditPage },
    settings: { permission: 'read', render: () => SettingsPage() },
  },
  headline: async () => {
    const o = await getOverview();
    return [
      { label: 'Servers with bot', value: int(o.botPresent) },
      { label: 'Active subs', value: int(o.activeTotal) },
      { label: 'MRR', value: money(o.mrr) },
    ];
  },
  attention: async () => {
    const [c, o] = await Promise.all([attentionCounts(), getOverview()]);
    const out: Awaited<ReturnType<NonNullable<ProductModule['attention']>>> = [];
    if (c.past_due) out.push({ label: 'Cards past due', detail: String(c.past_due), href: `${base}/subscriptions`, tone: 'danger' });
    if (c.pending) out.push({ label: 'Crypto payments pending over 1 hour', detail: String(c.pending), href: `${base}/subscriptions`, tone: 'warning' });
    if (c.failed) out.push({ label: 'Failed payments (30 days)', detail: String(c.failed), href: `${base}/payments?status=failed`, tone: 'warning' });
    if (o.trialsEnding) out.push({ label: 'Trials ending within 3 days', detail: String(o.trialsEnding), href: `${base}/servers?state=trial`, tone: 'info' });
    if (o.maintenance) out.push({ label: 'Maintenance mode is on', detail: 'On', href: `${base}/health`, tone: 'warning' });
    return out;
  },
  health: productHealthSummary,
  search: async (q) => {
    const [servers, customers] = await Promise.all([searchServers(q), searchCustomers(q)]);
    return [
      ...servers.map((s) => ({ type: 'Server', label: str(s.name) ?? String(s.guild_id), sub: String(s.guild_id), href: `${base}/servers/${s.guild_id}` })),
      ...customers.map((c) => ({ type: 'Customer', label: str(c.discord_username) ?? String(c.discord_user_id), sub: String(c.discord_user_id), href: `${base}/customers/${c.discord_user_id}` })),
    ];
  },
  exports: {
    payments: { permission: 'export.csv', filename: 'pulsenotify-payments', rows: exportPayments },
  },
};
export default pulsenotify;
