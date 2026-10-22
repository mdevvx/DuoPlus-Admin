'use client';

import { useLayoutEffect, useRef } from 'react';

/**
 * Keeps a dropdown or calendar inside the window. Popups open under their field, so one near the right edge of
 * the page would run off-screen and add a horizontal scrollbar; this nudges it back in once it is open.
 * Attach the returned ref to the popup element.
 */
export function usePopupFit<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    el.style.transform = '';
    const margin = 12;
    const r = el.getBoundingClientRect();
    const over = r.right - (document.documentElement.clientWidth - margin);
    if (over > 0) el.style.transform = `translateX(${-over}px)`;
    else if (r.left < margin) el.style.transform = `translateX(${margin - r.left}px)`;
  }, [open]);
  return ref;
}
