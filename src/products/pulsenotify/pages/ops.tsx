import { Badge, Card, EmptyState, ErrorPanel, KV, PageHeader, Pagination, FilterBar, Table, Tr } from '@/components/ui';
import { ConfirmAction } from '@/components/confirm-action';
import { DateField } from '@/components/date-field';
import { AuditTable } from '@/components/audit-table';
import { can } from '@/lib/roles';
import { dateTime } from '@/lib/format';
import { PAGE_SIZE } from '@/lib/validation';
import { getBotSettings, getMergedAudit, getPlatformHealth, getAbandonedCheckouts, getReminders, getSubscriptionHealth } from '../queries/ops';
import { resetReminders, setMaintenance } from '../actions';
import type { RouteCtx } from '@/products/types';
import { GenericRows, ServerLink, base } from './shared';
import { guildInfoMap } from '@/lib/discord';
import { SLUG, num, str } from '../db';
import { writeAudit } from '@/lib/audit';
import { CopyId } from '@/components/small-client';
import { PaymentStatus } from './shared';

export async function SubscriptionsPage() {
  let lists;
  try { lists = await getSubscriptionHealth(); } catch { return <ErrorPanel message="Could not load the work list." retryHref={`${base}/subscriptions`} />; }
  const infos = await guildInfoMap(lists.flatMap((l) => l.rows.map((r) => String(r.guild_id))));
  return (
    <>
      <PageHeader title="Subscriptions health" description="Things that may need a human." updatedAt={new Date()} />
      <div className="grid gap-4">
        {lists.map((l) => (
          <Card key={l.key} title={`${l.title} (${l.rows.length})`} action={<span className="text-xs text-muted">{l.hint}</span>}>
            {l.rows.length === 0 ? <EmptyState title="All clear" /> : (
              <Table label={l.title}>
                <thead><tr><th className="th">Server</th><th className="th">Details</th></tr></thead>
                <tbody>{l.rows.map((r, i) => (
                  <Tr key={i}>
                    <td className="td"><ServerLink id={String(r.guild_id)} info={infos[String(r.guild_id)]} /></td>
                    <td className="td text-muted">{Object.entries(r).filter(([k, v]) => k !== 'guild_id' && v !== null && typeof v !== 'object' && !/token|secret|payload/i.test(k) && !/subscription_id|customer_id|external_id/.test(k))
                      .slice(0, 5).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${/_at$|_until$/.test(k) ? dateTime(String(v)) : String(v)}`).join(' · ')}</td>
                  </Tr>
                ))}</tbody>
              </Table>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}

export async function RemindersPage({ role, admin }: RouteCtx) {
  let d;
  let abandoned: Awaited<ReturnType<typeof getAbandonedCheckouts>> = [];
  try { [d, abandoned] = await Promise.all([getReminders(), getAbandonedCheckouts()]); } catch { return <ErrorPanel message="Could not load reminders." retryHref={`${base}/reminders`} />; }
  const infos = await guildInfoMap([...d.upcoming, ...d.recent, ...abandoned].map((r) => String(r.guild_id)));
  if (abandoned.some((a) => a.email)) await writeAudit({ admin_id: admin.id, admin_email: admin.email, product_slug: SLUG, action: 'view.abandoned_checkouts', target_type: 'reminders', target_id: 'abandoned_checkouts' });
  const act = (gid: string, label: string) => can(role, 'reminder.send') && <ConfirmAction label="Reset reminders" title={`Reset reminders for ${label}`} action={resetReminders} hidden={{ guildId: gid }}
    description="Resets the reminder counters. The bot sends the next reminder on its own schedule. Limited to once per hour per server." />;
  const table = (rows: typeof d.upcoming, title: string) => rows.length === 0 ? <EmptyState title={`No ${title.toLowerCase()}`} /> : (
    <Table label={title}>
      <thead><tr><th className="th">Server</th><th className="th">Expires</th><th className="th">DMs sent</th><th className="th">Last DM</th><th className="th" /></tr></thead>
      <tbody>{rows.map((r) => {
        const gid = String(r.guild_id);
        return (
          <Tr key={gid}>
            <td className="td"><ServerLink id={gid} info={infos[gid]} /></td>
            <td className="td num">{dateTime(str(r.paid_until ?? r.trial_ends_at))}</td><td className="td num">{str(r.reminders_sent) ?? '0'}</td>
            <td className="td num">{dateTime(str(r.last_reminder_at))}</td>
            <td className="td text-right">{act(gid, infos[gid]?.name ?? gid)}</td>
          </Tr>
        );
      })}</tbody>
    </Table>
  );
  return (
    <>
      <PageHeader title="Reminders &amp; email" description="Upcoming expiries and recent Discord DM reminders." updatedAt={new Date()} />
      <div className="grid gap-4">
        <Card title="Upcoming (next 7 days)">{table(d.upcoming, 'Upcoming reminders')}</Card>
        <Card title={`Unfinished checkouts (${abandoned.length})`} action={<span className="text-xs text-muted">Last 30 days · emails shown in full, this view is audit-logged</span>}>
          {abandoned.length === 0 ? <EmptyState compact title="No unfinished checkouts" hint="People who start a purchase and don't pay appear here" /> : (
            <Table label="Unfinished checkouts" bare>
              <thead><tr><th className="th">Server</th><th className="th">Discord user ID</th><th className="th">Email</th><th className="th">Plan</th><th className="th">Started</th><th className="th">Status</th></tr></thead>
              <tbody>{abandoned.map((a) => {
                const gid = String(a.guild_id);
                return (
                  <Tr key={String(a.id)}>
                    <td className="td"><ServerLink id={gid} info={infos[gid]} /></td>
                    <td className="td"><CopyId value={String(a.requested_by)} /></td>
                    <td className="td">{a.email ? <CopyId value={a.email} mono={false} /> : <span className="text-muted">No email shared</span>}</td>
                    <td className="td num whitespace-nowrap">{num(a.months)} mo · ${num(a.amount_usd).toFixed(2)}</td>
                    <td className="td num whitespace-nowrap">{dateTime(str(a.created_at))}</td>
                    <td className="td"><PaymentStatus status={a.status} /></td>
                  </Tr>
                );
              })}</tbody>
            </Table>
          )}
        </Card>
        <Card title="Recently reminded">{table(d.recent, 'Recent reminders')}</Card>
      </div>
    </>
  );
}

export async function HealthPage({ role }: RouteCtx) {
  let d;
  try { d = await getPlatformHealth(); } catch { return <ErrorPanel message="Could not load platform health." retryHref={`${base}/health`} />; }
  return (
    <>
      <PageHeader title="Platform health" updatedAt={new Date()} description="Status of each monitored platform and the bot's maintenance flag."
        actions={can(role, 'maintenance.set') && (
          <ConfirmAction label={d.maintenance ? 'Turn maintenance OFF' : 'Turn maintenance ON'} danger={!d.maintenance} small={false} title="Maintenance mode" action={setMaintenance}
            hidden={{ enabled: String(!d.maintenance) }} typeToConfirm="MAINTENANCE" description="Writes the flag the bot reads. Alerts may pause while it is on." />
        )} />
      <div className="mb-4"><Card><KV items={[['Maintenance mode', d.maintenance ? <Badge key="m" tone="warning">On</Badge> : <Badge key="m" tone="success">Off</Badge>]]} /></Card></div>
      <Card title="Platforms"><GenericRows rows={d.platforms} label="Platforms" prefer={['platform', 'status', 'quota_used', 'quota_limit', 'error_count', 'last_success_at', 'last_error_at']} max={8} /></Card>
    </>
  );
}

export async function AuditPage({ searchParams }: RouteCtx) {
  const { rows, total, f } = await getMergedAudit(searchParams);
  const params = { action: f.action, admin: f.admin, target: f.target, from: f.from, to: f.to };
  return (
    <>
      <PageHeader title="Audit" description="Admin actions on this product merged with the bot's own audit log." updatedAt={new Date()} />
      <FilterBar action={`${base}/audit`}>
        <input className="input w-44" name="action" placeholder="Action prefix" defaultValue={f.action} />
        <input className="input w-52" name="admin" placeholder="Admin email contains" defaultValue={f.admin} />
        <input className="input w-44" name="target" placeholder="Server ID" defaultValue={f.target} />
        <DateField name="from" defaultValue={f.from} placeholder="From date" />
        <DateField name="to" defaultValue={f.to} placeholder="To date" />
      </FilterBar>
      <AuditTable rows={rows} showProduct={false} />
      <Pagination base={`${base}/audit`} params={params} page={f.page} pageSize={PAGE_SIZE} total={total} />
    </>
  );
}

export async function SettingsPage() {
  const rows = await getBotSettings();
  return (
    <>
      <PageHeader title="Settings" description="Read only: how the bot currently runs. Change these on the bot's host." updatedAt={new Date()} />
      <Card>
        {rows.length === 0 ? <EmptyState title="Configured on the bot's host" hint="Price, trial days, grace days and the reminder schedule are environment variables of the bot, not stored in the database." /> : (
          <KV items={rows.map((r) => [String(r.key).replace(/_/g, ' '), typeof r.value === 'object' ? JSON.stringify(r.value) : String(r.value)])} />
        )}
      </Card>
    </>
  );
}
