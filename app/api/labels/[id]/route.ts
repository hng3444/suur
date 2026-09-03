import { NextResponse } from 'next/server';
import { handleApiError, jsonError, mutationId, requireApiUser, unauthorized } from '@/lib/api';
import { deleteLabel, updateLabel } from '@/lib/repository';
import { idParamSchema, labelUpdateSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorized();
    const id = idParamSchema.parse((await context.params).id);
    const label = updateLabel(id, labelUpdateSchema.parse(await request.json()), user.id, mutationId(request));
    return label ? NextResponse.json({ label }) : jsonError('Etiket bulunamadı.', 404);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorized();
    const id = idParamSchema.parse((await context.params).id);
    return deleteLabel(id, user.id, mutationId(request)) ? NextResponse.json({ deleted: true }) : jsonError('Etiket bulunamadı.', 404);
  } catch (error) {
    return handleApiError(error);
  }
}
