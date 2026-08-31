import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, unauthorized, jsonError } from '@/lib/api';
import { createBackupBytes, exportJson, exportTextArchive } from '@/lib/portable';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  const format = request.nextUrl.searchParams.get('format') || 'backup';
  const timestamp = new Date().toISOString().slice(0, 10);
  if (format === 'json') return new NextResponse(exportJson(user.id), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="suur-export-${timestamp}.json"`, 'Cache-Control': 'no-store' } });
  if (format === 'markdown' || format === 'txt') return new NextResponse(exportTextArchive(user.id, format), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="suur-${format}-${timestamp}.zip"`, 'Cache-Control': 'no-store' } });
  if (format === 'backup') return new NextResponse(await createBackupBytes(user.id), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="suur-backup-${timestamp}.zip"`, 'Cache-Control': 'no-store' } });
  return jsonError('Unsupported export format.', 400);
}
