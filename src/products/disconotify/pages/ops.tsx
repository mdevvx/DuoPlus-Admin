import { Badge, Card, DetailRow, EmptyState, ErrorPanel, KV, PageHeader, Pagination, FilterBar, Stat, TagInput, Table, Tr, When } from '@/components/ui';
import { ConfirmAction } from '@/components/confirm-action';
import { DateField } from '@/components/date-field';
import { AuditTable } from '@/components/audit-table';
import { can } from '@/lib/roles';
import { BrandingCard } from '@/components/branding-card';
import { dateTime, int, platformLabel, relative, sentence, statusTone } from '@/lib/format';
import { PAGE_SIZE } from '@/lib/validation';
import { getBotSettings, getMergedAudit, getPlatformHealth, getTikTokBlockRate, getAbandonedCheckouts, getFailedDms, getReminders, getSubscriptionHealth } from '../queries/ops';
import Link from 'next/link';
import { setMaintenance } from '../actions';
import { emailCountsByType, emailStatsByGuild, getSchedule, outboxHealth } from '../queries/email';
import type { RouteCtx } from '@/products/types';
import { ServerLink, base } from './shared';
import { guildInfoMap } from '@/lib/discord';
import { SLUG, num, str, type Row } from '../db';
import { writeAudit } from '@/lib/audit';
import { CopyId } from '@/components/small-client';
import { DmStatus, PaymentStatus, dmKindLabel } from './shared';
import { ClampText, DetailModal } from '@/components/small-client';

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
  let failed: Awaited<ReturnType<typeof getFailedDms>> = { rows: [], available: false };
  try { [d, abandoned, failed] = await Promise.all([getReminders(), getAbandonedCheckouts(), getFailedDms()]); } catch { return <ErrorPanel message="Could not load reminders." retryHref={`${base}/reminders`} />; }
  const infos = await guildInfoMap([...d.upcoming, ...d.recent, ...abandoned, ...failed.rows].map((r) => String(r.guild_id)));
  const [stats, byType] = await Promise.all([
    emailStatsByGuild([...new Set([...d.upcoming, ...d.recent].map((r) => String(r.guild_id)))]).catch(() => new Map<string, { sent: number; last: string | null }>()),
    emailCountsByType().catch(() => null),
  ]);
  if (abandoned.some((a) => a.email)) await writeAudit({ admin_id: admin.id, admin_email: admin.email, product_slug: SLUG, action: 'view.abandoned_checkouts', target_type: 'reminders', target_id: 'abandoned_checkouts' });
  const act = (gid: string) => can(role, 'email.send') && <Link className="btn h-7 px-2.5 text-xs" href={`${base}/email/send?guild=${gid}`}>Send email</Link>;
  const table = (rows: typeof d.upcoming, title: string) => rows.length === 0 ? <EmptyState title={`No ${title.toLowerCase()}`} /> : (
    <Table label={title}>
      <thead><tr><th className="th">Server</th><th className="th">Expires</th><th className="th">Emails sent</th><th className="th">Last email</th><th className="th" /></tr></thead>
      <tbody>{rows.map((r) => {
        const gid = String(r.guild_id);
        return (
          <Tr key={gid}>
            <td className="td"><ServerLink id={gid} info={infos[gid]} /></td>
            <td className="td num">{dateTime(str(r.paid_until ?? r.trial_ends_at))}</td><td className="td num">{stats.get(gid)?.sent ?? 0}</td>
            <td className="td num">{stats.get(gid)?.last ? dateTime(stats.get(gid)!.last) : '—'}</td>
            <td className="td text-right">{act(gid)}</td>
          </Tr>
        );
      })}</tbody>
    </Table>
  );
  return (
    <>
      <PageHeader title="Reminders &amp; email" description="Upcoming expiries and the emails sent about them." updatedAt={new Date()} />
      <div className="grid gap-4">
        <Card title="Upcoming (next 7 days)">{table(d.upcoming, 'Upcoming reminders')}</Card>
        <Card title="Emails by type" action={<span className="text-xs text-muted">Last 30 days</span>}>
          {byType === null ? <EmptyState compact title="Email log not available yet" hint="Apply the bot's email migration" /> : byType.length === 0 ? <EmptyState compact title="No emails in the last 30 days" /> : (
            <Table label="Emails by type" bare>
              <thead><tr><th className="th">Template</th><th className="th text-right">Sent</th><th className="th text-right">Failed</th><th className="th text-right">Skipped</th><th className="th text-right">Waiting</th></tr></thead>
              <tbody>{byType.map((t) => (
                <Tr key={t.key}>
                  <td className="td"><Link className="text-accent hover:underline" href={t.key === 'custom' ? `${base}/email/outbox?template=custom` : `${base}/email/templates/${t.key}`}>{t.key === 'custom' ? 'Custom emails' : sentence(t.key)}</Link></td>
                  <td className="td num text-right">{int(t.sent)}</td><td className="td num text-right">{t.failed ? <span className="text-danger">{int(t.failed)}</span> : '0'}</td>
                  <td className="td num text-right">{int(t.skipped)}</td><td className="td num text-right">{int(t.queued)}</td>
                </Tr>
              ))}</tbody>
            </Table>
          )}
        </Card>
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
        <Card title={`Failed activation DMs (${failed.rows.length})`} action={<span className="text-xs text-muted">Last 30 days</span>}>
          {!failed.available ? <EmptyState compact title="DM log not available yet" hint="Apply the bot's dm_log migration to track delivery" />
            : failed.rows.length === 0 ? <EmptyState compact title="No failed activation DMs" hint="Every activation DM in the last 30 days was delivered" />
            : (
              <Table label="Failed DMs" bare>
                <thead><tr><th className="th">Server</th><th className="th">Discord user ID</th><th className="th">Message</th><th className="th">Status</th><th className="th">Detail</th><th className="th">When</th></tr></thead>
                <tbody>{failed.rows.map((x) => {
                  const gid = String(x.guild_id);
                  return (
                    <Tr key={String(x.id)}>
                      <td className="td"><ServerLink id={gid} info={infos[gid]} /></td>
                      <td className="td"><CopyId value={String(x.discord_user_id)} /></td>
                      <td className="td">{dmKindLabel(x.kind)}</td>
                      <td className="td"><DmStatus status={x.status} /></td>
                      <td className="td text-muted">{str(x.error) ?? '—'}</td>
                      <td className="td num whitespace-nowrap">{dateTime(str(x.created_at))}</td>
                    </Tr>
                  );
                })}</tbody>
              </Table>
            )}
        </Card>
        <Card title="Recently emailed">{table(d.recent, 'Recent reminders')}</Card>
      </div>
    </>
  );
}

const PLATFORM_ORDER = ['youtube', 'kick', 'instagram', 'twitter', 'x', 'tiktok'];
const orderOf = (p: string) => { const i = PLATFORM_ORDER.indexOf(p.toLowerCase()); return i === -1 ? 99 : i; };

const isPaused = (r: Row) => !!r.rate_limited_until && new Date(String(r.rate_limited_until)).getTime() > Date.now();
const isDisabled = (r: Row) => String(r.status ?? '').toLowerCase() === 'disabled';

/** Both quotas are rolling windows, so the remaining value can move up as well as down. YouTube's is an estimate. */
const QUOTA_PERIOD: Record<string, string> = { youtube: 'today (estimate)', instagram: 'this hour' };

/** Quota meter where the provider reports one; "N/A" where it does not (X, TikTok). */
function QuotaCell({ row, full }: { row: Row; full?: boolean }) {
  const limit = num(row.quota_limit);
  if (!limit || row.quota_remaining === null || row.quota_remaining === undefined) return <span className="text-sm text-muted" title="No quota reported. TikTok, X and Twitch have none; YouTube and Instagram show a value once the bot reports it">N/A</span>;
  const used = Math.max(0, limit - num(row.quota_remaining));
  const pct = Math.min(100, Math.round((used / limit) * 100));
  // A pause with nothing left means the provider throttled us, so "100% used" would overstate what the bot spent.
  if (isPaused(row) && num(row.quota_remaining) <= 0) {
    return (
      <div className={full ? undefined : 'min-w-[140px]'}>
        <div className="num text-xs text-danger">Rate limited · resumes {relative(String(row.rate_limited_until))}</div>
        <div className="mt-1 h-1.5 overflow-hidden rounded bg-subtle" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Quota exhausted">
          <div className="h-full rounded" style={{ width: '100%', background: 'var(--danger)' }} />
        </div>
      </div>
    );
  }
  return (
    <div className={full ? undefined : 'min-w-[140px]'}>
      <div className="num text-xs text-muted">{int(limit - used)} of {int(limit)} left {QUOTA_PERIOD[String(row.platform).toLowerCase()] ?? ''} · {pct}% used</div>
      <div className="mt-1 h-1.5 overflow-hidden rounded bg-subtle" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Quota used">
        <div className="h-full rounded" style={{ width: `${pct}%`, background: pct >= 90 ? 'var(--danger)' : pct >= 70 ? 'var(--warning)' : 'var(--success)' }} />
      </div>
    </div>
  );
}

/** One tag per platform: a pause overrides the status, since it is what the admin needs to know. */
function PlatformStatus({ row, short }: { row: Row; short?: boolean }) {
  const status = str(row.status) ?? 'healthy';
  // `short` (cards) shows only the state; the resume time lives in the table and the details dialog.
  if (isPaused(row)) return <Badge tone="warning">{short ? 'Paused' : `Paused, resumes ${relative(String(row.rate_limited_until))}`}</Badge>;
  return (
    <span title={status === 'disabled' ? 'No account is monitored on this platform yet. It switches to Healthy after the first check.' : undefined}>
      <Badge tone={statusTone(status)}>{sentence(status)}</Badge>
    </span>
  );
}

export async function HealthPage({ role }: RouteCtx) {
  let d;
  let tiktok;
  try { [d, tiktok] = await Promise.all([getPlatformHealth(), getTikTokBlockRate().catch(() => null)]); } catch { return <ErrorPanel message="Could not load platform health." retryHref={`${base}/health`} />; }
  const platforms = [...d.platforms].sort((x, y) => orderOf(String(x.platform ?? '')) - orderOf(String(y.platform ?? '')));
  const active = platforms.filter((p) => !isDisabled(p));
  const healthy = active.filter((p) => statusTone(str(p.status) ?? 'healthy') === 'success' && !isPaused(p)).length;
  const attention = active.length - healthy;
  const tiktokRow = platforms.find((p) => String(p.platform).toLowerCase() === 'tiktok');
  const blocked = !!tiktokRow && isPaused(tiktokRow);
  return (
    <>
      <PageHeader title="Platform health" updatedAt={new Date()} description="Status of each monitored platform and the bot's maintenance flag."
        actions={can(role, 'maintenance.set') && (
          <ConfirmAction label={d.maintenance ? 'Turn maintenance OFF' : 'Turn maintenance ON'} danger={!d.maintenance} small={false} title="Maintenance mode" action={setMaintenance}
            hidden={{ enabled: String(!d.maintenance) }} typeToConfirm="MAINTENANCE" description="Writes the flag the bot reads. Alerts may pause while it is on." />
        )} />
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card><Stat label="Platforms active" value={int(active.length)} hint={platforms.length > active.length ? `${platforms.length - active.length} disabled` : undefined} /></Card>
        <Card><Stat label="Healthy" value={int(healthy)} /></Card>
        <Card><Stat label="Needs attention" value={<span className={attention > 0 ? 'text-danger' : undefined}>{int(attention)}</span>} /></Card>
        <Card><Stat label="Maintenance mode" value={d.maintenance ? <Badge tone="warning">On</Badge> : <Badge tone="success">Off</Badge>} /></Card>
      </div>
      {platforms.length > 0 && (
        <div className="mb-5 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
          {platforms.map((p, i) => {
            const bad = !isDisabled(p) && (statusTone(str(p.status) ?? 'healthy') !== 'success' || isPaused(p));
            const failing = num(p.consecutive_failures);
            return (
              <Card key={i} className={bad ? 'border-warning' : undefined}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-base font-semibold">{platformLabel(str(p.platform))}</span>
                  <PlatformStatus row={p} short />
                </div>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <div className="num text-[26px] font-semibold leading-8">{int(num(p.requests_today))}</div>
                    <div className="text-xs text-muted">requests today</div>
                  </div>
                  <div className="text-right">
                    <div className={failing > 0 ? 'num text-[26px] font-semibold leading-8 text-danger' : 'num text-[26px] font-semibold leading-8'}>{int(failing)}</div>
                    <div className="text-xs text-muted">failures in a row</div>
                  </div>
                </div>
                <div className="mt-4 border-t border-line pt-3">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Quota</div>
                  <QuotaCell row={p} full />
                </div>
                <div className="mt-3 text-xs text-muted">Last success: {p.last_success_at ? relative(String(p.last_success_at)) : 'never'}</div>
                {bad && str(p.last_error) && <div className="mt-2 text-xs text-danger"><ClampText text={String(p.last_error)} title={`${platformLabel(str(p.platform))} last error`} max={60} /></div>}
              </Card>
            );
          })}
        </div>
      )}
      {tiktok && tiktok.total > 0 && (
        <div className="mb-4">
          <Card title="TikTok blocking">
            <KV items={[
              ['Platform', blocked ? <Badge key="b" tone="danger">Paused: TikTok is blocking the host</Badge> : <Badge key="b" tone="success">Not paused</Badge>],
              ['Resumes', blocked && tiktokRow ? <When key="r" value={str(tiktokRow.rate_limited_until)} /> : '—'],
              ['Enabled accounts', int(tiktok.total)],
              ['Accounts in error', <Badge key="e" tone={tiktok.errorShare >= 0.5 ? 'danger' : tiktok.error > 0 ? 'warning' : 'success'}>{int(tiktok.error)} ({Math.round(tiktok.errorShare * 100)}%)</Badge>],
              ['Invalid (re-add needed)', int(tiktok.invalid)],
            ]} />
            {tiktok.errorShare >= 0.5 && (
              <p className="mt-3 text-xs text-danger">
                {blocked ? 'Most TikTok accounts are failing and the platform is paused. This is a block, not an account problem.' : 'Most TikTok accounts are failing but the platform is not paused. That points to timeouts or a changed page, not a block.'}
              </p>
            )}
          </Card>
        </div>
      )}
      {platforms.length === 0 ? <Card title="Platforms"><EmptyState title="No platform data yet" hint="A platform appears after its first check." /></Card> : (
        <Table label="Platforms">
          <thead><tr>{['Platform', 'Status', 'Requests', 'Quota', 'Failures', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>{platforms.map((p, i) => (
            <Tr key={i}>
              <td className="td font-medium">{platformLabel(str(p.platform))}</td>
              <td className="td"><PlatformStatus row={p} /></td>
              <td className="td num">{int(num(p.requests_today))}</td>
              <td className="td"><QuotaCell row={p} /></td>
              <td className="td num">{int(num(p.consecutive_failures))}</td>
              <td className="td text-right">
                <DetailModal trigger="Details" title={`${platformLabel(str(p.platform))} details`}>
                  <div className="mb-4 flex items-center justify-between rounded-lg bg-subtle px-4 py-3">
                    <span className="font-semibold">{platformLabel(str(p.platform))}</span>
                    <PlatformStatus row={p} />
                  </div>
                  <dl className="divide-y divide-line text-sm">
                    <DetailRow label="Last success"><When value={str(p.last_success_at)} /></DetailRow>
                    <DetailRow label="Last error"><When value={str(p.last_error_at)} /></DetailRow>
                    <DetailRow label="Failures in a row">{int(num(p.consecutive_failures))}</DetailRow>
                    <DetailRow label="Requests today">{int(num(p.requests_today))}</DetailRow>
                    {isPaused(p) && <DetailRow label="Paused until"><When value={str(p.rate_limited_until)} /></DetailRow>}
                  </dl>
                  <div className="mt-4">
                    <div className="mb-1 text-xs text-muted">Last error message</div>
                    <p className="whitespace-pre-wrap break-words rounded-lg border border-line bg-subtle px-3 py-2.5 text-sm leading-5">{str(p.last_error) ?? 'No error recorded.'}</p>
                  </div>
                </DetailModal>
              </td>
            </Tr>
          ))}</tbody>
        </Table>
      )}
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
        <TagInput name="action" placeholder="Action prefix" value={f.action} className="w-52" />
        <TagInput name="admin" placeholder="Admin email contains" value={f.admin} className="w-60" />
        <TagInput name="target" placeholder="Server ID" value={f.target} className="w-52" />
        <DateField name="from" defaultValue={f.from} placeholder="From date" />
        <DateField name="to" defaultValue={f.to} placeholder="To date" />
      </FilterBar>
      <AuditTable rows={rows} showProduct={false} />
      <Pagination base={`${base}/audit`} params={params} page={f.page} pageSize={PAGE_SIZE} total={total} />
    </>
  );
}

export async function SettingsPage({ role, manifest }: { role: RouteCtx['role']; manifest: { name: string; icon: string; logo?: string } }) {
  const rows = await getBotSettings();
  const [schedule, health] = await Promise.all([getSchedule().catch(() => null), outboxHealth().catch(() => null)]);
  return (
    <>
      <PageHeader title="Settings" description="Product branding, plus how the bot currently runs (read only, change on the bot's host)." updatedAt={new Date()} />
      <div className="mb-4"><BrandingCard slug={SLUG} role={role} manifest={manifest} /></div>
      {schedule && (
        <div className="mb-4">
          <Card title="Email" action={<Link className="text-sm text-accent hover:underline" href={`${base}/email/settings`}>Email settings</Link>}>
            <KV items={[
              ['Renewal reminder (days before)', schedule.effective.renewal_days_before === 0 ? 'Never' : String(schedule.effective.renewal_days_before)],
              ['Trial-ended reminders', `Every ${schedule.effective.trial_reminder_every_days} days, up to ${schedule.effective.trial_reminder_max}`],
              ['Last successful send', health?.lastSuccess ? relative(health.lastSuccess) : 'Never'],
              ['Failed in the last 24 hours', health ? `${int(health.failed24)} of ${int(health.total24)}` : '—'],
            ]} />
          </Card>
        </div>
      )}
      <Card>
        {rows.length === 0 ? <EmptyState title="Configured on the bot's host" hint="Price, trial days, grace days and the reminder schedule are environment variables of the bot, not stored in the database." /> : (
          <KV items={rows.map((r) => [String(r.key).replace(/_/g, ' '), typeof r.value === 'object' ? JSON.stringify(r.value) : String(r.value)])} />
        )}
      </Card>
    </>
  );
}
