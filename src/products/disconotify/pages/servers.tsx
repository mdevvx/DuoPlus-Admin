import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Card, EmptyState, ErrorPanel, KV, PageHeader, Pagination, SortHeader, Stat, Table, Tr, When } from '@/components/ui';
import { ConfirmAction } from '@/components/confirm-action';
import { ClampText, CopyId } from '@/components/small-client';
import { can } from '@/lib/roles';
import { dateTime, dateOnly, maskEmail, money, platformLabel, relative, sentence, statusTone } from '@/lib/format';
import { writeAudit } from '@/lib/audit';
import { PAGE_SIZE, snowflake } from '@/lib/validation';
import { getServer, listServers, serverParams } from '../queries/servers';
import { emailBadges } from '../queries/email';
import { AddContact } from '@/components/email-row-actions';
import { grantPaidTime, markBotRemoved, pauseAccount, removeAccount, removePaidTime, removeWhitelist, resetReminders, resumeAccount, whitelistServer } from '../actions';
import type { RouteCtx } from '@/products/types';
import { OutboxStatus } from './email';
import { JobsTable } from './jobs';
import { ChannelsMini, DmStatus, GenericRows, PlatformBadge, dmKindLabel, PaymentsMini, ServerLink, StateBadge, base } from './shared';
import { ServerAvatar } from '@/components/server-avatar';
import { DiscordNotice } from '@/components/discord-notice';
import { getGuildInfo, guildInfoMap } from '@/lib/discord';
import { SLUG, num, pick, str, type Row } from '../db';
import { accountUrl, platformOrder } from '@/lib/platforms';
import { Filters } from '@/components/filters';
import { STATE_LABEL, pausedByPlan, planFromBilling, subscriptionState } from '../state';

export async function ServersPage({ searchParams }: RouteCtx) {
  const p = serverParams.parse(searchParams);
  let data;
  try { data = await listServers(p); } catch { return <ErrorPanel message="Could not load servers." retryHref={`${base}/servers`} />; }
  const [infos, mail] = await Promise.all([guildInfoMap(data.rows.map((r) => r.guild_id)), emailBadges(data.rows.map((r) => r.guild_id)).catch(() => null)]);
  const keep = { q: p.q, plan: p.plan, flag: p.flag, sort: p.sort, dir: p.dir };
  const path = `${base}/servers`;
  return (
    <>
      <PageHeader title="Servers" description="Every Discord server with its plan and accounts." updatedAt={new Date()} />
      <DiscordNotice />
      <Filters action={path} fields={[
        { type: 'search', key: 'q', label: 'Search', placeholder: 'Server name or ID' },
        { type: 'multi', key: 'plan', label: 'Plan', options: [['free', 'Free'], ['paid', 'Paid'], ['grace', 'Grace'], ['whitelisted', 'Whitelisted']] },
        { type: 'multi', key: 'flag', label: 'Also', options: [['was_paid', 'Was paid before'], ['over_limit', 'Over the free limit'], ['card_past_due', 'Card past due'], ['card_cancelling', 'Card cancelling'], ['bot_removed', 'Bot removed'], ['bot_off', 'Bot switched off']] },
      ]} />
      {data.rows.length === 0 ? <div className="card"><EmptyState title="No servers match" hint="Change the search or filters." /></div> : (
        <Table label="Servers">
          <thead><tr>
            <SortHeader label="Server" field="name" base={path} params={keep} sort={p.sort} dir={p.dir} />
            <th className="th">Plan</th>
            <th className="th">Accounts</th>
            <th className="th">Bot</th>
            <SortHeader label="Paid until" field="paid_until" base={path} params={keep} sort={p.sort} dir={p.dir} />
            <th className="th">Email</th>
          </tr></thead>
          <tbody>{data.rows.map((r) => {
            const perPlatform = Object.entries(r.stats.perPlatform).sort(([a], [b]) => platformOrder(a) - platformOrder(b)).map(([k, n]) => `${platformLabel(k)} ${n}`).join(' · ');
            return (
              <Tr key={r.guild_id}>
                <td className="td"><ServerLink id={r.guild_id} info={infos[r.guild_id]} /></td>
                <td className="td"><StateBadge billing={r.plan} botPresent={r.bot_present} /></td>
                <td className="td" title={perPlatform || undefined}>
                  <span className="num">{r.stats.total}</span>
                  {r.stats.paused > 0 && <span className="ml-2"><Badge tone="warning">{r.stats.paused} paused by plan</Badge></span>}
                </td>
                <td className="td">
                  <span className="inline-flex flex-wrap items-center gap-1">
                    <Badge tone={r.bot_present === false ? 'danger' : r.bot_present ? 'success' : 'neutral'}>{r.bot_present === false ? 'Removed' : r.bot_present ? 'Present' : 'Unknown'}</Badge>
                    {r.bot_present && r.enabled === false && <Badge tone="warning">Switched off</Badge>}
                  </span>
                </td>
                <td className="td"><When value={str(r.plan.paid_until)} /></td>
                <td className="td">{!mail ? '—' : (
                  <span className="inline-flex flex-wrap items-center gap-1">
                    {mail.hasEmail.has(r.guild_id) ? <Badge tone="success">Has email</Badge> : <span className="text-muted">None</span>}
                    {(mail.failed.get(r.guild_id) ?? 0) > 0 && <Badge tone="danger">{mail.failed.get(r.guild_id)} failed</Badge>}
                  </span>)}</td>
              </Tr>
            );
          })}</tbody>
        </Table>
      )}
      <Pagination base={path} params={{ q: p.q, plan: p.plan, flag: p.flag, sort: p.sort, dir: p.dir }} page={p.page} pageSize={PAGE_SIZE} total={data.total} />
    </>
  );
}

function AccountsCard({ accounts, role, guildId }: { accounts: Row[]; role: Parameters<typeof can>[0]; guildId: string }) {
  if (accounts.length === 0) return <EmptyState compact title="No monitored accounts" />;
  const act = can(role, 'support.act');
  const sorted = [...accounts].sort((a, b) => platformOrder(str(a.platform)) - platformOrder(str(b.platform)));
  return (
    <Table label="Monitored accounts" bare>
      <thead><tr><th className="th">Account</th><th className="th">Status</th><th className="th">Last checked</th><th className="th">Last error</th>{act && <th className="th" />}</tr></thead>
      <tbody>{sorted.map((a, i) => {
        const handle = str(a.username) ?? str(a.display_name) ?? '—';
        const url = accountUrl(str(a.platform), handle);
        const status = str(a.status) ?? 'unknown';
        const on = a.enabled !== false;
        const id = str(a.id);
        const hidden = { guildId, accountId: id ?? '' };
        return (
          <Tr key={id ?? i}>
            <td className="td"><span className="inline-flex flex-wrap items-center gap-2"><PlatformBadge platform={str(a.platform)} />
              {url ? <a className="text-accent hover:underline" href={url} target="_blank" rel="noopener noreferrer">{handle}</a> : handle}</span></td>
            <td className="td"><span className="inline-flex flex-wrap items-center gap-1">
              <Badge tone={statusTone(status)}>{sentence(status)}</Badge>
              {pausedByPlan(a) && <Badge tone="warning">Paused — free plan</Badge>}
              {!on && !pausedByPlan(a) && <Badge tone="neutral">Switched off</Badge>}
            </span></td>
            <td className="td num whitespace-nowrap">{dateTime(pick(a, 'last_checked_at', 'last_check_at', 'checked_at'))}</td>
            <td className="td">{str(a.last_error) ? <ClampText text={String(a.last_error)} title="Last error" max={48} /> : '—'}</td>
            {act && <td className="td text-right">{id && (
              <span className="inline-flex gap-2">
                {on
                  ? <ConfirmAction label="Pause" title="Pause this account" action={pauseAccount} hidden={hidden} compact />
                  : <ConfirmAction label="Resume" title="Resume this account" action={resumeAccount} hidden={hidden} compact />}
                <ConfirmAction label="Remove" title="Remove this account" danger action={removeAccount} hidden={hidden} compact description="The server loses this account and its alert settings." />
              </span>)}</td>}
          </Tr>
        );
      })}</tbody>
    </Table>
  );
}

/** Which alert types are on per account, who is mentioned and whether a custom message exists. Message text itself is not shown. */
function ConfigSummary({ configs }: { configs: Row[] }) {
  if (configs.length === 0) return <EmptyState compact title="No alert configuration" />;
  const rows = configs.map((c) => {
    const types = Object.entries(c).filter(([k, v]) => v === true && /^(notify_|alert_|send_|on_)/.test(k)).map(([k]) => sentence(k.replace(/^(notify_|alert_|send_|on_)/, '')));
    const mention = pick(c, 'mention', 'mention_role', 'mention_role_id', 'mention_everyone');
    const custom = !!pick(c, 'custom_message', 'message_template', 'message');
    return { platform: pick(c, 'platform'), account: pick(c, 'username', 'platform_account_id', 'account_id'), type: pick(c, 'alert_type', 'event_type'), types, mention, custom, enabled: c.enabled !== false };
  });
  return (
    <Table label="Alert configuration" bare>
      <thead><tr><th className="th">Account</th><th className="th">Alerts on</th><th className="th">Mention</th><th className="th">Custom message</th></tr></thead>
      <tbody>{rows.map((r, i) => (
        <Tr key={i}>
          <td className="td">{r.platform ? <PlatformBadge platform={r.platform} suffix={r.account ?? undefined} /> : (r.account ?? '—')}</td>
          <td className="td">{r.type ? <span>{sentence(r.type)} · {r.enabled ? 'On' : 'Off'}</span> : r.types.length ? r.types.join(', ') : '—'}</td>
          <td className="td">{r.mention && r.mention !== 'false' ? <span className="num">{r.mention === 'true' ? 'Yes' : r.mention}</span> : 'None'}</td>
          <td className="td">{r.custom ? 'Yes' : 'No'}</td>
        </Tr>
      ))}</tbody>
    </Table>
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
  const pl = d.plan ?? {};
  // Owner email is shown in full here, so this page view is audit-logged.
  await writeAudit({ admin_id: admin.id, admin_email: admin.email, product_slug: SLUG, action: 'view.server', target_type: 'server', target_id: id.data });
  const botPresent = (pl.bot_present as boolean | null | undefined) ?? (d.guild.bot_present as boolean | null) ?? null;
  const hidden = { guildId: id.data };
  const planRow: Row = { ...(b ?? {}), ...pl };
  const subState = subscriptionState({ plan: str(pl.plan), paid_until: str(planRow.paid_until), whitelisted: planRow.whitelisted as boolean | null, card_subscription_id: str(b?.card_subscription_id), card_status: str(planRow.card_status), has_card_subscription: pl.has_card_subscription as boolean | null }, botPresent);
  const planKey = planFromBilling({ plan: str(pl.plan), paid_until: str(planRow.paid_until), whitelisted: planRow.whitelisted as boolean | null });
  const hasPaidTime = !!planRow.paid_until && new Date(String(planRow.paid_until)).getTime() > Date.now();
  const paidRows = d.payments.filter((p) => p.status === 'paid');
  const lifetime = paidRows.reduce((a, p) => a + num(p.amount_usd), 0);
  const pausedCount = d.accounts.filter(pausedByPlan).length;
  const lastEmail = d.emailTimeline?.[0];
  const ownerId = str(pl.owner_id) ?? d.ownerId;
  const acts = (
    <div className="flex flex-wrap gap-2">
      {can(role, 'email.send') && <Link className="btn" href={`${base}/email/send?guild=${id.data}`}>Send email to this server</Link>}
      {can(role, 'email.send') && lastEmail && <Link className="btn" href={`${base}/email/send?again=${encodeURIComponent(String(lastEmail.id))}`}>Resend last email</Link>}
      <Link className="btn" href={`${base}/jobs?guild=${id.data}`}>Recent jobs for this server</Link>
      {can(role, 'server.adjust_paid') && b && <ConfirmAction label="Grant paid time" title="Grant paid time" danger action={grantPaidTime} hidden={hidden} typeToConfirm={name}
        description="A comp or goodwill gift. The server shows as Paid with no payment row, so revenue is not affected. The reason is kept in the audit log."
        fields={[{ name: 'days', label: 'Days to add (1-365)', type: 'number', min: 1, max: 365 }]} />}
      {can(role, 'server.adjust_paid') && hasPaidTime && <ConfirmAction label="Remove paid time" title="Remove paid time" danger action={removePaidTime} hidden={hidden} typeToConfirm={name}
        description="Sets the paid-until date to now. The server drops to the grace period, then to Free." />}
      {can(role, 'server.whitelist') && b && (b.whitelisted
        ? <ConfirmAction label="Remove whitelist" title="Remove whitelist" danger action={removeWhitelist} hidden={hidden} typeToConfirm={name} />
        : <ConfirmAction label="Whitelist" title="Whitelist this server" action={whitelistServer} hidden={hidden} typeToConfirm={name} description="Unlimited, never pays. The reason is saved as the whitelist note." />)}
      {can(role, 'reminder.send') && b && <ConfirmAction label="Reset reminders" title="Reset reminder counters" action={resetReminders} hidden={hidden} description="Clears the counters so the bot sends the next reminder on its schedule." />}
      {can(role, 'server.mark_removed') && botPresent !== false && <ConfirmAction label="Mark bot removed" title="Mark bot as removed" danger action={markBotRemoved} hidden={hidden} typeToConfirm={name} />}
    </div>
  );
  const ownerEmail = ownerId ? str(d.memberEmails.find((m) => String(m.discord_user_id) === ownerId)?.email) : null;
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  const members = pl.member_count ?? d.guild.member_count;
  const added = str(d.guild.created_at);
  return (
    <>
      <PageHeader icon={<ServerAvatar info={info} id={id.data} size={52} />} title={name}
        description={`Server detail · ${id.data}${members ? ` · ${plural(num(members), 'member')}` : ''}${added ? ` · bot added ${dateOnly(added)}` : ''}`}
        actions={<StateBadge billing={planRow} botPresent={botPresent} />} updatedAt={new Date()} />
      <div className="mb-5">{acts}</div>
      <div className="mb-6 grid grid-cols-4 gap-5">
        <Card><Stat icon="subscriptions" label="Plan" value={<span className="text-[22px]">{STATE_LABEL[subState].label}</span>}
          hint={planKey === 'whitelisted' ? 'Unlimited, never pays' : planRow.card_status ? `Card: ${sentence(str(planRow.card_status))}` : planKey === 'free' && planRow.paid_until ? 'Was paid before' : 'No card on file'} /></Card>
        <Card><Stat icon="reminders" label="Paid until" value={<span className="text-[22px]">{dateOnly(str(planRow.paid_until))}</span>} hint={relative(str(planRow.paid_until))} /></Card>
        <Card><Stat icon="payments" label="Lifetime paid" value={money(lifetime)} hint={plural(paidRows.length, 'paid payment')} /></Card>
        <Card><Stat icon="customers" label="Monitored accounts" value={String(d.accounts.length)} hint={pausedCount ? `${pausedCount} paused by the free plan` : plural(d.channels.length, 'channel')} /></Card>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-4">
        <Card title="Server &amp; owner">
          <KV items={[
            ['Server ID', <CopyId key="s" value={id.data} />],
            ['Bot', botPresent === null ? '—' : <span key="bp" className="inline-flex gap-1"><Badge tone={botPresent ? 'success' : 'danger'}>{botPresent ? 'Present' : 'Removed'}</Badge>{botPresent && pl.enabled === false && <Badge tone="warning">Switched off</Badge>}</span>],
            ['Owner ID', ownerId ? <CopyId key="o" value={ownerId} /> : '—'],
            ['Owner email', ownerEmail ? <CopyId key="e" value={ownerEmail} mono={false} /> : <span key="e" className="text-muted">None on file</span>],
          ]} />
        </Card>
        <Card title="Plan &amp; billing">
          {b ? <KV items={[
            ['Plan', STATE_LABEL[subState].label], ['Paid until', dateTime(str(planRow.paid_until))],
            ['Whitelisted', b.whitelisted ? `Yes${b.whitelist_note ? ` — ${str(b.whitelist_note)}` : ''}` : 'No'],
            ['Card status', planRow.card_status ? sentence(str(planRow.card_status)) : '—'], ['Card cancels', dateTime(str(planRow.card_cancels_at))],
            ['Reminders sent', str(b.reminders_sent) ?? '0'], ['Last reminder', dateTime(str(b.last_reminder_at))],
          ]} /> : <EmptyState title="No billing row" hint="The server is on the Free plan." />}
          {d.grants.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <div className="mb-2 text-[13px] font-medium">Paid time granted by an admin (not revenue)</div>
              <ul className="space-y-1 text-sm text-muted">{d.grants.map((g, i) => {
                const after = (g.after ?? {}) as Record<string, unknown>;
                return <li key={i}><span className="num">{dateTime(str(g.at))}</span> · {str(after.days) ?? '?'} days · {str(g.admin_email) ?? 'admin'} · {str(g.reason) ?? '—'}</li>;
              })}</ul>
            </div>
          )}
        </Card>
      </div>
      <div className="grid gap-4">
        <Card title={`Accounts (${d.accounts.length})`}><AccountsCard accounts={d.accounts} role={role} guildId={id.data} /></Card>
        <Card title="Configuration summary"><ConfigSummary configs={d.configs} /></Card>
        <Card title={`Email contacts${d.emailContacts ? ` (${d.emailContacts.length})` : ''}`} action={can(role, 'email.contact') ? <AddContact guildId={id.data} /> : undefined}>
          {d.emailContacts === null ? <EmptyState compact title="Email contacts not available yet" hint="Apply the bot's email migration" /> : d.emailContacts.length === 0 ? <EmptyState compact title="No email contacts" hint="Addresses appear here when someone checks out. Until then this server cannot be emailed." /> : (
            <Table label="Email contacts" bare>
              <thead><tr><th className="th">Address</th><th className="th">Source</th><th className="th">Marketing</th><th className="th">Added</th></tr></thead>
              <tbody>{d.emailContacts.map((c, i) => (
                <Tr key={i}>
                  <td className="td">{maskEmail(str(c.email) ?? str(c.address))}</td>
                  <td className="td">{sentence(str(c.source))}</td>
                  <td className="td">{c.marketing_unsubscribed_at ? <Badge tone="warning">Unsubscribed</Badge> : <Badge tone="success">Subscribed</Badge>}</td>
                  <td className="td"><When value={str(c.created_at)} /></td>
                </Tr>
              ))}</tbody>
            </Table>
          )}
        </Card>
        <Card title="Email timeline" action={<Link className="text-sm text-accent hover:underline" href={`${base}/email/outbox?guild=${id.data}`}>Open in outbox</Link>}>
          {d.emailTimeline === null ? <EmptyState compact title="Email log not available yet" hint="Apply the bot's email migration" /> : d.emailTimeline.length === 0 ? <EmptyState compact title="No emails for this server yet" /> : (
            <Table label="Email timeline" bare>
              <thead><tr><th className="th">When</th><th className="th">Template</th><th className="th">Kind</th><th className="th">Status</th><th className="th">Subject</th></tr></thead>
              <tbody>{d.emailTimeline.map((e, i) => (
                <Tr key={i}>
                  <td className="td num whitespace-nowrap">{dateTime(str(e.created_at))}</td>
                  <td className="td">{str(e.template_key) ? sentence(str(e.template_key)) : 'Custom'}</td>
                  <td className="td">{e.kind === 'manual' ? 'Manual' : 'Automatic'}</td>
                  <td className="td"><OutboxStatus status={e.status} /></td>
                  <td className="td">{str(e.subject_override) ?? '—'}</td>
                </Tr>
              ))}</tbody>
            </Table>
          )}
        </Card>
        <Card title={`Member emails (${d.memberEmails.length})`}>
          <p className="mb-4 text-muted">Emails are shown in full, so this page view is audit-logged.</p>
          {d.memberEmails.length === 0 ? <EmptyState compact title="No member emails" hint="Emails members share with the bot in this server appear here" /> : (
            <Table label="Member emails" bare>
              <thead><tr><th className="th">Email</th><th className="th">Discord user ID</th><th className="th">Added</th><th className="th">Last DM</th></tr></thead>
              <tbody>
                {d.memberEmails.map((m) => {
                  const last = d.dmLog?.find((x) => String(x.discord_user_id) === String(m.discord_user_id));
                  return (
                    <Tr key={`${str(m.discord_user_id)}-${str(m.email)}`}>
                      <td className="td">{m.email ? <CopyId value={String(m.email)} mono={false} /> : '—'}</td>
                      <td className="td">{m.discord_user_id ? <CopyId value={String(m.discord_user_id)} /> : '—'}</td>
                      <td className="td num whitespace-nowrap">{dateTime(str(m.created_at))}</td>
                      <td className="td">{last ? <span className="inline-flex flex-wrap items-center gap-2"><DmStatus status={last.status} /><span className="text-xs text-muted">{dmKindLabel(last.kind)} · {dateTime(str(last.created_at))}</span></span> : <span className="text-muted">{d.dmLog ? 'No DM yet' : '—'}</span>}</td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
        <Card title="Welcome DMs">
          {d.dmLog === null ? <EmptyState compact title="DM log not available yet" hint="Apply the bot's dm_log migration to see every DM here" />
            : d.dmLog.length === 0 ? <EmptyState compact title="No welcome DM sent for this server" />
            : (
              <Table label="Message history" bare>
                <thead><tr><th className="th">When</th><th className="th">Member</th><th className="th">Message</th><th className="th">Status</th><th className="th">Detail</th></tr></thead>
                <tbody>{d.dmLog.map((x) => (
                  <Tr key={String(x.id)}>
                    <td className="td num whitespace-nowrap">{dateTime(str(x.created_at))}</td>
                    <td className="td"><CopyId value={String(x.discord_user_id)} /></td>
                    <td className="td">{dmKindLabel(x.kind)}</td>
                    <td className="td"><DmStatus status={x.status} /></td>
                    <td className="td text-muted">{str(x.error) ?? '—'}</td>
                  </Tr>
                ))}</tbody>
              </Table>
            )}
        </Card>
        <Card title="Payment history"><PaymentsMini rows={d.payments} /></Card>
        <Card title="Notification channels"><ChannelsMini rows={d.channels} /></Card>
        <Card title="Recent alerts"><GenericRows compact rows={d.events.map((e) => {
          const meta = typeof e.metadata === 'object' && e.metadata !== null ? (e.metadata as Record<string, unknown>) : {};
          return { ...e, category: meta.category ?? e.category, viewers: meta.viewer_count ?? e.viewers };
        })} label="Events" prefer={['created_at', 'platform', 'event_type', 'title', 'category', 'viewers']} /></Card>
        <Card title="Dashboard changes" action={<Link className="text-sm text-accent hover:underline" href={`${base}/audit?tab=dashboard&target=${id.data}`}>All changes</Link>}>
          <GenericRows compact rows={d.audit} label="Dashboard changes" prefer={['created_at', 'actor_id', 'action', 'target']} />
        </Card>
        <Card title="Recent jobs" action={<Link className="text-sm text-accent hover:underline" href={`${base}/jobs?guild=${id.data}`}>Open jobs</Link>}>
          <JobsTable rows={d.jobs} showServer={false} />
        </Card>
      </div>
      <p className="mt-4 text-muted">All server actions are written to the audit log with before/after values. <Link className="text-accent" href={`${base}/audit?target=${id.data}`}>View this server&apos;s audit trail</Link></p>
    </>
  );
}
