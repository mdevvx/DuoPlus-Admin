import Link from 'next/link';
import { z } from 'zod';
import { Badge, Card, Cell, EmptyState, ErrorPanel, KV, PageHeader, Pagination, Stat, Table, Tr, When } from '@/components/ui';
import { DonexelSend } from '@/components/donexel-send';
import { DonexelTemplateEditor } from '@/components/donexel-template-editor';
import { AddContact, ContactManage, ContactReminders, ContactRemove, EmailSettingsForm, EraseAddress, LayoutForm, RestoreVersion, OutboxDetailButton, OutboxRowActions, OutboxStatus, RunRemindersButton, TemplateSwitch } from '@/components/donexel-email-bits';
import { Filters } from '@/components/filters';
import { Notice } from '@/components/form';
import { int, maskEmail, relative } from '@/lib/format';
import { can } from '@/lib/roles';
import type { RouteCtx } from '@/products/types';
import { describe } from '../api';
import { emailOverview, emailReminders, getEmailLayout, getEmailSettings, listEmailContacts, listEmailTemplates, listOutbox, listTemplateVersions } from '../email-api';
import { ACCOUNT_CRITICAL, CATEGORY_LABEL, CATEGORY_ORDER, OUTBOX_SOURCES, OUTBOX_STATUSES } from '../email-meta';
import { parseRecipients } from '../email-compose';
import { humanize } from '../labels';
import { base, load } from './shared';

const root = `${base}/email`;
const catRank = (c: string) => { const i = (CATEGORY_ORDER as readonly string[]).indexOf(c); return i < 0 ? 99 : i; };
const PER = 25;
const SOURCE_LABEL: Record<string, string> = { system: 'Automatic', reminder: 'Reminder', manual: 'Manual' };

// ---------------------------------------------------------------- Reminders & email
export async function EmailRemindersPage({ role }: RouteCtx) {
  const r = await load(() => Promise.all([emailOverview(), emailReminders()]), root);
  const edit = can(role, 'tms.email');
  return (
    <>
      <PageHeader title="Reminders & email" description="Which automatic emails go out, and how many recently." updatedAt={new Date()}
        actions={<>{edit && r.ok && <RunRemindersButton />}</>} />
      {!r.ok ? r.panel : (() => {
        const [o, rem] = r.data;
        return (
          <>
            {!o.configured && <div className="mb-5"><Notice tone="warning">Email isn&apos;t set up on the server. Donexel cannot send anything until its SMTP settings are added.</Notice></div>}
            <div className="mb-5 grid max-w-4xl grid-cols-2 gap-4 lg:grid-cols-4">
              <Card><Stat label="Emails, 30 days" value={int(o.last30d.total)} /></Card>
              <Card><Stat label="Sent" value={int(o.last30d.sent)} /></Card>
              <Card><Stat label="Failed" value={<span className={o.last30d.failed > 0 ? 'text-danger' : undefined}>{int(o.last30d.failed)}</span>} /></Card>
              <Card><Stat label="Skipped" value={int(o.last30d.skipped)} /></Card>
            </div>
            <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
              <Badge tone={rem.enabled ? 'success' : 'warning'}>{rem.enabled ? 'Reminders are on' : 'Reminders are off'}</Badge>
              <span className="text-muted">The master switch is under <Link className="text-accent hover:underline" href={`${root}/settings`}>Email settings</Link>. Donexel also runs the reminders by itself every 15 minutes and never sends the same one twice.</span>
            </div>
            {rem.rules.length === 0 ? <div className="card"><EmptyState title="No reminder rules" /></div> : (
              <Table label="Reminder rules">
                <thead><tr>{['Reminder', 'Status', 'Sent, 30 days', ''].map((h, i) => <th key={i} className={i === 2 ? 'th text-right' : 'th'}>{h}</th>)}</tr></thead>
                <tbody>{rem.rules.map((x) => (
                  <Tr key={x.key}>
                    <td className="td"><Cell text={x.name} sub={x.trigger} max={420} /></td>
                    <td className="td whitespace-nowrap"><Badge tone={x.enabled ? 'success' : 'neutral'}>{x.enabled ? 'On' : 'Off'}</Badge></td>
                    <td className="td num text-right">{int(x.sentLast30d)}</td>
                    <td className="td whitespace-nowrap text-right"><Link className="btn h-7 px-2.5 text-xs" href={`${root}/templates/${encodeURIComponent(x.key)}`}>Edit wording</Link></td>
                  </Tr>
                ))}</tbody>
              </Table>
            )}
          </>
        );
      })()}
    </>
  );
}

// ---------------------------------------------------------------- Templates
export async function EmailTemplatesPage({ role }: RouteCtx) {
  const r = await load(listEmailTemplates, `${root}/templates`);
  const edit = can(role, 'tms.email');
  return (
    <>
      <PageHeader title="Email templates" description="What Donexel sends. Saving changes every email sent from now on; the switch controls automatic emails only." updatedAt={new Date()}
        actions={<>{can(role, 'tms.email') && <Link className="btn btn-primary" href={`${root}/send`}>Send email</Link>}</>} />
      {!r.ok ? r.panel : r.data.length === 0 ? <div className="card"><EmptyState title="No templates yet" /></div> : (
        <Table label="Email templates">
          <thead><tr>{['Template', 'Automatic', 'Subject', 'Last edited', 'Sent (30 days)', ''].map((h, i) => <th key={i} className="th">{h}</th>)}</tr></thead>
          <tbody>{[...r.data].sort((x, y) => catRank(x.category) - catRank(y.category)).map((t) => (
            <Tr key={t.key}>
              <td className="td"><Cell text={t.name} sub={<span className="inline-flex items-center gap-1.5"><Badge tone="neutral">{CATEGORY_LABEL[t.category] ?? humanize(t.category)}</Badge></span>} max={230} href={`${root}/templates/${encodeURIComponent(t.key)}`} /></td>
              <td className="td whitespace-nowrap"><div className="flex items-center gap-2"><Badge tone={t.enabled ? 'success' : 'warning'}>{t.enabled ? 'On' : 'Off'}</Badge><TemplateSwitch tplKey={t.key} enabled={t.enabled} critical={ACCOUNT_CRITICAL.has(t.key)} canEdit={edit} /></div></td>
              <td className="td"><Cell text={t.subject} sub={t.trigger} max={260} /></td>
              <td className="td whitespace-nowrap">
                {t.version > 0
                  ? <><div>Version {t.version}{t.updatedBy ? ` · ${maskEmail(t.updatedBy)}` : ''}</div><div className="text-xs text-muted"><When value={t.updatedAt} /></div></>
                  : <span className="text-muted">Built-in wording</span>}
              </td>
              <td className="td num">{int(t.sentLast30d)}</td>
              <td className="td whitespace-nowrap text-right"><Link className="btn h-7 px-2.5 text-xs" href={`${root}/templates/${encodeURIComponent(t.key)}`}>{edit ? 'Edit' : 'View'}</Link></td>
            </Tr>
          ))}</tbody>
        </Table>
      )}
    </>
  );
}

export async function EmailTemplatePage({ params, role, admin }: RouteCtx) {
  const k = params.key ?? '';
  const r = await load(listEmailTemplates, `${root}/templates/${k}`);
  const back = <Link className="btn" href={`${root}/templates`}>All templates</Link>;
  if (!r.ok) return <><PageHeader title="Email template" actions={back} />{r.panel}</>;
  const t = r.data.find((x) => x.key === k);
  const versions = t ? await listTemplateVersions(k).catch(() => null) : null;
  const edit = can(role, 'tms.email');
  if (!t) return <><PageHeader title="Email template" actions={back} /><div className="card"><EmptyState title="Template not found" hint="It may have been renamed, or the link is old." /></div></>;
  return (
    <>
      <PageHeader title={t.name} description={`Template ${t.key}`} actions={back} />
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg bg-subtle px-4 py-3 text-sm">
        <span className="flex items-center gap-2">
          <Badge tone="neutral">{CATEGORY_LABEL[t.category] ?? humanize(t.category)}</Badge>
          <Badge tone={t.enabled ? 'success' : 'warning'}>Automatic emails {t.enabled ? 'on' : 'off'}</Badge>
          {t.customized && <Badge tone="info">Customised</Badge>}
          {t.sensitive && <Badge tone="warning">Sensitive</Badge>}
        </span>
        <span><b>Sent when:</b> {t.trigger || 'Only when sent manually.'}</span>
        <span className="text-muted">Built-in: the key and the trigger cannot be changed.</span>
      </div>
      <DonexelTemplateEditor template={t} adminEmail={admin.email} canEdit={edit} />
      <div className="mt-6">
        <Card title="History">
          {versions === null ? <EmptyState compact title="History not available" hint="The versions could not be read." /> : versions.length === 0 ? <EmptyState compact title="No earlier versions" hint="A version is kept each time the template is saved." /> : (
            <Table label="Template versions" bare>
              <thead><tr><th className="th">Version</th><th className="th">Subject</th><th className="th">Saved by</th><th className="th">When</th><th className="th" /></tr></thead>
              <tbody>{versions.map((v) => (
                <Tr key={v.version}>
                  <td className="td num">{v.version}{v.version === t.version ? ' · current' : ''}</td>
                  <td className="td"><Cell text={v.subject || '—'} max={320} /></td>
                  <td className="td">{v.updatedBy ? maskEmail(v.updatedBy) : '—'}</td>
                  <td className="td"><When value={v.updatedAt} /></td>
                  <td className="td text-right">{edit && v.version !== t.version && <RestoreVersion tplKey={t.key} version={v.version} />}</td>
                </Tr>
              ))}</tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Send email
export async function EmailSendPage({ searchParams, role }: RouteCtx) {
  if (!can(role, 'tms.email')) return <><PageHeader title="Send email" /><div className="card"><EmptyState title="You cannot send email" hint="Only admins can send email from here." /></div></>;
  const to = parseRecipients(searchParams.to ?? '').valid.slice(0, 50);
  return (
    <>
      <PageHeader title="Send email" description="A one-off email, for example a notice, an apology or a personal follow-up. Each person gets a separate message." updatedAt={new Date()} />
      <DonexelSend prefill={to} basePath={base} />
    </>
  );
}

// ---------------------------------------------------------------- Outbox
const outboxParams = z.object({
  page: z.coerce.number().int().min(1).max(100000).catch(1),
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(OUTBOX_STATUSES).optional().catch(undefined),
  source: z.enum(OUTBOX_SOURCES).optional().catch(undefined),
  template: z.string().regex(/^[a-z0-9_]{2,60}$/).optional().catch(undefined),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
});

export async function EmailOutboxPage({ searchParams, role }: RouteCtx) {
  const p = outboxParams.parse(searchParams);
  const path = `${root}/outbox`;
  const [out, templates, overview] = await Promise.allSettled([listOutbox({ status: p.status, source: p.source, template: p.template, search: p.q, from: p.from, to: p.to, page: p.page, pageSize: PER }), listEmailTemplates(), emailOverview()]);
  const stale = overview.status === 'fulfilled' ? overview.value.stalePending : 0;
  const names = new Map(templates.status === 'fulfilled' ? templates.value.map((t) => [t.key, t.name]) : []);
  const keep = Object.fromEntries(Object.entries(p).filter(([k, v]) => k !== 'page' && v !== undefined).map(([k, v]) => [k, String(v)]));
  return (
    <>
      <PageHeader title="Email outbox" description="Every email ever queued, with its status. Bodies are loaded when you open the details." updatedAt={new Date()}
        actions={<>{can(role, 'tms.email') && <Link className="btn btn-primary" href={`${root}/send`}>Send email</Link>}</>} />
      {stale > 0 && <p role="alert" className="mb-3 rounded-lg bg-warning-soft px-4 py-3 text-warning">{stale} email{stale === 1 ? ' has' : 's have'} been queued for over 15 minutes. Donexel may not be sending: check the SMTP settings on the server.</p>}
      <Filters action={path} fields={[
        { type: 'search', key: 'q', label: 'Search', placeholder: 'Search by recipient or subject' },
        { type: 'select', key: 'status', label: 'Status', options: [['', 'All'], ...OUTBOX_STATUSES.map((s): [string, string] => [s, humanize(s)])] },
        { type: 'select', key: 'source', label: 'Kind', options: [['', 'All'], ...OUTBOX_SOURCES.map((s): [string, string] => [s, SOURCE_LABEL[s] ?? s])] },
        { type: 'daterange', key: 'date', label: 'Date', fromKey: 'from', toKey: 'to' },
        ...(names.size ? [{ type: 'select', key: 'template', label: 'Template', options: [['', 'All'], ...[...names].map(([k, n]): [string, string] => [k, n])] } satisfies import('@/components/filters').FilterField] : []),
      ]} />
      {out.status === 'rejected' ? <ErrorPanel message={describe(out.reason)} retryHref={path} />
        : out.value.items.length === 0 ? <div className="card"><EmptyState title={Object.keys(keep).length ? 'No emails match' : 'No emails yet'} hint={Object.keys(keep).length ? 'Change or reset the filters.' : 'Emails appear here as soon as Donexel sends them.'} /></div>
        : (
          <>
            <Table label="Email outbox">
              <thead><tr>{['When', 'Recipient', 'Email', 'Status', 'Subject', ''].map((h, i) => <th key={i} className="th">{h}</th>)}</tr></thead>
              <tbody>{out.value.items.map((m) => (
                <Tr key={m.id}>
                  <td className="td whitespace-nowrap"><When value={m.createdAt || null} /></td>
                  <td className="td"><Cell text={m.to} sub={m.workspaceName ?? m.toName ?? undefined} max={210} /></td>
                  <td className="td"><Cell text={m.templateKey ? names.get(m.templateKey) ?? humanize(m.templateKey) : 'Custom'} sub={`${SOURCE_LABEL[m.source] ?? humanize(m.source)} · ${m.attempts} ${m.attempts === 1 ? 'try' : 'tries'}`} max={170} /></td>
                  <td className="td whitespace-nowrap"><OutboxStatus status={m.status} /></td>
                  <td className="td"><Cell text={m.subject} sub={m.status === 'failed' && m.error ? <span className="text-danger">{m.error}</span> : undefined} max={280} /></td>
                  <td className="td whitespace-nowrap text-right">
                    <span className="inline-flex items-center gap-1.5">
                      <OutboxRowActions id={m.id} canResend={m.canResend} failed={m.status === 'failed'} canEdit={can(role, 'tms.email')} />
                      <OutboxDetailButton id={m.id} canEdit={can(role, 'tms.email')} base={base} templateName={m.templateKey ? names.get(m.templateKey) : undefined} />
                    </span>
                  </td>
                </Tr>
              ))}</tbody>
            </Table>
            <Pagination base={path} params={keep} page={out.value.page || p.page} pageSize={out.value.pageSize || PER} total={out.value.total} />
          </>
        )}
    </>
  );
}

// ---------------------------------------------------------------- Contacts
const contactParams = z.object({ page: z.coerce.number().int().min(1).max(100000).catch(1), q: z.string().trim().max(100).optional().catch(undefined) });

export async function EmailContactsPage({ searchParams, role }: RouteCtx) {
  const p = contactParams.parse(searchParams);
  const path = `${root}/contacts`;
  const r = await load(() => listEmailContacts({ search: p.q, page: p.page, pageSize: PER }), path);
  return (
    <>
      <PageHeader title="Email contacts" description="Every address we can email: accounts, plus addresses added by hand. Switching reminders off stops reminders only: account and billing emails are always sent." updatedAt={new Date()}
        actions={can(role, 'tms.email') && <AddContact />} />
      {r.ok && (
        <div className="mb-5 grid max-w-3xl grid-cols-3 gap-4">
          <Card><Stat label="Contacts" value={int(r.data.subscribed + r.data.unsubscribed || r.data.total)} /></Card>
          <Card><Stat label="Subscribed to reminders" value={int(r.data.subscribed)} /></Card>
          <Card><Stat label="Unsubscribed" value={int(r.data.unsubscribed)} /></Card>
        </div>
      )}
      <Filters action={path} fields={[{ type: 'search', key: 'q', label: 'Search', placeholder: 'Search by email or name' }]} />
      {!r.ok ? r.panel : r.data.items.length === 0 ? <div className="card"><EmptyState title={p.q ? 'No contacts match' : 'No contacts yet'} hint={p.q ? 'Check the spelling or clear the search.' : undefined} /></div> : (
        <>
          <Table label="Email contacts">
            <thead><tr>{['Contact', 'Reminders', 'Last email', 'Joined', ''].map((h, i) => <th key={i} className="th">{h}</th>)}</tr></thead>
            <tbody>{r.data.items.map((c) => (
              <Tr key={c.id}>
                <td className="td"><Cell text={c.fullName || c.email} sub={c.fullName ? c.email : c.kind === 'manual' ? 'Added by hand' : undefined} max={280} /></td>
                <td className="td whitespace-nowrap">{c.remindersOptedOut ? <Badge tone="warning">Unsubscribed</Badge> : <Badge tone="success">Subscribed</Badge>}</td>
                <td className="td whitespace-nowrap">{c.lastEmailAt ? <When value={c.lastEmailAt} /> : <span className="text-muted">Never</span>}</td>
                <td className="td whitespace-nowrap"><When value={c.createdAt || null} /></td>
                <td className="td whitespace-nowrap text-right"><span className="inline-flex items-center gap-1.5"><ContactReminders email={c.email} optedOut={c.remindersOptedOut} canEdit={can(role, 'tms.email')} />{c.kind === 'manual' && <ContactRemove id={c.id} canEdit={can(role, 'tms.email')} />}<ContactManage contact={c} base={base} canEdit={can(role, 'tms.email')} /></span></td>
              </Tr>
            ))}</tbody>
          </Table>
          <Pagination base={path} params={{ q: p.q }} page={r.data.page || p.page} pageSize={r.data.pageSize || PER} total={r.data.total} />
        </>
      )}
      {can(role, 'tms.email') && (
        <div className="mt-6">
          <Card title="Privacy request" action={<EraseAddress />}>
            <p className="text-muted">Deletes one address from the contacts, the reminder opt-out list and every email in the outbox, for example after a data-erasure request. Refused while the address still has an account. This cannot be undone and is audit-logged.</p>
          </Card>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Settings
export async function EmailSettingsPage({ role }: RouteCtx) {
  const r = await load(() => Promise.all([getEmailSettings(), emailOverview(), getEmailLayout(), listEmailTemplates().catch(() => [])]), `${root}/settings`);
  return (
    <>
      <PageHeader title="Email settings" description="The shared layout every email is wrapped in, the sender, and whether reminders go out." updatedAt={new Date()} />
      {!r.ok ? r.panel : (() => {
        const [cfg, o, layout, tpls] = r.data;
        const failRate = o.total24h ? Math.round((o.failed24h / o.total24h) * 100) : 0;
        const edit = can(role, 'tms.email');
        return (
          <>
            {!cfg.configured && <div className="mb-5"><Notice tone="warning">Email isn&apos;t set up on the server (SMTP settings), so nothing can be sent yet.</Notice></div>}
            {o.failed24h > 0 && failRate >= 20 && <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-4 py-3 text-danger">{o.failed24h} of {o.total24h} emails failed in the last 24 hours. Check the SMTP settings and the mailbox password; a mail-server login error shows in the failed rows&apos; detail on the <Link className="underline" href={`${root}/outbox?status=failed`}>outbox</Link>.</p>}
            <div className="mb-5">
              <Card title="Sending health">
                <KV items={[
                  ['Mail server', cfg.configured ? <Badge key="c" tone="success">Connected</Badge> : <Badge key="c" tone="warning">Not set up</Badge>],
                  ['Last successful send', o.lastSuccessAt ? <span key="l">{relative(o.lastSuccessAt)}</span> : 'Never'],
                  ['Failed in the last 24 hours', `${int(o.failed24h)} of ${int(o.total24h)}${o.total24h ? ` (${failRate}%)` : ''}`],
                  ['Queued over 15 minutes', int(o.stalePending)],
                ]} />
                <p className="mt-3 text-xs text-muted">The panel cannot see the mail server itself, so this is read from the outbox.</p>
              </Card>
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <Card title="Layout and branding"><LayoutForm layout={layout} canEdit={edit} previewKey={(tpls.find((t) => !t.sensitive) ?? tpls[0])?.key} /></Card>
              <div className="grid content-start gap-5">
                <Card title="Sender">
                  <KV items={[['Sender address', cfg.senderAddress || '—'], ['Reply-to', cfg.replyTo || 'None']]} />
                  <p className="mt-4 text-xs text-muted">The sender address comes from <b>SMTP_FROM</b> on the Donexel server, and the sender name is shown before it. The mail server login is server configuration (environment variables) and is never shown or asked for here.</p>
                </Card>
                <Card title="Wording and reminders"><EmailSettingsForm settings={cfg} canEdit={edit} /></Card>
              </div>
            </div>
          </>
        );
      })()}
    </>
  );
}
