import { NextResponse } from 'next/server';
import { handleApiError, jsonError, requireApiUser, unauthorized } from '@/lib/api';
import { getBranding, updateBranding } from '@/lib/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ branding: getBranding() }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: Request) {
  try {
    const current = await requireApiUser();
    if (!current) return unauthorized();
    if (current.role !== 'superadmin') return jsonError('Bu işlem için superadmin yetkisi gerekiyor.', 403);
    const body = await request.json() as { appName?: unknown };
    if (typeof body.appName !== 'string') return jsonError('Uygulama adı gereklidir.', 400);
    const appName = body.appName.trim();
    if (appName.length < 1 || appName.length > 40) return jsonError('Uygulama adı 1–40 karakter olmalıdır.', 422);
    return NextResponse.json({ branding: updateBranding({ appName }) });
  } catch (error) {
    return handleApiError(error);
  }
}
