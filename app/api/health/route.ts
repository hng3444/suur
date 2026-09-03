import { NextResponse } from 'next/server';
import packageJson from '@/package.json';
import { getDb } from '@/lib/db';
import { MOBILE_API_VERSION } from '@/lib/server-info';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  try {
    getDb().prepare('SELECT 1').get();
    return NextResponse.json({ status: 'ok', service: 'suur', version: packageJson.version, apiVersion: MOBILE_API_VERSION });
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 503 });
  }
}
