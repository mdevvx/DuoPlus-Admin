import clsx from 'clsx';
import { X } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

/** One header for every dialog and side sheet: icon tile, vertically centred title, close button. */
export function ModalHeader({ icon: Icon, title, description, tone = 'accent', onClose, closeDisabled }: {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  title: ReactNode; description?: string; tone?: 'accent' | 'danger' | 'warning'; onClose: () => void; closeDisabled?: boolean;
}) {
  return (
    <header className="flex items-center gap-3.5 border-b border-line px-5 py-4 text-left">
      <span className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', { accent: 'bg-accent-soft text-accent', danger: 'bg-danger-soft text-danger', warning: 'bg-warning-soft text-warning' }[tone])}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-base font-semibold leading-snug">{title}</h3>
        {description && <p className="mt-0.5 text-[13px] leading-snug text-muted">{description}</p>}
      </div>
      <button type="button" disabled={closeDisabled} aria-label="Close" onClick={onClose}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-subtle hover:text-ink disabled:opacity-50"><X className="h-4 w-4" /></button>
    </header>
  );
}
