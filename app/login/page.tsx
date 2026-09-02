import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/login-form';
import { getCurrentUser } from '@/lib/auth';
import { getBranding } from '@/lib/repository';
import { translate } from '@/lib/i18n';
import { getRequestLocale } from '@/lib/server-locale';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const branding = getBranding();
  const locale = await getRequestLocale();
  return { title: `${translate(locale, 'page.login')} · ${branding.appName}` };
}

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/');
  return <LoginForm branding={getBranding()} />;
}
