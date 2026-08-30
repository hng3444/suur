import { NextResponse } from 'next/server';
import { handleApiError, mutationId, requireApiUser, unauthorized } from '@/lib/api';
import { reorderNotes } from '@/lib/repository';
import { reorderSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorized();
    const input = reorderSchema.parse(await request.json());
    reorderNotes(input.positions, mutationId(request), user.id);
    return NextResponse.json({ updated: true });
  } catch (error) {
    return handleApiError(error);
  }
}
