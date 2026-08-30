import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { findUserById } from '@/lib/auth';
import { handleApiError, jsonError, requireApiUser, unauthorized } from '@/lib/api';
import { profileUploadsDirectory } from '@/lib/db';
import { idParamSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const contentTypes: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif' };

export async function GET(_: Request, context: Context) {
  try {
    const current = await requireApiUser();
    if (!current) return unauthorized();
    const id = idParamSchema.parse((await context.params).id);
    const target = findUserById(id);
    if (!target?.avatar_stored_name) return jsonError('Profil görseli bulunamadı.', 404);
    const bytes = await readFile(path.join(/* turbopackIgnore: true */ profileUploadsDirectory(), target.avatar_stored_name));
    return new NextResponse(bytes, { headers: {
      'Content-Type': contentTypes[path.extname(target.avatar_stored_name).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    return handleApiError(error);
  }
}
