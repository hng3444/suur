import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/login-form';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/');
  return <LoginForm />;
}
