import Link from 'next/link';
import { Badge, Card, Cell, DetailRow, EmptyState, ErrorPanel, FilterBar, KV, PageHeader, Pagination, Select, Table, TagSelect, Tr, When } from '@/components/ui';
import { ClampText, CopyId, DetailModal } from '@/components/small-client';
import { EmailEditor } from '@/components/email-editor';
import { DateField } from '@/components/date-field';
import { EmailSend } from '@/components/email-send';
import { AddContact, BatchProgress, ContactActions, EraseAddress, OutboxActions, RevealAddress } from '@/components/email-row-actions';
import { LayoutForm, RestoreButton, ScheduleForm, TemplateToggle } from '@/components/email-forms';
import { guildInfoMap } from '@/lib/discord';
import { int, maskEmail, relative, sentence } from '@/lib/format';
import { can } from '@/lib/roles';
import { PAGE_SIZE } from '@/lib/validation';
import type { RouteCtx } from '@/products/types';
import { SLUG, pick, str, type Row } from '../db';
import { batchProgress, contactParams, getLayout, getOutboxRow, getSchedule, getTemplate, getVersions, listContacts, listOutbox, listTemplates, outboxHealth, outboxParams, OUTBOX_STATUSES } from '../queries/email';
import { BUILT_IN, CATEGORY_LABEL, SCHEDULE_DEFAULTS } from '../email/vars';
import { ServerLink, base } from './shared';

const root = `${base}/email`;
const exportUrl = `/api/export/${SLUG}/email-contacts`;
const batchOf = (r: Row) => str((r.variables as Record<string, unknown> | null)?.batch);
const categoryBadge = (c: string | null) => <Badge tone={c === 'marketing' ? 'info' : 'neutral'}>{CATEGORY_LABEL[c ?? ''] ?? sentence(c)}</Badge>;

export function OutboxStatus({ status }: { status: unknown }) {
  const s = String(status ?? '');
  const tone = s === 'sent' ? 'success' : s === 'failed' ? 'danger' : s === 'queued' || s === 'sending' ? 'info' : 'neutral';
  const mark = s === 'sent' ? '✓ ' : s === 'failed' ? '✕ ' : s === 'skipped' ? '– ' : '… ';
  return <Badge tone={tone}>{mark}{sentence(s)}</Badge>;
}

// ---- Templates ----

export async function EmailTemplatesPage({ role }: RouteCtx) {
  let rows;
  try { rows = await listTemplates(); } catch { return <ErrorPanel message="Could not load email templates." retryHref={`${root}/templates`} />; }
  const edit = can(role, 'email.template');
  return (
    <>
      <PageHeader title="Email templates" description="What the bot sends. Saving changes every email still queued; the switch controls automatic emails only." updatedAt={new Date()}
        actions={can(role, 'email.send') && <Link className="btn btn-primary" href={`${root}/send`}>Send email</Link>} />
      {rows.length === 0 ? <div className="card"><EmptyState title="No templates yet" hint="The bot creates the built-in templates when its email migration is applied." /></div> : (
        <Table label="Email templates">
          <thead><tr>{['Template', 'Automatic', 'Subject', 'Last edited', 'Sent (30 days)'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>{rows.map((t) => {
            const key = String(t.key);
            return (
              <Tr key={key}>
                <td className="td"><Cell text={pick(t, 'name') ?? key} sub={<span className="inline-flex items-center gap-1.5">{categoryBadge(str(t.category))}</span>} max={230} href={`${root}/templates/${key}`} /></td>
                <td className="td whitespace-nowrap"><div className="flex items-center gap-2"><Badge tone={t.enabled === false ? 'warning' : 'success'}>{t.enabled === false ? 'Off' : 'On'}</Badge><TemplateToggle tplKey={key} enabled={t.enabled !== false} disabled={!edit} /></div></td>
                <td className="td"><Cell text={str(t.subject)} max={260} /></td>
                <td className="td whitespace-nowrap"><div className="text-[13px]">Version {str(t.version) ?? '—'}{str(t.updated_by) ? ` · ${maskEmail(str(t.updated_by))}` : ''}</div><div className="text-[12px] text-muted"><When value={str(t.updated_at)} /></div></td>
                <td className="td num">{int(t.sent30 as number)}</td>
              </Tr>
            );
          })}</tbody>
        </Table>
      )}
    </>
  );
}

export async function EmailTemplatePage({ params, role, admin }: RouteCtx) {
  const key = params.key ?? '';
  let t: Row | null;
  let versions: Row[] | null;
  let accent = '#5B6CF0';
  try { [t, versions] = await Promise.all([getTemplate(key), getVersions(key), getLayout().then((l) => { accent = l.layout.accent_color; })]).then((r) => [r[0], r[1]] as const); } catch { return <ErrorPanel message="Could not load this template." retryHref={`${root}/templates/${key}`} />; }
  if (!t) return <div className="card"><EmptyState title="Template not found" hint="It may have been removed." /></div>;
  const category = str(t.category) ?? 'transactional';
  const builtIn = key in BUILT_IN;
  const edit = can(role, 'email.template');
  const version = Number(t.version ?? 1);
  return (
    <>
      <PageHeader title={pick(t, 'name') ?? key} description={`Template ${key} · version ${version}`}
        actions={<Link className="btn" href={`${root}/templates`}>All templates</Link>} />
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg bg-subtle px-4 py-3 text-[13px]">
        <span className="flex items-center gap-2">{categoryBadge(category)}<Badge tone={t.enabled === false ? 'warning' : 'success'}>Automatic emails {t.enabled === false ? 'off' : 'on'}</Badge></span>
        <span><b>Sent when:</b> {BUILT_IN[key]?.trigger ?? 'Only when sent manually.'}</span>
        {builtIn && <span className="text-muted">Built-in: the key and the trigger cannot be changed.</span>}
      </div>
      <EmailEditor accent={accent} adminEmail={admin.email} tplKey={key} version={version} category={category} builtIn={builtIn} canEdit={edit}
        initial={{ name: pick(t, 'name') ?? key, description: pick(t, 'description') ?? '', subject: pick(t, 'subject') ?? '', preheader: pick(t, 'preheader') ?? '', html: pick(t, 'body_html') ?? '', text: pick(t, 'body_text') ?? '' }} />
      <div className="mt-6">
        <Card title="History">
          {versions === null ? <EmptyState compact title="History not available" hint="The versions table could not be read." /> : versions.length === 0 ? <EmptyState compact title="No earlier versions" hint="A version is kept each time the template is saved." /> : (
            <Table label="Template versions" bare>
              <thead><tr><th className="th">Version</th><th className="th">Subject</th><th className="th">Saved by</th><th className="th">When</th><th className="th" /></tr></thead>
              <tbody>{versions.map((v, i) => (
                <Tr key={i}>
                  <td className="td num">{str(v.version)}</td>
                  <td className="td"><ClampText text={pick(v, 'subject') ?? '—'} title="Subject" max={60} /></td>
                  <td className="td">{pick(v, 'updated_by', 'created_by') ? maskEmail(pick(v, 'updated_by', 'created_by')) : '—'}</td>
                  <td className="td"><When value={pick(v, 'updated_at', 'created_at')} /></td>
                  <td className="td text-right">{edit && <RestoreButton tplKey={key} currentVersion={version} version={Number(v.version)} />}</td>
                </Tr>
              ))}</tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}

// ---- Outbox ----

export async function EmailOutboxPage({ searchParams, role }: RouteCtx) {
  const canAct = can(role, 'email.outbox');
  const p = outboxParams.parse(searchParams);
  const path = `${root}/outbox`;
  let data, health, templates: Row[];
  try { [data, health, templates] = await Promise.all([listOutbox(p), outboxHealth(), listTemplates()]); } catch { return <ErrorPanel message="Could not load the outbox." retryHref={path} />; }
  const infos = await guildInfoMap(data.rows.map((r) => str(r.guild_id)).filter((g): g is string => !!g));
  const name = (k: string | null) => (k ? pick(templates.find((t) => t.key === k), 'name') ?? k : 'Custom');
  const params = Object.fromEntries(Object.entries(p).filter(([k, v]) => k !== 'page' && v !== undefined).map(([k, v]) => [k, String(v)]));
  return (
    <>
      <PageHeader title="Email outbox" description="Every email ever queued, with its status. Bodies are re-rendered, never stored." updatedAt={new Date()}
        actions={can(role, 'email.send') && <Link className="btn btn-primary" href={`${root}/send`}>Send email</Link>} />
      {health.stale > 0 && <p role="alert" className="mb-3 rounded-lg bg-warning-soft px-4 py-3 text-warning">{health.stale} email{health.stale === 1 ? ' has' : 's have'} been queued for over 15 minutes. The bot may not be sending: is it online, and are the EMAIL_SMTP_* settings complete?</p>}
      <FilterBar action={path}>
        <TagSelect name="status" label="Status" value={p.status} options={[['', 'All'], ...OUTBOX_STATUSES.map((s): [string, string] => [s, sentence(s)])]} />
        <Select name="template" label="Template" value={p.template} options={[['', 'All'], ['custom', 'Custom'], ...templates.map((t): [string, string] => [String(t.key), pick(t, 'name') ?? String(t.key)])]} />
        <Select name="kind" label="Kind" value={p.kind} options={[['', 'All'], ['auto', 'Automatic'], ['manual', 'Manual']]} />
        <input className="input w-40" name="guild" inputMode="numeric" placeholder="Server ID" defaultValue={p.guild} />
        <input className="input w-48" name="by" type="email" placeholder="Sent by" defaultValue={p.by} />
        <DateField name="from" defaultValue={p.from} placeholder="From date" />
        <DateField name="to" defaultValue={p.to} placeholder="To date" />
      </FilterBar>
      {data.rows.length === 0 ? <div className="card"><EmptyState title="No emails match" /></div> : (
        <Table label="Email outbox">
          <thead><tr>{['When', 'Recipient', 'Template', 'Status', 'Subject', ''].map((h, i) => <th key={i} className="th">{h}</th>)}</tr></thead>
          <tbody>{data.rows.map((r, i) => {
            const gid = str(r.guild_id);
            const serverName = gid ? infos[gid]?.name ?? `Server …${gid.slice(-6)}` : null;
            return (
              <Tr key={i}>
                <td className="td whitespace-nowrap"><When value={str(r.created_at)} /></td>
                <td className="td"><Cell text={maskEmail(str(r.to_email))} sub={serverName ?? 'No server'} max={170} /></td>
                <td className="td"><Cell text={name(str(r.template_key))} sub={`${r.kind === 'manual' ? 'Manual' : 'Automatic'} · ${str(r.attempts) ?? '0'} ${Number(r.attempts) === 1 ? 'try' : 'tries'}`} max={150} /></td>
                <td className="td whitespace-nowrap"><OutboxStatus status={r.status} /></td>
                <td className="td"><Cell text={pick(r, 'subject_override', 'subject')} max={240} /></td>
                <td className="td whitespace-nowrap text-right">
                  <span className="inline-flex items-center gap-1.5">
                  <OutboxActions id={String(r.id)} status={String(r.status)} canAct={canAct} />
                  <DetailModal trigger="Details" title="Email details">
                    <div className="mb-3"><OutboxStatus status={r.status} /></div>
                    <dl className="divide-y divide-line text-sm">
                      <DetailRow label="To">{maskEmail(str(r.to_email))}</DetailRow>
                      <DetailRow label="Subject">{pick(r, 'subject_override', 'subject') ?? '—'}</DetailRow>
                      <DetailRow label="Server">{gid ? <span className="inline-flex items-center gap-2">{serverName} <CopyId value={gid} /></span> : '—'}</DetailRow>
                      <DetailRow label="Template">{name(str(r.template_key))}</DetailRow>
                      <DetailRow label="Kind">{r.kind === 'manual' ? 'Manual' : 'Automatic'}</DetailRow>
                      <DetailRow label="Created"><When value={str(r.created_at)} /></DetailRow>
                      <DetailRow label="Send after"><When value={str(r.send_after)} /></DetailRow>
                      <DetailRow label="Attempts">{str(r.attempts) ?? '0'}</DetailRow>
                      <DetailRow label="Sent by">{str(r.created_by) ? maskEmail(str(r.created_by)) : 'Automatic'}</DetailRow>
                      <DetailRow label="Detail">{str(r.status_detail) ?? '—'}</DetailRow>
                      <DetailRow label="Message-ID">{str(r.provider_id) ? <CopyId value={String(r.provider_id)} /> : '—'}</DetailRow>
                      <DetailRow label="Variables"><pre className="whitespace-pre-wrap text-left text-[12px] [overflow-wrap:anywhere]">{JSON.stringify(r.variables ?? {}, null, 2)}</pre></DetailRow>
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-4">
                      {batchOf(r) && <Link className="text-accent hover:underline" href={`${root}/send/${batchOf(r)}`}>View this manual send</Link>}
                      {canAct && gid && <Link className="text-accent hover:underline" href={`${root}/send?again=${encodeURIComponent(String(r.id))}`}>Send again</Link>}
                    </div>
                  </DetailModal>
                  </span>
                </td>
              </Tr>
            );
          })}</tbody>
        </Table>
      )}
      <Pagination base={path} params={params} page={p.page} pageSize={PAGE_SIZE} total={data.total} />
    </>
  );
}

// ---- Contacts ----

export async function EmailContactsPage({ searchParams, role }: RouteCtx) {
  const owner = can(role, 'email.settings');
  const canAct = can(role, 'email.contact');
  const p = contactParams.parse(searchParams);
  const path = `${root}/contacts`;
  let data;
  try { data = await listContacts(p); } catch { return <ErrorPanel message="Could not load email contacts." retryHref={path} />; }
  const infos = await guildInfoMap(data.rows.map((r) => str(r.guild_id)).filter((g): g is string => !!g));
  const params = Object.fromEntries(Object.entries(p).filter(([k, v]) => k !== 'page' && v !== undefined).map(([k, v]) => [k, String(v)]));
  return (
    <>
      <PageHeader title="Email contacts" description="One row per server and address. Addresses are masked; revealing one is written to the audit log." updatedAt={new Date()}
        actions={<div className="flex flex-wrap gap-2">
          {canAct && <AddContact />}
          {owner && <EraseAddress />}
          {owner && <a className="btn" href={`${exportUrl}`}>Export CSV</a>}
          {owner && <a className="btn" href={`${exportUrl}?full=1`} title="Includes full addresses. The export is audit-logged.">Export full addresses</a>}
        </div>} />
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card><div className="text-xs text-muted">Contacts</div><div className="num text-2xl font-semibold">{int(data.all)}</div></Card>
        <Card><div className="text-xs text-muted">Unsubscribed from marketing</div><div className="num text-2xl font-semibold">{int(data.unsubscribed)}</div></Card>
      </div>
      <FilterBar action={path}>
        <input className="input w-40" name="guild" inputMode="numeric" placeholder="Server ID" defaultValue={p.guild} />
        <Select name="marketing" label="Marketing" value={p.marketing} options={[['', 'All'], ['subscribed', 'Subscribed'], ['unsubscribed', 'Unsubscribed']]} />
      </FilterBar>
      {data.rows.length === 0 ? <div className="card"><EmptyState title="No contacts match" /></div> : (
        <Table label="Email contacts">
          <thead><tr>{['Address', 'Server', 'Marketing', 'Added', ''].map((h, i) => <th key={i} className="th">{h}</th>)}</tr></thead>
          <tbody>{data.rows.map((r, i) => {
            const gid = str(r.guild_id);
            const un = str(r.marketing_unsubscribed_at);
            return (
              <Tr key={i}>
                <td className="td whitespace-nowrap">
                  <div>{canAct ? <RevealAddress id={String(r.id)} masked={maskEmail(pick(r, 'email', 'address'))} /> : maskEmail(pick(r, 'email', 'address'))}</div>
                  {str(r.discord_user_id) && <div className="text-xs text-muted">Discord user {String(r.discord_user_id)}</div>}
                </td>
                <td className="td">{gid ? <ServerLink id={gid} info={infos[gid]} showId={false} /> : '—'}</td>
                <td className="td whitespace-nowrap">{un ? <Badge tone="warning">Unsubscribed</Badge> : <Badge tone="success">Subscribed</Badge>}</td>
                <td className="td whitespace-nowrap"><div><When value={str(r.created_at)} /></div><div className="text-xs text-muted">{sentence(str(r.source))}</div></td>
                <td className="td whitespace-nowrap text-right"><ContactActions id={String(r.id)} unsubscribed={!!un} owner={owner} canAct={canAct} /></td>
              </Tr>
            );
          })}</tbody>
        </Table>
      )}
      <Pagination base={path} params={params} page={p.page} pageSize={PAGE_SIZE} total={data.total} />
    </>
  );
}

// ---- Settings ----

export async function EmailSettingsPage({ role }: RouteCtx) {
  let layout, schedule, health;
  try { [layout, schedule, health] = await Promise.all([getLayout(), getSchedule(), outboxHealth()]); } catch { return <ErrorPanel message="Could not load email settings." retryHref={`${root}/settings`} />; }
  const owner = can(role, 'email.settings');
  const failRate = health.total24 ? Math.round((health.failed24 / health.total24) * 100) : 0;
  return (
    <>
      <PageHeader title="Email settings" description="The shared layout every email is wrapped in, and when the automatic reminders go out." updatedAt={new Date()} />
      {health.failed24 > 0 && failRate >= 20 && <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-4 py-3 text-danger">{health.failed24} of {health.total24} emails failed in the last 24 hours. Check the SMTP settings and the mailbox password; a mail-server login error shows in the failed rows&apos; detail on the <Link className="underline" href={`${root}/outbox?status=failed`}>outbox</Link>.</p>}
      <div className="mb-5">
        <Card title="Sending health">
          <KV items={[
            ['Last successful send', health.lastSuccess ? <span key="l">{relative(health.lastSuccess)}</span> : 'Never'],
            ['Failed in the last 24 hours', `${int(health.failed24)} of ${int(health.total24)}${health.total24 ? ` (${failRate}%)` : ''}`],
            ['Queued over 15 minutes', int(health.stale)],
          ]} />
          <p className="mt-3 text-[12.5px] text-muted">The panel cannot see the mail server itself, so this is read from the outbox.</p>
        </Card>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Reminder schedule">
          {owner ? <ScheduleForm initial={schedule.effective} source={schedule.source} defaults={SCHEDULE_DEFAULTS} /> : (
            <KV items={[
              ['Renewal reminder (days before)', `${schedule.effective.renewal_days_before}${schedule.effective.renewal_days_before === 0 ? ' (never)' : ''}`],
              ['Trial-ended reminders: days apart', String(schedule.effective.trial_reminder_every_days)],
              ['Trial-ended reminders: total', String(schedule.effective.trial_reminder_max)],
            ]} />
          )}
        </Card>
        <Card title="Layout and branding">
          {owner ? <LayoutForm initial={layout.layout} /> : (
            <KV items={[['Brand name', layout.layout.brand_name], ['Accent colour', layout.layout.accent_color], ['Logo', layout.layout.logo_url || 'None']]} />
          )}
          {!owner && <p className="mt-3 text-[12.5px] text-muted">Only the owner can change the layout and schedule.</p>}
        </Card>
      </div>
    </>
  );
}

// ---- Send (manual) ----

export async function EmailSendPage({ searchParams, admin }: RouteCtx) {
  let templates: Row[];
  let again: Row | null = null;
  let accent = '#5B6CF0';
  try {
    templates = await listTemplates();
    accent = (await getLayout()).layout.accent_color;
    if (searchParams.again) again = await getOutboxRow(searchParams.again);
  } catch { return <ErrorPanel message="Could not load the send page." retryHref={`${root}/send`} />; }
  const vars = (again?.variables ?? {}) as Record<string, unknown>;
  return (
    <>
      <PageHeader title="Send email" description="For anything the automatic emails do not cover. Emails are queued and the bot sends them within about a minute." updatedAt={new Date()} />
      <EmailSend accent={accent} adminEmail={admin.email} base={base}
        templates={templates.map((t) => ({ key: String(t.key), name: pick(t, 'name') ?? String(t.key), category: pick(t, 'category') ?? 'transactional', subject: pick(t, 'subject') ?? '', preheader: pick(t, 'preheader') ?? '', html: pick(t, 'body_html') ?? '', text: pick(t, 'body_text') ?? '' }))}
        prefill={again || /^\d{5,25}$/.test(searchParams.guild ?? '') ? { guildId: str(again?.guild_id) ?? searchParams.guild, templateKey: str(again?.template_key) ?? undefined, subject: str(again?.subject_override) ?? undefined, html: str(again?.body_html) ?? undefined, text: str(again?.body_text) ?? undefined, marketing: vars.marketing === true } : undefined} />
    </>
  );
}

export async function EmailBatchPage({ params }: RouteCtx) {
  const batch = params.batch ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(batch)) return <div className="card"><EmptyState title="Send not found" /></div>;
  let initial;
  try { initial = { ok: true as const, ...(await batchProgress(batch)) }; } catch { return <ErrorPanel message="Could not load this send." retryHref={`${root}/send/${batch}`} />; }
  return (
    <>
      <PageHeader title="Manual send" description="Live progress for this send. It refreshes every 5 seconds while emails are waiting." updatedAt={new Date()}
        actions={<div className="flex gap-2"><Link className="btn" href={`${root}/send`}>New email</Link><Link className="btn" href={`${root}/outbox?kind=manual`}>Open outbox</Link></div>} />
      {initial.total === 0 ? <div className="card"><EmptyState title="No emails in this send" hint="It may still be queuing, or the link is wrong." /></div> : <BatchProgress batch={batch} initial={initial} />}
    </>
  );
}
