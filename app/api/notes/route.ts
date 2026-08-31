import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, jsonError, mutationId, requireApiUser, unauthorized } from '@/lib/api';
import { createNote, listNotes } from '@/lib/repository';
import type { NoteView } from '@/lib/types';
import { noteCreateSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const views = new Set<NoteView>(['notes', 'reminders', 'calendar', 'archive', 'trash']);

export async function GET(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  const viewParam = request.nextUrl.searchParams.get('view') || 'notes';
  if (!views.has(viewParam as NoteView)) return jsonError('Geçersiz görünüm.', 400);
  const search = request.nextUrl.searchParams.get('search')?.trim().slice(0, 200);
  const labelId = request.nextUrl.searchParams.get('label')?.trim().slice(0, 80);
  const notes = listNotes({ userId: user.id, view: viewParam as NoteView, search, labelId });
  return NextResponse.json({ notes });
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorized();
    const input = noteCreateSchema.parse(await request.json());
    const note = createNote(input, mutationId(request), user.id);
    return NextResponse.json({ note }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
