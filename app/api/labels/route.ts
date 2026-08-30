import { NextResponse } from 'next/server';
import { handleApiError, requireApiUser, unauthorized } from '@/lib/api';
import { createLabel, listLabels } from '@/lib/repository';
import { labelCreateSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  return NextResponse.json({ labels: listLabels(user.id) });
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorized();
    const label = createLabel(labelCreateSchema.parse(await request.json()), user.id);
    return NextResponse.json({ label }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
