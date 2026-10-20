'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateProductBranding } from '@/app/(hub)/actions';
import { ProductMark } from './icons';
import { useToast } from './toast';

export function BrandingForm({ slug, name, logo, icon }: { slug: string; name: string; logo?: string; icon: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | undefined>(logo);
  const [removed, setRemoved] = useState(false);
  const toast = useToast();
  const router = useRouter();
  return (
    <form
      className="space-y-4"
      action={(fd) => {
        setError(null);
        if (removed) fd.set('removeLogo', '1');
        start(async () => {
          const res = await updateProductBranding(fd);
          if (res.ok) { toast(true, res.message); setRemoved(false); router.refresh(); } else setError(res.error);
        });
      }}
    >
      <input type="hidden" name="slug" value={slug} />
      <div>
        <label className="mb-1.5 block text-[13px] font-medium" htmlFor="brand-name">Product name</label>
        <input id="brand-name" className="input" name="name" defaultValue={name} minLength={2} maxLength={40} required />
      </div>
      <div>
        <span className="mb-1.5 block text-[13px] font-medium">Logo</span>
        <div className="flex items-center gap-4">
          <ProductMark logo={preview} icon={icon} size={56} className="shrink-0 rounded-xl border border-line object-cover p-0" />
          <div className="space-y-2">
            <input
              className="input" type="file" name="logo" accept="image/png,image/jpeg,image/webp" aria-label="Upload logo"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setRemoved(false);
                setPreview((old) => { if (old?.startsWith('blob:')) URL.revokeObjectURL(old); return URL.createObjectURL(f); });
              }}
            />
            {preview && (
              <button type="button" className="text-xs text-danger hover:underline" onClick={() => { setPreview(undefined); setRemoved(true); }}>Remove custom logo</button>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">PNG, JPEG or WebP, up to 150 KB. Square images look best. Shown in the sidebar, product switcher and home page.</p>
      </div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Save branding'}</button>
    </form>
  );
}
