import { NextResponse } from 'next/server';
import { createUser, listUsers } from '@/lib/auth';
import { handleApiError, jsonError, requireApiUser, unauthorized } from '@/lib/api';
import { userCreateSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const current = await requireApiUser();
  if (!current) return unauthorized();
  if (current.role !== 'superadmin') return jsonError('Bu işlem için superadmin yetkisi gerekiyor.', 403);
  return NextResponse.json({ users: listUsers() });
}

export async function POST(request: Request) {
  try {
    const current = await requireApiUser();
    if (!current) return unauthorized();
    if (current.role !== 'superadmin') return jsonError('Bu işlem için superadmin yetkisi gerekiyor.', 403);
    const user = createUser(userCreateSchema.parse(await request.json()));
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
