import { NextResponse } from 'next/server';
import { handleApiError, requireApiUser, unauthorized } from '@/lib/api';
import { runMaintenanceForUser } from '@/lib/maintenance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorized();
    return NextResponse.json(await runMaintenanceForUser(user.id));
  } catch (error) {
    return handleApiError(error);
  }
}
