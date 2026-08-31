import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { handleApiError, jsonError, requireApiUser, unauthorized } from '@/lib/api';
import { storedBackupPath } from '@/lib/portable';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ name: string }> };

export async function GET(_: Request, context: Context) {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorized();
    const name = (await context.params).name;
    const filePath = storedBackupPath(user.id, name);
    if (!filePath) return jsonError('Invalid backup name.', 400);
    const bytes = await readFile(filePath);
    return new NextResponse(bytes, { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleApiError(error);
  }
}
