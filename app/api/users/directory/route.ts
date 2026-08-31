import { NextResponse } from 'next/server';
import { listUsers } from '@/lib/auth';
import { requireApiUser, unauthorized } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const current = await requireApiUser();
  if (!current) return unauthorized();
  return NextResponse.json({ users: listUsers().map((user) => ({ id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl })) });
}
