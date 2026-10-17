'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateNickname } from '@/app/(hub)/actions';
import { useToast } from './toast';

export function NicknameForm({ current, placeholder }: { current: string; placeholder: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  return (
    <form
      className="flex items-start gap-3"
      action={(fd) => {
        setError(null);
        start(async () => {
          const res = await updateNickname(fd);
          if (res.ok) { toast(true, res.message); router.refresh(); } else setError(res.error);
        });
      }}
    >
      <div className="flex-1">
        <input className="input" name="nickname" defaultValue={current} placeholder={placeholder} minLength={2} maxLength={30} required autoComplete="nickname" aria-label="Nickname" />
        {error && <p role="alert" className="mt-1.5 text-danger">{error}</p>}
      </div>
      <button className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Save nickname'}</button>
    </form>
  );
}
