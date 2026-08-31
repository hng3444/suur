import { NextResponse } from 'next/server';
import { handleApiError, jsonError, requireApiUser, unauthorized } from '@/lib/api';
import { listNoteHistory, restoreNoteVersion } from '@/lib/repository';
import { idParamSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  const id = idParamSchema.safeParse((await context.params).id);
  if (!id.success) return jsonError('Invalid note ID.', 400);
  const history = listNoteHistory(id.data, user.id);
  return history ? NextResponse.json({ history }) : jsonError('Note not found.', 404);
}

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorized();
    const noteId = idParamSchema.parse((await context.params).id);
    const historyId = idParamSchema.parse((await request.json() as { historyId?: string }).historyId);
    const note = restoreNoteVersion(noteId, historyId, user.id);
    return note ? NextResponse.json({ note }) : jsonError('History entry not found.', 404);
  } catch (error) {
    return handleApiError(error);
  }
}
