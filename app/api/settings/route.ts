import { NextResponse } from 'next/server';
import { handleApiError, mutationId, requireApiUser, unauthorized } from '@/lib/api';
import { getSettings, updateSettings } from '@/lib/repository';
import { settingsSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  return NextResponse.json({ settings: getSettings(user.id) });
}

export async function PATCH(request: Request) {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorized();
    const settings = updateSettings(settingsSchema.parse(await request.json()), user.id, mutationId(request));
    const response = NextResponse.json({ settings });
    response.cookies.set('suur_locale', settings.locale, {
      path: '/',
      maxAge: 365 * 24 * 60 * 60,
      sameSite: 'lax',
      secure: (process.env.SUUR_PUBLIC_URL || request.url).startsWith('https://'),
    });
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
