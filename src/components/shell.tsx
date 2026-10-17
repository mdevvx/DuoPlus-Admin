'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import clsx from 'clsx';
import { Search, Sun, Moon, Monitor, ChevronsUpDown, LogOut, ShieldCheck, Keyboard, Check, ChevronRight, UserPen } from 'lucide-react';
import { Icon } from './icons';
import { setTheme } from '@/app/(hub)/actions';
import { signOutAction, signOutEverywhereAction } from '@/app/(auth)/actions';
import { RoleTag } from './ui';

export interface ShellProduct {
  slug: string; name: string; icon: string; health: 'ok' | 'warn' | 'down';
  nav: { label: string; path: string; icon: string; shortcut?: string }[];
}
export interface ShellUser { name: string; email: string; role: string }

const HEALTH = { ok: ['bg-success', 'Healthy'], warn: ['bg-warning', 'Degraded'], down: ['bg-danger', 'Down'] } as const;
export function HealthDot({ health }: { health: 'ok' | 'warn' | 'down' }) {
  return <span className={clsx('inline-block h-2 w-2 shrink-0 rounded-full ring-2 ring-white/10', HEALTH[health][0])} title={HEALTH[health][1]} role="img" aria-label={HEALTH[health][1]} />;
}

export function Logo({ size = 32 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- small static brand SVG served from /public
  return <img src="/logo.svg" alt="" width={size} height={size} className="shrink-0 rounded-[10px] shadow-soft" aria-hidden />;
}

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open, close]);
  return ref;
}

const navClass = (active: boolean) => clsx(
  'group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] transition-colors',
  active ? 'bg-side-active font-semibold text-side-accent' : 'text-side-muted hover:bg-white/5 hover:text-white',
);
const ActiveBar = ({ show }: { show: boolean }) => show ? <span className="absolute -left-3 top-2 h-6 w-1 rounded-r-full bg-side-accent" aria-hidden /> : null;
const sideLabel = 'px-3 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-wider text-side-muted';

export function Sidebar({ products, showAdmins, user }: { products: ShellProduct[]; showAdmins: boolean; user: ShellUser }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  const current = products.find((p) => path.startsWith(`/p/${p.slug}`));
  const initial = user.name.trim().charAt(0).toUpperCase();

  return (
    <aside className="flex w-[264px] shrink-0 flex-col bg-gradient-to-b from-side-bg to-side-bg2 text-side-ink">
      <Link href="/" className="flex h-16 items-center gap-3 border-b border-side-line px-5">
        <Logo size={34} />
        <span className="text-[17px] font-bold tracking-tight text-white">DuoPlus Admin</span>
      </Link>

      <div className="px-3" ref={ref}>
        <div className={sideLabel}>Product</div>
        <div className="relative">
          <button className="flex w-full items-center gap-3 rounded-xl border border-side-line bg-white/5 px-3 py-2.5 text-left transition-colors hover:bg-white/10" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-side-active text-side-accent"><Icon name={current?.icon ?? 'home'} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold leading-tight text-white">{current?.name ?? 'All products'}</span>
              <span className="block text-xs leading-tight text-side-muted">{current ? 'Switch product' : 'Choose a product'}</span>
            </span>
            {current && <HealthDot health={current.health} />}
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-side-muted" aria-hidden />
          </button>
          {open && (
            <ul role="listbox" className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 rounded-xl border border-side-line bg-side-bg2 p-1.5 shadow-pop">
              <li><button className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-side-ink hover:bg-white/10" onClick={() => { setOpen(false); router.push('/'); }}><Icon name="home" /> <span className="flex-1 text-left">Home</span>{!current && <Check className="h-4 w-4 text-side-accent" aria-hidden />}</button></li>
              {products.map((p) => (
                <li key={p.slug}>
                  <button className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-side-ink hover:bg-white/10" onClick={() => { setOpen(false); router.push(`/p/${p.slug}`); }}>
                    <Icon name={p.icon} /> <span className="flex-1 text-left">{p.name}</span> <HealthDot health={p.health} />
                    {current?.slug === p.slug && <Check className="h-4 w-4 text-side-accent" aria-hidden />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <nav className="thin-scroll flex-1 overflow-auto px-3 pb-3" aria-label="Primary">
        <div className={sideLabel}>{current ? current.name : 'Navigation'}</div>
        {current ? current.nav.map((n) => {
          const href = n.path ? `/p/${current.slug}/${n.path}` : `/p/${current.slug}`;
          const active = n.path ? path === href || path.startsWith(href + '/') : path === href;
          return (
            <Link key={n.path} href={href} aria-current={active ? 'page' : undefined} className={navClass(active)}>
              <ActiveBar show={active} /><Icon name={n.icon} className="h-[18px] w-[18px]" /> {n.label}
            </Link>
          );
        }) : (
          <p className="px-3 py-1.5 text-xs text-side-muted">Pick a product above to see its pages.</p>
        )}

        <div className={sideLabel}>Workspace</div>
        <Link href="/audit" className={navClass(path.startsWith('/audit'))}><ActiveBar show={path.startsWith('/audit')} /><Icon name="audit" className="h-[18px] w-[18px]" /> Audit log</Link>
        {showAdmins && <Link href="/admins" className={navClass(path.startsWith('/admins'))}><ActiveBar show={path.startsWith('/admins')} /><Icon name="admins" className="h-[18px] w-[18px]" /> Admins</Link>}
        <Link href="/settings" className={navClass(path.startsWith('/settings'))}><ActiveBar show={path.startsWith('/settings')} /><Icon name="settings" className="h-[18px] w-[18px]" /> Settings</Link>
      </nav>

      <div className="m-3 flex items-center gap-3 rounded-xl border border-side-line bg-white/5 p-3">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-side-active text-[15px] font-semibold text-side-accent">
          {initial}<span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-side-bg bg-side-accent" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold text-white">{user.name}</div>
          <div className="mt-1"><RoleTag role={user.role} onDark /></div>
        </div>
        <form action={signOutAction}>
          <button className="flex h-8 w-8 items-center justify-center rounded-lg text-side-muted transition-colors hover:bg-white/10 hover:text-white" aria-label="Sign out" title="Sign out"><LogOut className="h-4 w-4" /></button>
        </form>
      </div>
    </aside>
  );
}

/** Title on the left, trail on the right, like the reference header strip. */
export function Crumbs({ products }: { products: ShellProduct[] }) {
  const path = usePathname();
  const trail: { label: string; href?: string }[] = [{ label: 'Home', href: '/' }];
  const m = path.match(/^\/p\/([^/]+)(?:\/(.*))?$/);
  if (m) {
    const p = products.find((x) => x.slug === m[1]);
    trail.push({ label: p?.name ?? m[1]!, href: `/p/${m[1]}` });
    const rest = (m[2] ?? '').split('/').filter(Boolean);
    if (rest[0]) {
      const item = p?.nav.find((n) => n.path === rest[0]);
      trail.push({ label: item?.label ?? rest[0], href: rest.length > 1 ? `/p/${m[1]}/${rest[0]}` : undefined });
      if (rest.length > 1) trail.push({ label: 'Details' });
    } else trail.push({ label: 'Overview' });
  } else if (path !== '/') {
    const names: Record<string, string> = { '/audit': 'Audit log', '/admins': 'Admins', '/settings': 'Settings' };
    trail.push({ label: names['/' + path.split('/')[1]] ?? 'Page' });
  }
  const title = trail.at(-1)!.label;
  return (
    <div className="flex h-11 shrink-0 items-center justify-between border-b border-line bg-subtle px-8">
      <span className="text-[12px] font-semibold uppercase tracking-wider">{title}</span>
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-muted">
        {trail.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3 w-3" aria-hidden />}
            {c.href && i < trail.length - 1 ? <Link href={c.href} className="font-medium text-accent hover:underline">{c.label}</Link> : <span className={i === trail.length - 1 ? 'text-ink' : ''}>{c.label}</span>}
          </span>
        ))}
      </nav>
    </div>
  );
}

type Hit = { type: string; label: string; sub?: string; href: string };

export function Topbar({ products, email, name, theme, role }: { products: ShellProduct[]; email: string; name: string | null; theme: 'system' | 'light' | 'dark'; role: string }) {
  const router = useRouter();
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useOutsideClose(menu, () => setMenu(false));
  const display = name ?? email.split('@')[0] ?? email;
  const initial = display.trim().charAt(0).toUpperCase();

  // Global shortcuts: Cmd/Ctrl+K, "?", and "g then <letter>".
  useEffect(() => {
    let chord = 0;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.matches('input, textarea, select, [contenteditable]');
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '?') { setHelp(true); return; }
      if (e.key === 'g') { chord = Date.now(); return; }
      if (chord && Date.now() - chord < 1200) {
        chord = 0;
        const slug = location.pathname.match(/^\/p\/([^/]+)/)?.[1] ?? products[0]?.slug;
        const hit = products.find((p) => p.slug === slug)?.nav.find((n) => n.shortcut === e.key);
        if (hit && slug) router.push(hit.path ? `/p/${slug}/${hit.path}` : `/p/${slug}`);
        else if (e.key === 'a') router.push('/audit');
        else if (e.key === 'h') router.push('/');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [products, router]);

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-line bg-surface px-8">
      <button className="flex h-10 w-[440px] items-center gap-3 rounded-full border border-line bg-subtle px-4 text-muted transition-colors hover:border-accent" onClick={() => setPalette(true)}>
        <Search className="h-4 w-4 text-accent" aria-hidden /> <span className="flex-1 text-left">Search servers, customers, payments…</span>
        <kbd className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] font-medium">Ctrl K</kbd>
      </button>
      <div className="flex items-center gap-2">
        <button className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-subtle text-muted transition-colors hover:text-ink" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => setHelp(true)}><Keyboard className="h-[18px] w-[18px]" /></button>
        <ThemeToggle theme={theme} />
        <div className="relative ml-1" ref={menuRef}>
          <button className="flex items-center gap-2.5 rounded-full border border-line bg-subtle py-1 pl-1 pr-3 transition-colors hover:border-accent" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-ink">{initial}</span>
            <span className="flex items-center gap-2 text-left"><span className="text-[13px] font-medium leading-tight">{display}</span><RoleTag role={role} /></span>
          </button>
          {menu && (
            <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-30 w-72 rounded-xl border border-line bg-raised p-1.5 shadow-pop">
              <div className="px-3 py-2"><div className="flex items-center gap-2 font-medium">{display} <RoleTag role={role} /></div><div className="text-xs text-muted">{email}</div></div>
              <Link href="/settings" className="flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-subtle" onClick={() => setMenu(false)}><UserPen className="h-4 w-4 text-muted" aria-hidden /> Edit nickname</Link>
              <div className="mx-1 my-1 flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-xs text-success"><ShieldCheck className="h-4 w-4" aria-hidden /> Two-factor verified for this session</div>
              <form action={signOutAction}><button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-subtle"><LogOut className="h-4 w-4 text-muted" aria-hidden /> Sign out</button></form>
              <form action={signOutEverywhereAction}><button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-danger hover:bg-subtle"><LogOut className="h-4 w-4" aria-hidden /> Sign out everywhere</button></form>
            </div>
          )}
        </div>
      </div>
      {palette && <Palette products={products} onClose={() => setPalette(false)} />}
      {help && <ShortcutSheet products={products} onClose={() => setHelp(false)} />}
    </header>
  );
}

function ThemeToggle({ theme }: { theme: 'system' | 'light' | 'dark' }) {
  const [t, setT] = useState(theme);
  const [, start] = useTransition();
  const order = ['system', 'light', 'dark'] as const;
  const Ico = t === 'light' ? Sun : t === 'dark' ? Moon : Monitor;
  return (
    <button className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-subtle text-muted transition-colors hover:text-ink" aria-label={`Theme: ${t}. Click to change`} title={`Theme: ${t}`} onClick={() => {
      const next = order[(order.indexOf(t) + 1) % 3]!;
      setT(next);
      if (next === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = next;
      start(() => setTheme(next));
    }}><Ico className="h-[18px] w-[18px]" /></button>
  );
}

function Palette({ products, onClose }: { products: ShellProduct[]; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const quick: Hit[] = [
    { type: 'General', label: 'Home', href: '/' }, { type: 'General', label: 'Audit log', href: '/audit' },
    ...products.flatMap((p) => [{ type: 'Product', label: `Open ${p.name}`, href: `/p/${p.slug}` },
      ...p.nav.filter((n) => n.path).map((n) => ({ type: p.name, label: n.label, href: `/p/${p.slug}/${n.path}` }))]),
  ];
  const shown = q.trim().length < 2 ? quick.slice(0, 10) : [...quick.filter((h) => h.label.toLowerCase().includes(q.toLowerCase())), ...hits];

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const ctl = new AbortController();
    const id = setTimeout(async () => {
      try {
        // POST so search terms (possibly emails/IDs) never appear in URLs or logs.
        const res = await fetch('/api/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q }), signal: ctl.signal });
        if (res.ok) setHits(((await res.json()) as { hits: Hit[] }).hits);
      } catch { /* aborted */ }
    }, 200);
    return () => { clearTimeout(id); ctl.abort(); };
  }, [q]);

  const go = (h?: Hit) => { if (h) { onClose(); router.push(h.href); } };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24" onMouseDown={onClose}>
      <div role="dialog" aria-label="Command palette" className="w-[560px] overflow-hidden rounded-xl border border-line bg-raised shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <input ref={input} className="h-11 w-full border-b border-line bg-transparent px-4 outline-none" placeholder="Jump to a product, server, customer or payment…"
          value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, shown.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            if (e.key === 'Enter') go(shown[sel]);
          }} />
        <ul className="max-h-80 overflow-auto p-1">
          {shown.length === 0 && <li className="px-3 py-6 text-center text-muted">No matches</li>}
          {shown.map((h, i) => (
            <li key={h.href + h.label + i}>
              <button className={clsx('flex w-full items-center justify-between rounded px-3 py-2 text-left', i === sel && 'bg-accent-soft')} onMouseEnter={() => setSel(i)} onClick={() => go(h)}>
                <span>{h.label}{h.sub && <span className="ml-2 text-xs text-muted">{h.sub}</span>}</span>
                <span className="text-xs text-muted">{h.type}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ShortcutSheet({ products, onClose }: { products: ShellProduct[]; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  const rows: [string, string][] = [['Ctrl/⌘ K', 'Command palette'], ['?', 'This sheet'], ['g then h', 'Home'], ['g then a', 'Audit log'], ['↑ ↓', 'Move between table rows']];
  for (const n of products[0]?.nav ?? []) if (n.shortcut) rows.push([`g then ${n.shortcut}`, n.label]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onMouseDown={onClose}>
      <div role="dialog" aria-label="Keyboard shortcuts" className="w-96 rounded-xl border border-line bg-raised p-6 shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="mb-3 font-semibold">Keyboard shortcuts</h3>
        <dl className="space-y-2">{rows.map(([k, d]) => <div key={k} className="flex justify-between"><dt className="text-muted">{d}</dt><dd><kbd className="rounded border border-line px-1.5 text-xs">{k}</kbd></dd></div>)}</dl>
      </div>
    </div>
  );
}
