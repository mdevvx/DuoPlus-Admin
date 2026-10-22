import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Badge, Card, Cell, EmptyState, ErrorPanel, FilterBar, KV, PageHeader, Pagination, Select, Table, Tr } from '@/components/ui';
import { ConfirmAction } from '@/components/confirm-action';
import { CopyId } from '@/components/small-client';
import { can } from '@/lib/roles';
import { dateTime, maskEmail, money } from '@/lib/format';
import { writeAudit } from '@/lib/audit';
import { PAGE_SIZE, snowflake } from '@/lib/validation';
import { customerParams, getCustomer, listCustomers } from '../queries/customers';
import { deleteContact, disableReminders, enableReminders } from '../actions';
import type { RouteCtx } from '@/products/types';
import { DmStatus, PaymentsMini, ServerLink, base } from './shared';
import { guildInfoMap, userInfoMap } from '@/lib/discord';
import { SLUG, T, pn, str, type Row } from '../db';

export async function CustomersPage({ searchParams }: RouteCtx) {
  const p = customerParams.parse(searchParams);
  let data;
  try { data = await listCustomers(p); } catch { return <ErrorPanel message="Could not load customers." retryHref={`${base}/customers`} />; }
  const path = `${base}/customers`;
  const names = data.derived ? await userInfoMap(data.rows.map((r) => r.discord_user_id)) : {};
  return (
    <>
      <PageHeader title="Customers"
        description={data.derived ? 'Discord users the bot has dealt with: who paid, shared an email or received a DM. Emails are masked in this list.' : 'Discord users with a contact on file. Emails are masked in this list.'}
        updatedAt={new Date()} />
      <FilterBar action={path}>
        <input className="input w-64" name="q" placeholder={data.derived ? 'Discord ID or email' : 'Username, email or Discord ID'} defaultValue={p.q} />
        {!data.derived && <Select name="optout" label="Reminders" value={p.optout} options={[['', 'All'], ['0', 'Allowed'], ['1', 'Opted out']]} />}
      </FilterBar>
      {data.rows.length === 0 ? <div className="card"><EmptyState title="No customers match" hint={data.derived ? 'Nobody has paid, shared an email or been messaged by the bot yet.' : undefined} /></div> : data.derived ? (
        <Table label="Customers">
          <thead><tr><th className="th">User</th><th className="th">Discord ID</th><th className="th">Email</th><th className="th">Last DM</th><th className="th text-right">Servers</th><th className="th text-right">Lifetime</th></tr></thead>
          <tbody>{data.rows.map((c) => (
            <Tr key={c.discord_user_id}>
              <td className="td"><Cell max={220} text={names[c.discord_user_id]?.name ?? 'Unknown user'} href={c.has_detail ? `${path}/${c.discord_user_id}` : undefined} /></td>
              <td className="td"><CopyId value={c.discord_user_id} /></td>
              <td className="td"><Cell max={220} text={maskEmail(str(c.email))} /></td>
              <td className="td">{c.last_dm_at ? <div className="flex flex-wrap items-center gap-1.5"><DmStatus status={c.last_dm_status} /><span className="text-xs text-muted">{dateTime(str(c.last_dm_at)).slice(0, 10)}</span></div> : <span className="text-muted">—</span>}</td>
              <td className="td num text-right">{c.servers}</td><td className="td num text-right">{money(c.lifetime)}</td>
            </Tr>
          ))}</tbody>
        </Table>
      ) : (
        <Table label="Customers">
          <thead><tr><th className="th">User</th><th className="th">Discord ID</th><th className="th">Email</th><th className="th">Consent</th><th className="th">Servers paid</th><th className="th text-right">Lifetime</th></tr></thead>
          <tbody>{data.rows.map((c) => (
            <Tr key={c.discord_user_id}>
              <td className="td"><Link className="font-medium text-accent hover:underline" data-row-link href={`${path}/${c.discord_user_id}`}>{str(c.discord_username) ?? 'Unknown'}</Link></td>
              <td className="td"><CopyId value={c.discord_user_id} /></td>
              <td className="td">{maskEmail(str(c.email))}</td>
              <td className="td">{c.reminders_opt_out ? <Badge tone="warning">Opted out</Badge> : c.consented_at ? <Badge tone="success">Consented</Badge> : <Badge>No consent</Badge>}</td>
              <td className="td num">{c.servers}</td><td className="td num text-right">{money(c.lifetime)}</td>
            </Tr>
          ))}</tbody>
        </Table>
      )}
      <Pagination base={path} params={{ q: p.q, optout: p.optout }} page={p.page} pageSize={PAGE_SIZE} total={data.total} />
    </>
  );
}

export async function CustomerDetailPage({ params, role, admin }: RouteCtx) {
  const id = snowflake.safeParse(params.id);
  if (!id.success) notFound();
  const d = await getCustomer(id.data);
  if (!d) redirect(`${base}/customers`); // nothing to show: go back to the list instead of an error page
  await writeAudit({ admin_id: admin.id, admin_email: admin.email, product_slug: SLUG, action: 'view.customer', target_type: 'customer', target_id: id.data });
  const infos = await guildInfoMap(d.paidServers.map((s) => s.guild_id));
  const c = d.contact;
  const username = c ? str(c.discord_username) : (await userInfoMap([id.data]))[id.data]?.name ?? null;
  const hidden = { userId: id.data };
  const mailRes = await pn().from(T.emailContacts).select('*').eq('discord_user_id', id.data).limit(50);
  const mail = mailRes.error ? null : ((mailRes.data ?? []) as Row[]);
  const mailInfos = await guildInfoMap((mail ?? []).map((m) => String(m.guild_id)));
  return (
    <>
      <PageHeader title={username ?? `User ${id.data}`} description="Customer detail. Viewing this page is audit-logged." updatedAt={new Date()} />
      {c && (
        <div className="mb-4 flex flex-wrap gap-2">
          {can(role, 'contact.optin_out') && (c.reminders_opt_out
            ? <ConfirmAction label="Re-enable email reminders" title="Re-enable email reminders" action={enableReminders} hidden={hidden} />
            : <ConfirmAction label="Disable email reminders" title="Disable email reminders" action={disableReminders} hidden={hidden} />)}
          {can(role, 'contact.delete') && <ConfirmAction label="Delete contact" danger title="Delete contact (data request)" action={deleteContact} hidden={hidden} typeToConfirm={id.data}
            description="Removes the stored email and consent record. This cannot be undone." />}
        </div>
      )}
      <div className="mb-4 grid grid-cols-2 gap-4">
        <Card title="Contact">
          {c ? <KV items={[
            ['Discord ID', <CopyId key="i" value={id.data} />], ['Username', str(c.discord_username)], ['Email', `${str(c.email)}${c.email_verified ? ' (verified)' : ' (unverified)'}`],
            ['Consented', dateTime(str(c.consented_at))], ['Reminders', c.reminders_opt_out ? `Opted out ${dateTime(str(c.opted_out_at))}` : 'Allowed'],
          ]} /> : <KV items={[
            ['Discord ID', <CopyId key="i" value={id.data} />], ['Username', username],
            ['Email', d.sharedEmail ?? 'None shared'], ['Email shared in', d.sharedServers ? `${d.sharedServers} server${d.sharedServers === 1 ? '' : 's'}` : '—'],
            ['Consent', 'Not tracked (no contacts table)'],
          ]} />}
        </Card>
        <Card title="Email contacts">
          {mail === null ? <EmptyState compact title="Not available yet" hint="Apply the bot's email migration" /> : mail.length === 0 ? <EmptyState compact title="No email contacts" /> : (
            <ul className="space-y-2">{mail.map((m, i) => (
              <li key={i} className="flex items-center justify-between gap-3">
                <span className="min-w-0"><span className="block">{maskEmail(str(m.email) ?? str(m.address))}</span><ServerLink id={String(m.guild_id)} info={mailInfos[String(m.guild_id)]} showId={false} /></span>
                {m.marketing_unsubscribed_at ? <Badge tone="warning">Unsubscribed</Badge> : <Badge tone="success">Subscribed</Badge>}
              </li>
            ))}</ul>
          )}
        </Card>
        <Card title="Summary">
          <KV items={[['Lifetime paid', money(d.lifetime)], ['Payments', String(d.payments.length)], ['Servers paid for', String(d.paidServers.length)]]} />
        </Card>
      </div>
      <div className="grid gap-4">
        <Card title="Servers">
          {d.paidServers.length === 0 && d.owned.length === 0 ? <EmptyState title="No servers" /> : (
            <ul className="space-y-1">
              {d.paidServers.map((g) => <li key={`p${g.guild_id}`} className="flex items-center justify-between gap-3"><ServerLink id={g.guild_id} info={infos[g.guild_id]} /><Badge tone="success">Paid</Badge></li>)}
            </ul>
          )}
        </Card>
        <Card title="Payments"><PaymentsMini rows={d.payments} /></Card>
      </div>
    </>
  );
}
