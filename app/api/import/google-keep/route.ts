import { NextResponse } from 'next/server';
import { handleApiError, jsonError, requireApiUser, unauthorized } from '@/lib/api';
import { importGoogleKeep } from '@/lib/google-keep';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const current = await requireApiUser();
    if (!current) return unauthorized();
    const file = (await request.formData()).get('file');
    if (!(file instanceof File)) return jsonError('Takeout ZIP veya JSON dosyasını seçin.', 400);
    const result = await importGoogleKeep(file, current.id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Takeout')) return jsonError(error.message, 413);
    if (error instanceof Error && error.message.startsWith('Google Keep')) return jsonError(error.message, 415);
    return handleApiError(error);
  }
}
