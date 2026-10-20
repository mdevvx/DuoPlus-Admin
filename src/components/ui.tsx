import Link from 'next/link';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Tag, Info, XCircle, Inbox, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Clock, Crown, UserCog } from 'lucide-react';
import { Icon } from './icons';
import { roleLabel } from '@/lib/roles';
import { relative } from '@/lib/format';
import type { ReactNode } from 'react';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE: Record<Tone, { cls: string; Icon: typeof Info }> = {
  success: { cls: 'bg-success-soft text-success', Icon: CheckCircle2 },
  warning: { cls: 'bg-warning-soft text-warning', Icon: AlertTriangle },
  danger: { cls: 'bg-danger-soft text-danger', Icon: XCircle },
  info: { cls: 'bg-info-soft text-info', Icon: Info },
  neutral: { cls: 'border border-line bg-subtle text-ink', Icon: Tag },
};

/** Status is always icon + text, never colour alone. */
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const { cls, Icon } = TONE[tone];
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded px-2.5 py-0.5 text-xs font-medium', cls)}>
      <Icon className="h-3 w-3" aria-hidden />
      {children}
    </span>
  );
}

export function PageHeader({ title, description, actions, updatedAt, icon }: { title: string; description?: string; actions?: ReactNode; updatedAt?: Date; icon?: ReactNode }) {
  return (
    <div className="mb-7 flex items-start justify-between gap-6">
      <div className="flex min-w-0 items-center gap-4">
        {icon}
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-8 tracking-normal">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-muted">{description}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {updatedAt && (
          <span className="num inline-flex items-center gap-1.5 rounded bg-subtle px-2.5 py-1 text-xs text-muted">
            <Clock className="h-3 w-3" aria-hidden /> Updated {updatedAt.toISOString().slice(11, 19)} UTC
          </span>
        )}
        {actions}
      </div>
    </div>
  );
}

export function Card({ title, children, className, action }: { title?: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={clsx('card', className)}>
      {title && (
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] font-medium text-muted">{label}</div>
        {icon && <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent"><Icon name={icon} /></span>}
      </div>
      <div className="num mt-2 text-[28px] font-semibold leading-9 tracking-normal">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function EmptyState({ title, hint, compact }: { title: string; hint?: string; compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex items-center gap-3 text-muted">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-subtle"><Inbox className="h-4 w-4" aria-hidden /></span>
        <span><span className="font-medium text-ink">{title}</span>{hint && <span> · {hint}</span>}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded bg-subtle text-muted"><Inbox className="h-5 w-5" aria-hidden /></span>
      <div className="mt-1 font-semibold">{title}</div>
      {hint && <div className="max-w-sm text-muted">{hint}</div>}
    </div>
  );
}

/** A date with its time and a relative hint underneath. Server-rendered, UTC. */
export function When({ value }: { value?: string | Date | null }) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return <span className="text-muted">—</span>;
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return (
    <div className="num leading-tight">
      <div className="whitespace-nowrap">{date}</div>
      <div className="text-xs text-muted">{d.toISOString().slice(11, 16)} UTC · {relative(d)}</div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton h-4', className)} aria-hidden />;
}

export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="card p-4" role="status" aria-label="Loading">
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex gap-4">
            {Array.from({ length: cols }, (_, c) => <Skeleton key={c} className="flex-1" />)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Table({ children, label, bare }: { children: ReactNode; label: string; bare?: boolean }) {
  return (
    <div className={bare ? '-mx-5 -mb-5 overflow-hidden' : 'card overflow-hidden'}>
      <div className="max-h-[calc(100vh-260px)] overflow-y-auto overflow-x-hidden">
        <table className="w-full border-collapse text-sm" aria-label={label} data-keynav>{children}</table>
      </div>
    </div>
  );
}
export const Tr = ({ children }: { children: ReactNode }) => <tr className="border-t border-line transition-colors first:border-0 hover:bg-subtle">{children}</tr>;

/** Build a URL keeping current params. Values are never PII (search terms excluded by callers if needed). */
export function href(base: string, params: Record<string, string | number | undefined | null>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

export function SortHeader({ label, field, base, params, sort, dir }: {
  label: string; field: string; base: string; params: Record<string, string | undefined>; sort?: string; dir: 'asc' | 'desc';
}) {
  const active = sort === field;
  const next = active && dir === 'desc' ? 'asc' : 'desc';
  return (
    <th className="th" aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <Link href={href(base, { ...params, sort: field, dir: next, page: 1 })} className="inline-flex items-center gap-1 hover:text-ink">
        {label}
        {active && (dir === 'asc' ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />)}
      </Link>
    </th>
  );
}

export function Pagination({ base, params, page, pageSize, total }: {
  base: string; params: Record<string, string | undefined>; page: number; pageSize: number; total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="mt-4 flex items-center justify-between text-sm text-muted" aria-label="Pagination">
      <span className="num">{from}–{to} of {total.toLocaleString('en-US')}</span>
      <div className="flex items-center gap-2">
        <Link aria-disabled={page <= 1} className={clsx('btn', page <= 1 && 'pointer-events-none opacity-50')} href={href(base, { ...params, page: page - 1 })}>
          <ChevronLeft className="h-4 w-4" aria-hidden /> Prev
        </Link>
        <span className="num">Page {page} / {pages}</span>
        <Link aria-disabled={page >= pages} className={clsx('btn', page >= pages && 'pointer-events-none opacity-50')} href={href(base, { ...params, page: page + 1 })}>
          Next <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </nav>
  );
}

export { FilterBar } from './filter-bar';

export function Select({ name, value, options, label }: { name: string; value?: string; options: [string, string][]; label: string }) {
  return (
    <label className="flex items-center gap-1.5 text-muted">
      <span className="text-xs">{label}</span>
      <select name={name} defaultValue={value ?? ''} className="input w-auto pr-7">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

export function ErrorPanel({ message, retryHref }: { message: string; retryHref?: string }) {
  return (
    <div className="card flex items-center justify-between gap-4 border-danger p-5" role="alert">
      <div className="flex items-center gap-2 text-danger"><XCircle className="h-4 w-4" aria-hidden /> {message}</div>
      {retryHref && <Link className="btn" href={retryHref}>Retry</Link>}
    </div>
  );
}

export function KV({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[170px_1fr] gap-x-4 gap-y-3">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 break-words">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Dashboard building blocks
// ---------------------------------------------------------------------------
export type Hue = 'green' | 'blue' | 'amber' | 'violet' | 'rose';
const HUE_VAR: Record<Hue, string> = { green: 'var(--chart-1)', blue: 'var(--chart-2)', amber: 'var(--chart-3)', violet: 'var(--chart-4)', rose: 'var(--chart-5)' };
export const hueColor = (h: Hue) => HUE_VAR[h];

/** Coloured square holding an icon, as on the reference dashboard. */
export function IconTile({ icon, hue = 'green', size = 40 }: { icon: string; hue?: Hue; size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-xl text-white shadow-soft" style={{ width: size, height: size, background: `linear-gradient(135deg, ${HUE_VAR[hue]}, color-mix(in srgb, ${HUE_VAR[hue]} 70%, #000))` }} aria-hidden>
      <Icon name={icon} className="h-[18px] w-[18px]" />
    </span>
  );
}

/** Up/down pill. Pass null to hide it. */
export function Trend({ delta, suffix = '%' }: { delta: number | null | undefined; suffix?: string }) {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) return null;
  const up = delta >= 0;
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold', up ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger')}>
      {up ? <ArrowUp className="h-3 w-3 rotate-45" aria-hidden /> : <ArrowDown className="h-3 w-3 -rotate-45" aria-hidden />}
      {up ? '+' : ''}{Math.abs(delta) < 10 ? delta.toFixed(1) : Math.round(delta)}{suffix}
    </span>
  );
}

/** Card with icon tile, trend pill, big value, an optional chart and key/value rows. */
export function StatCard({ icon, hue = 'green', label, value, delta, children, rows, className }: {
  icon: string; hue?: Hue; label: string; value: ReactNode; delta?: number | null;
  children?: ReactNode; rows?: [string, ReactNode][]; className?: string;
}) {
  return (
    <section className={clsx('card rise p-5 transition-shadow hover:shadow-pop', className)}>
      <div className="flex items-start justify-between">
        <IconTile icon={icon} hue={hue} />
        <Trend delta={delta} />
      </div>
      <div className="mt-4 text-[13px] font-medium text-muted">{label}</div>
      <div className="num mt-0.5 text-[28px] font-semibold leading-9 tracking-normal">{value}</div>
      {children && <div className="mt-3">{children}</div>}
      {rows && rows.length > 0 && (
        <dl className="mt-3 space-y-1.5 text-[13px]">
          {rows.map(([k, v]) => <div key={k} className="flex items-center justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="num font-medium">{v}</dd></div>)}
        </dl>
      )}
    </section>
  );
}

/** Small boxed number used in "health" panels. */
export function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-subtle px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="num mt-0.5 text-lg font-semibold">{value}</div>
    </div>
  );
}

/** Deep graphite welcome banner with headline numbers. */
export function Hero({ title, text, metrics, chips, actions, aside }: {
  title: string; text: ReactNode; metrics: { label: string; value: ReactNode }[]; chips?: ReactNode; actions?: ReactNode; aside?: ReactNode;
}) {
  return (
    <section className="hero rise relative mb-6 overflow-hidden rounded-2xl border border-side-line p-7 text-white">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          {chips && <div className="mb-4 flex flex-wrap items-center gap-2">{chips}</div>}
          <h1 className="text-[28px] font-bold leading-9 tracking-normal">{title}</h1>
          <p className="mt-2 max-w-2xl text-[14.5px] leading-6 text-side-ink">{text}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-3">
          <div className="flex items-center gap-2">{actions}</div>
          {aside && <div className="text-xs text-side-muted">{aside}</div>}
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3">
        {metrics.map((m, i) => (
          <div key={m.label} className={clsx('pr-8', i < metrics.length - 1 && 'border-r border-side-line')}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-side-muted">{m.label}</div>
            <div className="num mt-1 text-[22px] font-semibold leading-7">{m.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Pill used on the hero banner. */
export function HeroChip({ children, live }: { children: ReactNode; live?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-side-line bg-white/10 px-2.5 py-1 text-xs font-medium text-side-ink">
      {live && <span className="h-1.5 w-1.5 rounded-full bg-side-accent" />}
      {children}
    </span>
  );
}

/** Light button for use on the dark hero. */
export const heroBtn = 'inline-flex h-9 items-center gap-2 rounded-lg border border-side-line bg-white/10 px-3.5 text-sm font-medium text-white transition-colors hover:bg-white/20';
export const heroBtnSolid = 'inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3.5 text-sm font-semibold text-[#14141a] transition-opacity hover:opacity-90';

/** "Owner" / "Admin" tag shown next to a person's name. */
export function RoleTag({ role, onDark }: { role: string; onDark?: boolean }) {
  const owner = role === 'owner';
  const Ico = owner ? Crown : UserCog;
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold leading-4',
      onDark ? (owner ? 'bg-side-accent/15 text-side-accent' : 'bg-white/10 text-side-ink') : (owner ? 'bg-accent-soft text-accent' : 'bg-subtle text-muted'))}>
      <Ico className="h-3 w-3" aria-hidden />{roleLabel(role)}
    </span>
  );
}

/** One label/value line inside a DetailModal's <dl>. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right">{children}</dd>
    </div>
  );
}
