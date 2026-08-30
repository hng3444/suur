import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { findUserById, updateUser } from '@/lib/auth';
import { handleApiError, jsonError, requireApiUser, unauthorized } from '@/lib/api';
import { profileUploadsDirectory } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const extensions: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/avif': '.avif',
};

export async function POST(request: Request) {
  let written: string | null = null;
  try {
    const current = await requireApiUser();
    if (!current) return unauthorized();
    const file = (await request.formData()).get('file');
    if (!(file instanceof File)) return jsonError('Bir profil görseli seçin.', 400);
    const extension = extensions[file.type];
    if (!extension) return jsonError('JPEG, PNG, WebP veya AVIF görseli seçin.', 415);
    if (file.size < 1 || file.size > 5 * 1024 * 1024) return jsonError('Profil görseli en fazla 5 MB olabilir.', 413);
    const storedName = `${current.id}-${randomUUID()}${extension}`;
    written = path.join(/* turbopackIgnore: true */ profileUploadsDirectory(), storedName);
    await writeFile(written, Buffer.from(await file.arrayBuffer()), { flag: 'wx' });
    const old = findUserById(current.id)?.avatar_stored_name;
    const user = updateUser(current.id, { avatarStoredName: storedName });
    if (old) await unlink(path.join(/* turbopackIgnore: true */ profileUploadsDirectory(), old)).catch(() => undefined);
    return NextResponse.json({ user });
  } catch (error) {
    if (written) await unlink(written).catch(() => undefined);
    return handleApiError(error);
  }
}

export async function DELETE() {
  try {
    const current = await requireApiUser();
    if (!current) return unauthorized();
    const old = findUserById(current.id)?.avatar_stored_name;
    const user = updateUser(current.id, { avatarStoredName: null });
    if (old) await unlink(path.join(/* turbopackIgnore: true */ profileUploadsDirectory(), old)).catch(() => undefined);
    return NextResponse.json({ user });
  } catch (error) {
    return handleApiError(error);
  }
}
