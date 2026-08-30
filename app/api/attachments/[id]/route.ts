import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { handleApiError, jsonError, requireApiUser, unauthorized } from '@/lib/api';
import { uploadsDirectory } from '@/lib/db';
import { deleteAttachment, getAttachmentRecord } from '@/lib/repository';
import { idParamSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorized();
    const id = idParamSchema.parse((await context.params).id);
    const record = getAttachmentRecord(id, user.id);
    if (!record) return jsonError('Görsel bulunamadı.', 404);
    const bytes = await readFile(path.join(/* turbopackIgnore: true */ uploadsDirectory(), record.stored_name));
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': record.mime_type,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_: Request, context: Context) {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorized();
    const id = idParamSchema.parse((await context.params).id);
    const record = deleteAttachment(id, user.id);
    if (!record) return jsonError('Görsel bulunamadı.', 404);
    await unlink(path.join(/* turbopackIgnore: true */ uploadsDirectory(), record.stored_name)).catch(() => undefined);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
