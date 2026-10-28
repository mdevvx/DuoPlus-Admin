import Link from 'next/link';
import { z } from 'zod';
import { Badge, Card, Cell, EmptyState, ErrorPanel, KV, PageHeader, Pagination, Stat, Table, Tr, When, type Tone } from '@/components/ui';
import { DonexelSend } from '@/components/donexel-send';
import { DonexelTemplateEditor } from '@/components/donexel-template-editor';
import { ContactManage, EmailSettingsForm, OutboxDetailButton, RunRemindersButton, TemplateSwitch } from '@/components/donexel-email-bits';
import { Filters } from '@/components/filters';
import { Notice } from '@/components/form';
import { RefreshButton } from '@/components/refresh-button';
import { int } from '@/lib/format';
import { can } from '@/lib/roles';
import type { RouteCtx } from '@/products/types';
import { describe } from '../api';
import { emailOverview, emailReminders, getEmailSettings, listEmailContacts, listEmailTemplates, listOutbox } from '../email-api';
import { ACCOUNT_CRITICAL, CATEGORY_LABEL, CATEGORY_ORDER, OUTBOX_SOURCES, OUTBOX_STATUSES } from '../email-meta';
import { parseRecipients } from '../email-compose';
import { humanize } from '../labels';
import { base, load } from './shared';

const root = `${base}/email`;
const PER = 25;
const STATUS_TONE: Record<string, Tone> = { sent: 'success', failed: 'danger', skipped: 'neutral', queued: 'warning' };
const StatusBadge = ({ status }: { status: string }) => <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{humanize(status)}</Badge>;
const SOURCE_LABEL: Record<string, string> = { system: 'Automatic', reminder: 'Reminder', manual: 'Manual' };

// ---------------------------------------------------------------- Reminders & email
export async function EmailRemindersPage({ role }: RouteCtx) {
  const r = await load(() => Promise.all([emailOverview(), emailReminders()]), root);
  const edit = can(role, 'tms.email');
  return (
    <>
      <PageHeader title="Reminders & email" description="Which automatic emails go out, and how many recently." updatedAt={new Date()}
        actions={<>{<RefreshButton className="btn" />}{edit && r.ok && <RunRemindersButton />}</>} />
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
      <PageHeader title="Email templates" description="The wording of every automatic email. Changes apply to emails sent from now on." updatedAt={new Date()}
        actions={<>{can(role, 'tms.email') && <Link className="btn btn-primary" href={`${root}/send`}>Send email</Link>}</>} />
      {!r.ok ? r.panel : r.data.length === 0 ? <div className="card"><EmptyState title="No templates" /></div> : (
        <div className="grid gap-5">
          {[...CATEGORY_ORDER, ...[...new Set(r.data.map((t) => t.category))].filter((c) => !(CATEGORY_ORDER as readonly string[]).includes(c))].map((cat) => {
            const rows = r.data.filter((t) => t.category === cat);
            if (rows.length === 0) return null;
            return (
              <Card key={cat} title={CATEGORY_LABEL[cat] ?? humanize(cat)}>
                <Table label={`${CATEGORY_LABEL[cat] ?? cat} templates`} bare>
                  <thead><tr>{['Email', 'Status', ''].map((h, i) => <th key={i} className="th">{h}</th>)}</tr></thead>
                  <tbody>{rows.map((t) => (
                    <Tr key={t.key}>
                      <td className="td"><Cell text={t.name} sub={t.trigger} max={420} href={`${root}/templates/${encodeURIComponent(t.key)}`} /></td>
                      <td className="td whitespace-nowrap">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={t.enabled ? 'success' : 'warning'}>{t.enabled ? 'On' : 'Off'}</Badge>
                          {t.customized && <Badge tone="info">Customised</Badge>}
                        </div>
                      </td>
                      <td className="td whitespace-nowrap text-right">
                        <span className="inline-flex items-center gap-1.5">
                          <TemplateSwitch tplKey={t.key} enabled={t.enabled} critical={ACCOUNT_CRITICAL.has(t.key)} canEdit={edit} />
                          <Link className="btn h-7 px-2.5 text-xs" href={`${root}/templates/${encodeURIComponent(t.key)}`}>{edit ? 'Edit' : 'View'}</Link>
                        </span>
                      </td>
                    </Tr>
                  ))}</tbody>
                </Table>
              </Card>
            );
          })}
        </div>
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
  if (!t) return <><PageHeader title="Email template" actions={back} /><div className="card"><EmptyState title="Template not found" hint="It may have been renamed, or the link is old." /></div></>;
  return (
    <>
      <PageHeader title={t.name} description={t.trigger} updatedAt={new Date()} actions={back} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{CATEGORY_LABEL[t.category] ?? humanize(t.category)}</Badge>
        <Badge tone={t.enabled ? 'success' : 'warning'}>{t.enabled ? 'On' : 'Off'}</Badge>
        {t.customized && <Badge tone="info">Customised</Badge>}
        {t.sensitive && <Badge tone="warning">Sensitive</Badge>}
      </div>
      <DonexelTemplateEditor template={t} adminEmail={admin.email} canEdit={can(role, 'tms.email')} />
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
});

export async function EmailOutboxPage({ searchParams, role }: RouteCtx) {
  const p = outboxParams.parse(searchParams);
  const path = `${root}/outbox`;
  const [out, templates] = await Promise.allSettled([listOutbox({ status: p.status, source: p.source, template: p.template, search: p.q, page: p.page, pageSize: PER }), listEmailTemplates()]);
  const names = new Map(templates.status === 'fulfilled' ? templates.value.map((t) => [t.key, t.name]) : []);
  const keep = Object.fromEntries(Object.entries(p).filter(([k, v]) => k !== 'page' && v !== undefined).map(([k, v]) => [k, String(v)]));
  return (
    <>
      <PageHeader title="Email outbox" description="Every email Donexel has sent or tried to send, with its status." updatedAt={new Date()}
        actions={<>{<RefreshButton className="btn" />}{can(role, 'tms.email') && <Link className="btn btn-primary" href={`${root}/send`}>Send email</Link>}</>} />
      <Filters action={path} fields={[
        { type: 'search', key: 'q', label: 'Search', placeholder: 'Search by recipient or subject' },
        { type: 'select', key: 'status', label: 'Status', options: OUTBOX_STATUSES.map((s): [string, string] => [s, humanize(s)]) },
        { type: 'select', key: 'source', label: 'Source', options: OUTBOX_SOURCES.map((s): [string, string] => [s, SOURCE_LABEL[s] ?? s]) },
        ...(names.size ? [{ type: 'select', key: 'template', label: 'Template', options: [...names].map(([k, n]): [string, string] => [k, n]) } satisfies import('@/components/filters').FilterField] : []),
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
                  <td className="td"><Cell text={m.to} sub={m.toName ?? undefined} max={210} /></td>
                  <td className="td"><Cell text={m.templateKey ? names.get(m.templateKey) ?? humanize(m.templateKey) : 'Custom'} sub={SOURCE_LABEL[m.source] ?? humanize(m.source)} max={170} /></td>
                  <td className="td whitespace-nowrap"><StatusBadge status={m.status} /></td>
                  <td className="td"><Cell text={m.subject} sub={m.status === 'failed' && m.error ? <span className="text-danger">{m.error}</span> : undefined} max={280} /></td>
                  <td className="td whitespace-nowrap text-right"><OutboxDetailButton id={m.id} canEdit={can(role, 'tms.email')} /></td>
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
      <PageHeader title="Email contacts" description="Everyone Donexel can email. Switching reminders off stops reminders only: account and billing emails are always sent." updatedAt={new Date()} actions={<RefreshButton className="btn" />} />
      <Filters action={path} fields={[{ type: 'search', key: 'q', label: 'Search', placeholder: 'Search by email or name' }]} />
      {!r.ok ? r.panel : r.data.items.length === 0 ? <div className="card"><EmptyState title={p.q ? 'No contacts match' : 'No contacts yet'} hint={p.q ? 'Check the spelling or clear the search.' : undefined} /></div> : (
        <>
          <Table label="Email contacts">
            <thead><tr>{['Contact', 'Reminders', 'Last email', 'Joined', ''].map((h, i) => <th key={i} className="th">{h}</th>)}</tr></thead>
            <tbody>{r.data.items.map((c) => (
              <Tr key={c.id}>
                <td className="td"><Cell text={c.fullName || c.email} sub={c.fullName ? c.email : undefined} max={280} /></td>
                <td className="td whitespace-nowrap">{c.remindersOptedOut ? <Badge tone="warning">Opted out</Badge> : <Badge tone="success">On</Badge>}</td>
                <td className="td whitespace-nowrap">{c.lastEmailAt ? <When value={c.lastEmailAt} /> : <span className="text-muted">Never</span>}</td>
                <td className="td whitespace-nowrap"><When value={c.createdAt || null} /></td>
                <td className="td whitespace-nowrap text-right"><ContactManage contact={c} base={base} canEdit={can(role, 'tms.email')} /></td>
              </Tr>
            ))}</tbody>
          </Table>
          <Pagination base={path} params={{ q: p.q }} page={r.data.page || p.page} pageSize={r.data.pageSize || PER} total={r.data.total} />
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Settings
export async function EmailSettingsPage({ role }: RouteCtx) {
  const r = await load(getEmailSettings, `${root}/settings`);
  return (
    <>
      <PageHeader title="Email settings" description="How Donexel's emails look and whether reminders are sent." updatedAt={new Date()} />
      {!r.ok ? r.panel : (
        <div className="grid max-w-3xl gap-5">
          {!r.data.configured && <Notice tone="warning">Email isn&apos;t set up on the server (SMTP settings), so nothing can be sent yet.</Notice>}
          <Card title="Sender">
            <KV items={[
              ['Sender address', r.data.senderAddress || '—'],
              ['Mail server', r.data.configured ? <Badge key="c" tone="success">Connected</Badge> : <Badge key="c" tone="warning">Not set up</Badge>],
            ]} />
            <p className="mt-4 text-xs text-muted">The sender address comes from <b>SMTP_FROM</b> on the Donexel server, and the sender name below is shown before it. The mail server login is server configuration (environment variables) and is never shown or asked for here.</p>
          </Card>
          <Card title="Wording and reminders"><EmailSettingsForm settings={r.data} canEdit={can(role, 'tms.email')} /></Card>
        </div>
      )}
    </>
  );
}
