import { Card } from './ui';
import { BrandingForm } from './branding-form';
import { hubDb } from '@/lib/supabase-server';
import { can, type Role } from '@/lib/roles';

/** Settings card to change a product's name and logo. Renders nothing for roles without the permission. */
export async function BrandingCard({ slug, role, manifest }: { slug: string; role: Role; manifest: { name: string; icon: string; logo?: string } }) {
  if (!can(role, 'product.branding')) return null;
  const { data } = await hubDb().from('hub_products').select('name,logo').eq('slug', slug).single();
  return (
    <Card title="Branding">
      <BrandingForm slug={slug} name={data?.name ?? manifest.name} logo={data?.logo ?? manifest.logo} icon={manifest.icon} />
    </Card>
  );
}
