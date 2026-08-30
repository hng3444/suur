import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { handleApiError, jsonError, requireApiUser, unauthorized } from '@/lib/api';
import { uploadsDirectory } from '@/lib/db';
import { addAttachment, getNote } from '@/lib/repository';
import { idParamSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const mimeExtensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
};

export async function POST(request: Request, context: Context) {
  let storedPath: string | null = null;
  try {
    const user = await requireApiUser();
    if (!user) return unauthorized();
    const noteId = idParamSchema.parse((await context.params).id);
    if (!getNote(noteId, user.id)) return jsonError('Not bulunamadı.', 404);

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return jsonError('Bir görsel seçin.', 400);
    const extension = mimeExtensions[file.type];
    if (!extension) return jsonError('Yalnızca JPEG, PNG, GIF, WebP ve AVIF görselleri desteklenir.', 415);
    const maxBytes = Number(process.env.MAX_UPLOAD_MB || 10) * 1024 * 1024;
    if (file.size < 1 || file.size > maxBytes) return jsonError(`Görsel en fazla ${process.env.MAX_UPLOAD_MB || 10} MB olabilir.`, 413);

    const id = randomUUID();
    const storedName = `${id}${extension}`;
    storedPath = path.join(/* turbopackIgnore: true */ uploadsDirectory(), storedName);
    await writeFile(storedPath, Buffer.from(await file.arrayBuffer()), { flag: 'wx' });
    const filename = path.basename(file.name).replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 180) || `gorsel${extension}`;
    const attachment = addAttachment({
      id,
      note_id: noteId,
      filename,
      stored_name: storedName,
      mime_type: file.type,
      size: file.size,
    });
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    if (storedPath) await unlink(storedPath).catch(() => undefined);
    return handleApiError(error);
  }
}
