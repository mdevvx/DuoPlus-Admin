import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { currentTheme } from '@/lib/theme';

// Stack: Plus Jakarta Sans (latin, then latin-ext), Noto Sans Arabic, ui-sans-serif, sans-serif.
// Separate families per subset so the browser falls back glyph by glyph.
const sans = localFont({ src: './fonts/PlusJakartaSans.woff2', weight: '400 800', variable: '--font-sans', display: 'swap' });
const sansExt = localFont({ src: './fonts/PlusJakartaSans-latin-ext.woff2', weight: '400 800', variable: '--font-sans-ext', display: 'swap' });
const arabic = localFont({ src: './fonts/NotoSansArabic.woff2', weight: '400 700', variable: '--font-arabic', display: 'swap' });

export const metadata: Metadata = { title: { default: 'DuoPlus Admin', template: '%s · DuoPlus Admin' }, robots: { index: false, follow: false } };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await currentTheme(); // light by default; "system" follows the OS
  return (
    <html lang="en" data-theme={theme} className={`${sans.variable} ${sansExt.variable} ${arabic.variable}`} suppressHydrationWarning>
      <body className="min-h-screen font-sans" suppressHydrationWarning>
        <div className="narrow-note flex min-h-screen items-center justify-center p-8 text-center text-muted">
          DuoPlus Admin is built for desktop. Please open it on a screen at least 1280px wide.
        </div>
        <div className="desktop-only">{children}</div>
      </body>
    </html>
  );
}
