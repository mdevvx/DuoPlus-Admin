'use client';

import { useState } from 'react';

/** Workspace logo, or its first letter when there is none or the image does not load (for example a host the panel's CSP blocks). */
export function WorkspaceMark({ name, logoUrl, size = 32, round }: { name: string; logoUrl: string | null; size?: number; round?: boolean }) {
  const [broken, setBroken] = useState(false);
  const letter = (name.trim().charAt(0) || '?').toUpperCase();
  const box = { width: size, height: size };
  if (logoUrl && !broken && /^https:\/\//i.test(logoUrl)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} style={box} className={`shrink-0 border border-line bg-surface object-cover ${round ? 'rounded-full' : 'rounded-lg'}`} />;
  }
  return <span aria-hidden style={box} className={`flex shrink-0 items-center justify-center bg-accent-soft text-sm font-semibold text-accent ${round ? 'rounded-full' : 'rounded-lg'}`}>{letter}</span>;
}

/** Approximate swatches for the accent ids; a #rrggbb colour is shown as it is. */
const ACCENTS: Record<string, [string, string]> = {
  donexel: ['Donexel', '#5b6cf0'], gold: ['Gold', '#c9a227'], indigo: ['Indigo', '#4f46e5'], teal: ['Teal', '#2a9d8f'], rose: ['Rose', '#e11d48'], slate: ['Slate', '#64748b'],
};
/** A workspace's colour palette: a dot and its name. Nothing is shown for the default look. */
export function BrandSwatch({ color }: { color: string | null }) {
  if (!color) return null;
  const known = ACCENTS[color.toLowerCase()];
  const hex = known?.[1] ?? (/^#[0-9a-f]{6}$/i.test(color) ? color : null);
  if (!hex) return null;
  return <span className="inline-flex items-center gap-1.5 text-xs text-muted"><span aria-hidden className="h-2.5 w-2.5 rounded-full border border-line" style={{ background: hex }} />{known?.[0] ?? hex.toLowerCase()}</span>;
}
