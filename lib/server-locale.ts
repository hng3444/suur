import 'server-only';
import { cookies, headers } from 'next/headers';
import { getCurrentUser } from '@/lib/auth';
import { normalizeLocale } from '@/lib/i18n';
import { getSettings } from '@/lib/repository';
import type { Locale } from '@/lib/types';

const LOCALE_COOKIE = 'suur_locale';

export async function getRequestLocale(): Promise<Locale> {
  const user = await getCurrentUser();
  if (user) return getSettings(user.id).locale;
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (stored) return normalizeLocale(stored);
  return normalizeLocale((await headers()).get('accept-language'));
}
