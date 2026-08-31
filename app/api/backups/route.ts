import { NextResponse } from 'next/server';
import { handleApiError, requireApiUser, unauthorized } from '@/lib/api';
import { createStoredBackup, listStoredBackups } from '@/lib/portable';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  return NextResponse.json({ backups: await listStoredBackups(user.id) });
}

export async function POST() {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorized();
    const name = await createStoredBackup(user.id);
    return NextResponse.json({ name }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
