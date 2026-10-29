'use client';

import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { Card, Skeleton } from './ui';

/**
 * Loading screens shaped like the page that is about to appear, so the layout does not jump when the real content
 * arrives. The route decides which one shows (see `variantFor`). Rows fade in one after another instead of pulsing together.
 */
export type SkeletonVariant = 'home' | 'overview' | 'list' | 'stats-list' | 'detail' | 'editor' | 'compose' | 'settings';

/** Which shape fits a path like /p/team-management/email/templates/welcome. */
export function variantFor(pathname: string): SkeletonVariant {
  const m = /^\/p\/[^/]+\/?(.*)$/.exec(pathname);
  if (!m) return pathname === '/' ? 'home' : 'list';
  const rest = m[1]!.replace(/\/$/, '');
  if (rest === '') return 'overview';
  if (/^email\/templates\/[^/]+$/.test(rest)) return 'editor';
  if (rest === 'email/send' || /^email\/send\/[^/]+$/.test(rest)) return 'compose';
  if (rest === 'email' || rest === 'reminders' || rest === 'subscriptions') return 'stats-list';
  if (/(^|\/)(settings|bot|health)$/.test(rest)) return 'settings';
  if (/^[\w-]+\/[^/]+$/.test(rest) && !rest.startsWith('email/')) return 'detail';
  return 'list';
}

const delay = (i: number) => ({ animationDelay: `${Math.min(i, 10) * 45}ms` });

function Header({ action = true, desc = 'w-80' }: { action?: boolean; desc?: string }) {
  return (
    <div className="mb-7 flex items-start justify-between gap-6">
      <div><Skeleton className="mb-2.5 h-7 w-56" /><Skeleton className={clsx('h-4', desc)} /></div>
      {action && <Skeleton className="h-9 w-32 rounded-lg" />}
    </div>
  );
}

function Stats({ n = 4 }: { n?: number }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: n }, (_, i) => (
        <Card key={i}><div className="skeleton-in" style={delay(i)}><Skeleton className="mb-3 h-3 w-24" /><Skeleton className="h-8 w-20" /></div></Card>
      ))}
    </div>
  );
}

function FilterBar() {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl border border-line bg-surface p-2.5">
      <Skeleton className="h-9 w-64 max-w-full rounded-lg" />
      <Skeleton className="hidden h-9 w-28 rounded-lg sm:block" />
      <Skeleton className="hidden h-9 w-24 rounded-lg sm:block" />
    </div>
  );
}

/** A table whose columns look like real ones: a two-line first column, a badge, plain text and an action at the end. */
function Rows({ rows = 8 }: { rows?: number }) {
  return (
    <div className="card overflow-hidden" role="status" aria-label="Loading">
      <div className="flex gap-4 border-b border-line bg-subtle px-4 py-3">
        {['w-20', 'w-32', 'w-16', 'w-24', 'w-12'].map((w, i) => <Skeleton key={i} className={clsx('h-3', w, i === 1 && 'flex-1')} />)}
      </div>
      <div className="divide-y divide-line">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="skeleton-in flex items-center gap-4 px-4 py-3.5" style={delay(r)}>
            <Skeleton className="h-4 w-24" />
            <div className="flex-1 space-y-1.5"><Skeleton className="h-4 w-3/5" /><Skeleton className="h-3 w-2/5" /></div>
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-7 w-16 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ wide, tall }: { wide?: boolean; tall?: boolean }) {
  return <div><Skeleton className="mb-2 h-3 w-20" /><Skeleton className={clsx(tall ? 'h-40' : 'h-9', wide ? 'w-full' : 'w-2/3', 'rounded-lg')} /></div>;
}

function Preview({ height = 'h-[520px]' }: { height?: string }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2"><Skeleton className="h-9 w-28 rounded-lg" /><Skeleton className="h-9 w-20 rounded-lg" /><Skeleton className="h-9 w-20 rounded-lg" /></div>
      <Card><Skeleton className="mb-2 h-3 w-24" /><Skeleton className="h-4 w-3/4" /></Card>
      <Skeleton className={clsx(height, 'w-full rounded-xl')} />
    </div>
  );
}

export function PageSkeleton({ variant }: { variant: SkeletonVariant }) {
  return (
    <div role="status" aria-label="Loading" aria-busy="true">
      {variant === 'home' && (
        <>
          <Skeleton className="mb-6 h-32 w-full rounded-2xl" />
          <div className="grid grid-cols-2 gap-5">
            {[0, 1].map((i) => (
              <Card key={i}><div className="skeleton-in" style={delay(i)}>
                <div className="mb-5 flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-xl" /><div className="space-y-1.5"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-48" /></div></div>
                <div className="grid grid-cols-3 gap-4">{[0, 1, 2].map((k) => <div key={k}><Skeleton className="mb-2 h-3 w-16" /><Skeleton className="h-7 w-14" /></div>)}</div>
              </div></Card>
            ))}
          </div>
        </>
      )}

      {variant === 'overview' && (
        <>
          <Header action={false} />
          <Stats />
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2"><Skeleton className="mb-5 h-4 w-40" /><Skeleton className="h-56 w-full rounded-lg" /></Card>
            <Card><Skeleton className="mb-5 h-4 w-28" />{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton-in mb-3 flex items-center justify-between" style={delay(i)}><Skeleton className="h-4 w-28" /><Skeleton className="h-4 w-10" /></div>)}</Card>
          </div>
        </>
      )}

      {variant === 'list' && (<><Header /><FilterBar /><Rows /></>)}

      {variant === 'stats-list' && (<><Header /><Stats /><Rows rows={5} /></>)}

      {variant === 'detail' && (
        <>
          <Header desc="w-48" />
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <Skeleton className="mb-5 h-4 w-32" />
              {Array.from({ length: 7 }, (_, i) => <div key={i} className="skeleton-in flex justify-between border-t border-line py-3 first:border-0" style={delay(i)}><Skeleton className="h-4 w-28" /><Skeleton className="h-4 w-44" /></div>)}
            </Card>
            <Card><Skeleton className="mb-5 h-4 w-24" /><Skeleton className="mb-3 h-10 w-full rounded-lg" /><Skeleton className="mb-3 h-10 w-full rounded-lg" /><Skeleton className="h-10 w-full rounded-lg" /></Card>
          </div>
        </>
      )}

      {variant === 'editor' && (
        <>
          <Header desc="w-56" />
          <Skeleton className="mb-4 h-12 w-full rounded-lg" />
          <div className="grid gap-5 xl:grid-cols-2">
            <div className="space-y-4"><Field wide /><Field wide /><Field wide tall /><Field /><Skeleton className="h-10 w-36 rounded-lg" /></div>
            <Preview />
          </div>
        </>
      )}

      {variant === 'compose' && (
        <>
          <Header action={false} />
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
            <div className="space-y-5">
              {[0, 1, 2].map((i) => <Card key={i}><div className="skeleton-in space-y-4" style={delay(i)}><Skeleton className="h-4 w-36" /><Field wide />{i === 1 && <Field wide tall />}</div></Card>)}
            </div>
            <Preview height="h-[420px]" />
          </div>
        </>
      )}

      {variant === 'settings' && (
        <>
          <Header action={false} />
          <div className="grid gap-5 xl:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i}><div className="skeleton-in space-y-4" style={delay(i)}><Skeleton className="h-4 w-36" /><Field wide /><Field wide />{i % 2 === 0 && <Field />}<Skeleton className="h-9 w-28 rounded-lg" /></div></Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** What `loading.tsx` renders: the skeleton that matches the page being opened. */
export function RouteSkeleton() {
  return <PageSkeleton variant={variantFor(usePathname())} />;
}
