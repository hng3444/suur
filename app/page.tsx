import type { Metadata } from 'next';
import { SuurApp } from '@/components/suur-app';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getBranding, getSettings } from '@/lib/repository';
import { translate } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const user = await getCurrentUser();
  const branding = getBranding();
  const locale = user ? getSettings(user.id).locale : 'en';
  return { title: `${translate(locale, 'nav.notes')} · ${branding.appName}` };
}

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return <SuurApp initialUser={user} initialBranding={getBranding()} />;
}
