import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Card, EmptyState, ErrorPanel, FilterBar, KV, PageHeader, Pagination, Select, SortHeader, Stat, Table, Tr, When } from '@/components/ui';
import { ConfirmAction } from '@/components/confirm-action';
import { CopyId } from '@/components/small-client';
import { can } from '@/lib/roles';
import { dateTime, dateOnly, maskEmail, money, relative, sentence } from '@/lib/format';
import { writeAudit } from '@/lib/audit';
import { PAGE_SIZE, snowflake } from '@/lib/validation';
import { getServer, listServers, serverParams } from '../queries/servers';
import { adjustPaidDays, extendTrial, markBotRemoved, removeWhitelist, resetReminders, whitelistServer } from '../actions';
import type { RouteCtx } from '@/products/types';
import { GenericRows, PaymentsMini, ServerLink, StateBadge, base } from './shared';
import { ServerAvatar } from '@/components/server-avatar';
import { DiscordNotice } from '@/components/discord-notice';
import { getGuildInfo, guildInfoMap } from '@/lib/discord';
import { SLUG, num, str } from '../db';
import { STATE_LABEL, subscriptionState } from '../state';

export async function ServersPage({ searchParams }: RouteCtx) {
  const p = serverParams.parse(searchParams);
  let data;
  try { data = await listServers(p); } catch { return <ErrorPanel message="Could not load servers." retryHref={`${base}/servers`} />; }
  const infos = await guildInfoMap(data.rows.map((r) => r.guild_id));
  const keep = { q: p.q, state: p.state, sort: p.sort, dir: p.dir };
  const path = `${base}/servers`;
  return (
    <>
      <PageHeader title="Servers" description="Every Discord server with billing state." updatedAt={new Date()} />
      <DiscordNotice />
      <FilterBar action={path}>
        <input className="input w-64" name="q" placeholder="Server ID" defaultValue={p.q} />
        <Select name="state" label="State" value={p.state} options={[['', 'All'], ['trial', 'Trial'], ['active', 'Active'], ['lapsed', 'Lapsed'], ['whitelisted', 'Whitelisted'], ['card_past_due', 'Card past due'], ['bot_removed', 'Bot removed']]} />
      </FilterBar>
      {data.rows.length === 0 ? <div className="card"><EmptyState title="No servers match" hint="Change the search or filters." /></div> : (
        <Table label="Servers">
          <thead><tr>
            <th className="th">Server</th>
            <SortHeader label="ID" field="guild_id" base={path} params={keep} sort={p.sort} dir={p.dir} />
            <th className="th">State</th>
            <SortHeader label="Trial ends" field="trial_ends_at" base={path} params={keep} sort={p.sort} dir={p.dir} />
            <SortHeader label="Paid until" field="paid_until" base={path} params={keep} sort={p.sort} dir={p.dir} />
          </tr></thead>
          <tbody>{data.rows.map((r) => (
            <Tr key={r.guild_id}>
              <td className="td"><ServerLink id={r.guild_id} info={infos[r.guild_id]} showId={false} /></td>
              <td className="td"><CopyId value={r.guild_id} /></td>
              <td className="td"><StateBadge billing={r.billing} botPresent={r.bot_present} /></td>
              <td className="td"><When value={str(r.billing.trial_ends_at)} /></td>
              <td className="td"><When value={str(r.billing.paid_until)} /></td>
            </Tr>
          ))}</tbody>
        </Table>
      )}
      <Pagination base={path} params={{ q: p.q, state: p.state, sort: p.sort, dir: p.dir }} page={p.page} pageSize={PAGE_SIZE} total={data.total} />
    </>
  );
}

export async function ServerDetailPage({ params, role, admin }: RouteCtx) {
  const id = snowflake.safeParse(params.id);
  if (!id.success) notFound();
  const d = await getServer(id.data);
  if (!d) notFound();
  const info = await getGuildInfo(id.data);
  const name = info?.name ?? id.data; // typed confirmation accepts the name or the ID
  const b = d.billing;
  // Owner email is shown in full here, so this page view is audit-logged.
  await writeAudit({ admin_id: admin.id, admin_email: admin.email, product_slug: SLUG, action: 'view.server', target_type: 'server', target_id: id.data });
  const botPresent = (d.guild.bot_present as boolean | null) ?? null;
  const hidden = { guildId: id.data };
  const subState = subscriptionState({ trial_ends_at: str(b?.trial_ends_at), paid_until: str(b?.paid_until), whitelisted: b?.whitelisted as boolean, card_subscription_id: str(b?.card_subscription_id), card_status: str(b?.card_status) }, botPresent);
  const isPaid = !!b?.paid_until && new Date(String(b.paid_until)).getTime() > Date.now();
  const expiry = str(isPaid ? b?.paid_until : b?.trial_ends_at);
  const paidRows = d.payments.filter((p) => p.status === 'paid');
  const paidCount = paidRows.length;
  const lifetime = paidRows.reduce((a, p) => a + num(p.amount_usd), 0);
  const acts = (
    <div className="flex flex-wrap gap-2">
      {can(role, 'server.trial') && <ConfirmAction label="Extend trial" title="Extend trial" action={extendTrial} hidden={hidden} fields={[{ name: 'days', label: 'Days to add (1-90)', type: 'number', min: 1, max: 90 }]} />}
      {can(role, 'server.adjust_paid') && <ConfirmAction label="Add / remove paid days" title="Adjust paid days" danger action={adjustPaidDays} hidden={hidden} typeToConfirm={name}
        description="Use a negative number to subtract days." fields={[{ name: 'days', label: 'Days (-365 to 365)', type: 'number', min: -365, max: 365 }]} />}
      {can(role, 'server.whitelist') && (b?.whitelisted
        ? <ConfirmAction label="Remove whitelist" title="Remove whitelist" danger action={removeWhitelist} hidden={hidden} typeToConfirm={name} />
        : <ConfirmAction label="Whitelist" title="Whitelist this server" action={whitelistServer} hidden={hidden} typeToConfirm={name} description="The reason is saved as the whitelist note." />)}
      {can(role, 'reminder.send') && <ConfirmAction label="Reset reminders" title="Reset reminder counters" action={resetReminders} hidden={hidden} description="Clears the counters so the bot sends the next reminder on its schedule." />}
      {can(role, 'server.mark_removed') && botPresent !== false && <ConfirmAction label="Mark bot removed" title="Mark bot as removed" danger action={markBotRemoved} hidden={hidden} typeToConfirm={name} />}
    </div>
  );
  const c = d.contact;
  return (
    <>
      <PageHeader icon={<ServerAvatar info={info} id={id.data} size={52} />} title={name} description={info ? `Server detail · ${id.data}` : 'Server detail'} actions={b && <StateBadge billing={b} botPresent={botPresent} />} updatedAt={new Date()} />
      <div className="mb-5">{acts}</div>
      <div className="mb-6 grid grid-cols-4 gap-5">
        <Card><Stat icon="subscriptions" label="Subscription" value={<span className="text-[22px]">{STATE_LABEL[subState].label}</span>} hint={b?.whitelisted ? 'Free access' : b?.card_status ? `Card: ${sentence(str(b.card_status))}` : 'No card on file'} /></Card>
        <Card><Stat icon="reminders" label={isPaid ? 'Paid until' : 'Trial ends'} value={<span className="text-[22px]">{dateOnly(expiry)}</span>} hint={relative(expiry)} /></Card>
        <Card><Stat icon="payments" label="Lifetime paid" value={money(lifetime)} hint={`${paidCount} paid payments`} /></Card>
        <Card><Stat icon="customers" label="Monitored accounts" value={String(d.accounts.length)} hint={`${d.channels.length} channels`} /></Card>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-4">
        <Card title="Server &amp; owner">
          <KV items={[
            ['Server ID', <CopyId key="s" value={id.data} />], ['Bot present', botPresent === null ? '—' : botPresent ? 'Yes' : 'No'],
            ['Owner / last payer ID', d.ownerId ? <CopyId key="o" value={d.ownerId} /> : '—'],
            ['Owner username', str(c?.discord_username)],
            ['Owner email', c?.email ? `${str(c.email)}${c.email_verified ? '' : ' (unverified)'}` : 'None on file'],
            ['Email consent', c?.consented_at ? dateTime(str(c.consented_at)) : 'No consent recorded'],
            ['Reminder emails', c ? (c.reminders_opt_out ? <Badge key="oo" tone="warning">Opted out {dateTime(str(c.opted_out_at))}</Badge> : <Badge key="oi" tone="success">Allowed</Badge>) : '—'],
          ]} />
          {c && <p className="mt-3 text-xs text-muted">Masked in lists as {maskEmail(str(c.email))}. Viewing this page is audit-logged.</p>}
        </Card>
        <Card title="Subscription">
          {b ? <KV items={[
            ['Trial ends', dateTime(str(b.trial_ends_at))], ['Paid until', dateTime(str(b.paid_until))],
            ['Whitelisted', b.whitelisted ? `Yes${b.whitelist_note ? ` — ${str(b.whitelist_note)}` : ''}` : 'No'],
            ['Card status', b.card_status ? sentence(str(b.card_status)) : '—'], ['Card cancels', dateTime(str(b.card_cancels_at))],
            ['DM reminders sent', str(b.reminders_sent) ?? '0'], ['Last reminder', dateTime(str(b.last_reminder_at))], ['Last email', dateTime(str(b.last_email_at))],
          ]} /> : <EmptyState title="No billing row" />}
        </Card>
      </div>
      <div className="grid gap-4">
        <Card title="Payment history"><PaymentsMini rows={d.payments} /></Card>
        <Card title="Monitored accounts"><GenericRows rows={d.accounts} label="Monitored accounts" prefer={['platform', 'username', 'display_name', 'account_id']} /></Card>
        <Card title="Notification channels"><GenericRows rows={d.channels} label="Notification channels" prefer={['channel_id', 'platform', 'name']} /></Card>
        <Card title="Recent events"><GenericRows rows={d.events} label="Events" prefer={['created_at', 'platform', 'event_type', 'title']} /></Card>
        <Card title="Bot audit trail"><GenericRows rows={d.audit} label="Audit entries" prefer={['created_at', 'action', 'user_id']} /></Card>
      </div>
      <p className="mt-4 text-xs text-muted">All server actions are written to the audit log with before/after values. <Link className="text-accent" href={`${base}/audit?target=${id.data}`}>View this server&apos;s audit trail</Link></p>
    </>
  );
}
