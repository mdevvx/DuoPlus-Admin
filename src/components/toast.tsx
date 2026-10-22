'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

type Toast = { id: number; ok: boolean; text: string };
const Ctx = createContext<(ok: boolean, text: string) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((ok: boolean, text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, ok, text }]);
    setTimeout(() => dismiss(id), ok ? 4000 : 7000); // problems stay a little longer
  }, [dismiss]);
  return (
    <Ctx.Provider value={push}>
      {children}
      {/* Top right, above the sheets and dialogs, surface background with a theme-blue left edge. Failures keep a red icon. */}
      <div className="pointer-events-none fixed right-5 top-5 z-[100] flex w-96 max-w-[calc(100vw-2.5rem)] flex-col gap-2.5" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role={t.ok ? undefined : 'alert'}
            className="toast-in pointer-events-auto flex items-start gap-3 rounded-xl border-l-4 border-accent bg-surface p-3.5 font-medium text-ink shadow-pop">
            {t.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden />}
            <span className="min-w-0 flex-1 break-words">{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
