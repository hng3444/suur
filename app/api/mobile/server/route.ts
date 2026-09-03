import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api';
import { getMobileServerInfo } from '@/lib/server-info';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  try {
    return NextResponse.json(getMobileServerInfo(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

