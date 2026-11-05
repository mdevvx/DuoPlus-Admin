import 'server-only';
import { int, money } from '@/lib/format';
import type { ProductModule } from '../types';
import { getOverview } from './queries/overview';
import { attentionCounts, productHealthSummary } from './queries/ops';
import { searchServers } from './queries/servers';
import { searchCustomers, searchMembers } from './queries/customers';
import { searchPayments } from './queries/payments';
import { maskEmail } from '@/lib/format';
import { exportPayments } from './queries/payments';
import { getGrandfathering } from './queries/freeplan';
import { BOT_OFFLINE_BURST, jobStats } from './queries/jobs';
import { exportEmailContacts } from './queries/email';
import { OverviewPage } from './pages/overview';
import { ServerDetailPage, ServersPage } from './pages/servers';
import { CustomerDetailPage, CustomersPage } from './pages/customers';
import { BotStatusPage } from './pages/bot';
import { PaymentsPage } from './pages/payments';
import { JobsPage } from './pages/jobs';
import { FreePlanPage } from './pages/freeplan';
import { AuditPage, HealthPage, RemindersPage, SettingsPage, SubscriptionsPage } from './pages/ops';
import { EmailBatchPage, EmailSendPage, EmailContactsPage, EmailOutboxPage, EmailSettingsPage, EmailTemplatePage, EmailTemplatesPage } from './pages/email';
import { SLUG, str } from './db';

const base = `/p/${SLUG}`;

const disconotify: ProductModule = {
  manifest: { slug: SLUG, name: 'DiscoNotify', description: 'Discord bot for social-media alerts, billed per server', icon: 'bell', logo: '/products/disconotify.png' },
  navigation: [
    { label: 'Overview', path: '', icon: 'overview', shortcut: 'o' },
    { label: 'Bot status', path: 'bot', icon: 'health', shortcut: 'k' },
    { label: 'Servers', path: 'servers', icon: 'servers', shortcut: 's' },
    { label: 'Customers', path: 'customers', icon: 'customers', shortcut: 'c' },
    { label: 'Payments', path: 'payments', icon: 'payments', shortcut: 'p' },
    { label: 'Subscriptions', path: 'subscriptions', icon: 'subscriptions', shortcut: 'b' },
    { label: 'Free-plan usage', path: 'free-plan', icon: 'overview', shortcut: 'f' },
    { label: 'Dashboard jobs', path: 'jobs', icon: 'health', shortcut: 'j' },
    { label: 'Reminders & email', path: 'reminders', icon: 'reminders', shortcut: 'r' },
    { label: 'Email templates', path: 'email/templates', icon: 'template', shortcut: 't' },
    { label: 'Send email', path: 'email/send', icon: 'outbox', shortcut: 'm' },
    { label: 'Email outbox', path: 'email/outbox', icon: 'outbox', shortcut: 'u' },
    { label: 'Email contacts', path: 'email/contacts', icon: 'contact', shortcut: 'a' },
    { label: 'Email settings', path: 'email/settings', icon: 'settings' },
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
    'free-plan': { permission: 'read', render: FreePlanPage },
    jobs: { permission: 'read', render: JobsPage },
    reminders: { permission: 'read', render: RemindersPage },
    'email/templates': { permission: 'read', render: EmailTemplatesPage },
    'email/templates/:key': { permission: 'read', render: EmailTemplatePage },
    'email/send': { permission: 'email.send', render: EmailSendPage },
    'email/send/:batch': { permission: 'email.send', render: EmailBatchPage },
    'email/outbox': { permission: 'read', render: EmailOutboxPage },
    'email/contacts': { permission: 'read', render: EmailContactsPage },
    'email/settings': { permission: 'read', render: EmailSettingsPage },
    health: { permission: 'read', render: HealthPage },
    audit: { permission: 'hub.audit', render: AuditPage },
    settings: { permission: 'read', render: ({ role }) => SettingsPage({ role, manifest: disconotify.manifest }) },
  },
  headline: async () => {
    const o = await getOverview();
    return [
      { label: 'Servers with bot', value: int(o.botPresent) },
      { label: 'Paid servers', value: int(o.paidTotal) },
      { label: 'MRR', value: money(o.mrr) },
    ];
  },
  attention: async () => {
    const [c, o, j] = await Promise.all([attentionCounts(), getOverview(), jobStats().catch(() => null)]);
    const out: Awaited<ReturnType<NonNullable<ProductModule['attention']>>> = [];
    if (c.past_due) out.push({ label: 'Cards past due', detail: String(c.past_due), href: `${base}/subscriptions`, tone: 'danger' });
    if (c.pending) out.push({ label: 'Crypto payments pending over 1 hour', detail: String(c.pending), href: `${base}/subscriptions`, tone: 'warning' });
    if (c.failed) out.push({ label: 'Failed payments (30 days)', detail: String(c.failed), href: `${base}/payments?status=failed`, tone: 'warning' });
    if (o.overLimit) out.push({ label: 'Free servers over the free limit', detail: String(o.overLimit), href: `${base}/servers?flag=over_limit`, tone: 'info' });
    if (o.aboutToLapse) out.push({ label: 'Paid servers about to lapse', detail: String(o.aboutToLapse), href: `${base}/servers?flag=card_cancelling`, tone: 'warning' });
    if (j && j.offlineLastHour >= BOT_OFFLINE_BURST) out.push({ label: 'Dashboard jobs failing: the bot looks offline', detail: String(j.offlineLastHour), href: `${base}/jobs?code=bot_offline`, tone: 'danger' });
    if (c.card_but_free) out.push({ label: 'Card subscriptions not applied (still Free)', detail: String(c.card_but_free), href: `${base}/subscriptions`, tone: 'danger' });
    if (o.maintenance) out.push({ label: 'Maintenance mode is on', detail: 'On', href: `${base}/health`, tone: 'warning' });
    return out;
  },
  health: productHealthSummary,
  search: async (q) => {
    const [servers, customers, members, payments] = await Promise.all([searchServers(q), searchCustomers(q), searchMembers(q), searchPayments(q)]);
    return [
      ...servers.map((s) => ({ type: 'Server', label: str(s.name) ?? String(s.guild_id), sub: String(s.guild_id), href: `${base}/servers/${s.guild_id}` })),
      ...members.map((m) => ({ type: 'Member', label: maskEmail(str(m.email)), sub: String(m.discord_user_id), href: `${base}/servers/${m.guild_id}` })),
      ...payments.map((p) => ({ type: 'Payment', label: `Payment ${str(p.external_id) ?? String(p.id).slice(0, 8)}`, sub: `${money(p.amount_usd as number)} · ${str(p.status)}`, href: `${base}/servers/${p.guild_id}` })),
      ...customers.map((c) => ({ type: 'Customer', label: str(c.discord_username) ?? String(c.discord_user_id), sub: String(c.discord_user_id), href: `${base}/customers/${c.discord_user_id}` })),
    ];
  },
  exports: {
    'email-contacts': { permission: 'email.settings', filename: 'disconotify-email-contacts', rows: exportEmailContacts },
    payments: { permission: 'export.csv', filename: 'disconotify-payments', rows: exportPayments },
    grandfathering: { permission: 'export.csv', filename: 'disconotify-servers-to-announce', rows: getGrandfathering },
  },
};
export default disconotify;
