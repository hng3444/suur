import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  await destroySession();
  return NextResponse.json({ signedOut: true });
}
