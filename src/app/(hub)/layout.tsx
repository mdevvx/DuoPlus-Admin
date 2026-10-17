import { requirePage } from '@/lib/auth';
import { currentTheme } from '@/lib/theme';
import { accessibleProducts, productHealth, visibleNav } from '@/products/registry';
import { Crumbs, Sidebar, Topbar, type ShellProduct } from '@/components/shell';
import { ToastProvider } from '@/components/toast';
import { TableKeys } from '@/components/small-client';

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const { admin } = await requirePage();
  const products = await accessibleProducts(admin);
  const shell: ShellProduct[] = await Promise.all(
    products.map(async (p) => ({
      slug: p.slug, name: p.name, icon: p.icon, logo: p.logo, health: await productHealth(p.slug),
      nav: visibleNav(p).map(({ label, path, icon, shortcut }) => ({ label, path, icon, shortcut })),
    })),
  );
  return (
    <ToastProvider>
      <div className="flex h-screen">
        <Sidebar products={shell} user={{ name: admin.displayName ?? admin.email.split('@')[0] ?? admin.email, email: admin.email, role: admin.role }} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar products={shell} email={admin.email} name={admin.displayName} theme={await currentTheme()} role={admin.role} showAdmins={admin.role === 'owner'} />
          <Crumbs products={shell} />
          <main className="flex-1 overflow-auto"><div className="mx-auto w-full max-w-[1360px] px-8 py-8">{children}</div></main>
        </div>
      </div>
      <TableKeys />
    </ToastProvider>
  );
}
