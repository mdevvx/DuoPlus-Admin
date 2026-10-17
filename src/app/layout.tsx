import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { COOKIE } from '@/lib/session-policy';

export const metadata: Metadata = { icons: { icon: '/icon.svg' }, title: { default: 'DuoPlus Admin', template: '%s · DuoPlus Admin' }, robots: { index: false, follow: false } };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const t = (await cookies()).get(COOKIE.theme)?.value;
  const theme = t === 'light' || t === 'dark' ? t : undefined; // undefined = follow the OS
  return (
    <html lang="en" data-theme={theme} suppressHydrationWarning>
      <body className="min-h-screen font-sans" suppressHydrationWarning>
        <div className="narrow-note flex min-h-screen items-center justify-center p-8 text-center text-muted">
          DuoPlus Admin is built for desktop. Please open it on a screen at least 1280px wide.
        </div>
        <div className="desktop-only">{children}</div>
      </body>
    </html>
  );
}
