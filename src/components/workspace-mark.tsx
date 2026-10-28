'use client';

import { useState } from 'react';

/** Workspace logo, or its first letter when there is none or the image does not load (for example a host the panel's CSP blocks). */
export function WorkspaceMark({ name, logoUrl, size = 32 }: { name: string; logoUrl: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const letter = (name.trim().charAt(0) || '?').toUpperCase();
  const box = { width: size, height: size };
  if (logoUrl && !broken && /^https:\/\//i.test(logoUrl)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} style={box} className="shrink-0 rounded-lg border border-line bg-surface object-cover" />;
  }
  return <span aria-hidden style={box} className="flex shrink-0 items-center justify-center rounded-lg bg-accent-soft text-sm font-semibold text-accent">{letter}</span>;
}
