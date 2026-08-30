import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { unauthorized } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  return user ? NextResponse.json({ user }) : unauthorized();
}
