import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { handleApiError, jsonError, mutationId, requireApiUser, unauthorized } from '@/lib/api';
import { uploadsDirectory } from '@/lib/db';
import { getNote, permanentlyDeleteNote, updateNote } from '@/lib/repository';
import { idParamSchema, noteUpdateSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  const id = idParamSchema.safeParse((await context.params).id);
  if (!id.success) return jsonError('Geçersiz not kimliği.', 400);
  const note = getNote(id.data, user.id);
  return note ? NextResponse.json({ note }) : jsonError('Not bulunamadı.', 404);
}

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorized();
    const id = idParamSchema.parse((await context.params).id);
    const input = noteUpdateSchema.parse(await request.json());
    const result = updateNote(id, input, mutationId(request), user.id);
    if (result.status === 'missing') return jsonError('Not bulunamadı.', 404);
    if (result.status === 'conflict') {
      return NextResponse.json(
        { error: 'Not başka bir yerde değiştirildi.', code: 'VERSION_CONFLICT', note: result.note },
        { status: 409 },
      );
    }
    return NextResponse.json({ note: result.note });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorized();
    const id = idParamSchema.parse((await context.params).id);
    const result = permanentlyDeleteNote(id, mutationId(request), user.id);
    if (!result.deleted) return jsonError('Not bulunamadı.', 404);
    await Promise.all(result.storedNames.map((name) => unlink(path.join(/* turbopackIgnore: true */ uploadsDirectory(), name)).catch(() => undefined)));
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
