import { SuurApp } from '@/components/suur-app';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getBranding } from '@/lib/repository';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return <SuurApp initialUser={user} initialBranding={getBranding()} />;
}
