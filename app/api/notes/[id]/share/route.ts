import { NextResponse } from 'next/server';
import { handleApiError, jsonError, requireApiUser, unauthorized } from '@/lib/api';
import { createNoteShare, deleteNoteShare } from '@/lib/repository';
import { idParamSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function POST(_: Request, context: Context) {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorized();
    const token = createNoteShare(idParamSchema.parse((await context.params).id), user.id);
    if (!token) return jsonError('Note not found.', 404);
    const publicUrl = process.env.SUUR_PUBLIC_URL || 'http://localhost:3000';
    return NextResponse.json({ url: new URL(`/s/${token}`, publicUrl).toString() });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_: Request, context: Context) {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  const id = idParamSchema.safeParse((await context.params).id);
  if (!id.success) return jsonError('Invalid note ID.', 400);
  return NextResponse.json({ deleted: deleteNoteShare(id.data, user.id) });
}
