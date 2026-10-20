'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus, Trash2 } from 'lucide-react';
import { updateProductBranding } from '@/app/(hub)/actions';
import { ProductMark } from './icons';
import { useToast } from './toast';

const label = 'mb-1.5 block text-[13px] font-medium';

export function BrandingForm({ slug, name, logo, icon }: { slug: string; name: string; logo?: string; icon: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | undefined>(logo);
  const [fileName, setFileName] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const router = useRouter();

  function pick(f: File | undefined) {
    if (!f) return;
    setRemoved(false);
    setFileName(f.name);
    setPreview((old) => { if (old?.startsWith('blob:')) URL.revokeObjectURL(old); return URL.createObjectURL(f); });
  }
  function clear() {
    if (file.current) file.current.value = '';
    setPreview(undefined); setFileName(null); setRemoved(true);
  }

  return (
    <form
      className="space-y-6"
      action={(fd) => {
        setError(null);
        if (removed) fd.set('removeLogo', '1');
        start(async () => {
          const res = await updateProductBranding(fd);
          if (res.ok) { toast(true, res.message); setRemoved(false); setFileName(null); router.refresh(); } else setError(res.error);
        });
      }}
    >
      <input type="hidden" name="slug" value={slug} />

      <div>
        <label className={label} htmlFor="brand-name">Product name</label>
        <input id="brand-name" className="input" name="name" defaultValue={name} minLength={2} maxLength={40} required />
        <p className="mt-2 text-muted">Shown in the sidebar, the product switcher and on the home page.</p>
      </div>

      <div>
        <span className={label}>Logo</span>
        <div className="flex items-center gap-4">
          <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-subtle text-accent">
            <ProductMark logo={preview} icon={icon} size={72} className={preview ? 'h-full w-full object-cover' : 'h-8 w-8'} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn" onClick={() => file.current?.click()}><ImagePlus className="h-4 w-4" aria-hidden /> {preview ? 'Replace logo' : 'Upload logo'}</button>
              {preview && <button type="button" className="btn text-danger" onClick={clear}><Trash2 className="h-4 w-4" aria-hidden /> Remove</button>}
              <input ref={file} className="sr-only" type="file" name="logo" accept="image/png,image/jpeg,image/webp" aria-label="Upload logo" tabIndex={-1} onChange={(e) => pick(e.target.files?.[0])} />
            </div>
            <p className="mt-2 truncate text-muted">{fileName ?? (preview ? 'Custom logo in use' : 'Using the default icon')}</p>
          </div>
        </div>
        <p className="mt-2 text-muted">PNG, JPEG or WebP, up to 150 KB. Square images look best.</p>
      </div>

      {error && <p role="alert" className="text-danger">{error}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Save branding'}</button>
    </form>
  );
}
