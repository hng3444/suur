import { randomUUID } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { handleApiError, jsonError, requireApiUser, unauthorized } from '@/lib/api';
import { brandingUploadsDirectory } from '@/lib/db';
import { getStoredBranding, updateBranding } from '@/lib/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const branding = getStoredBranding();
  if (!branding.iconStoredName) return NextResponse.redirect(new URL('/suuricon.png?v=20260905-fire', request.url));
  try {
    const bytes = await readFile(path.join(/* turbopackIgnore: true */ brandingUploadsDirectory(), branding.iconStoredName));
    return new NextResponse(bytes, { headers: { 'Content-Type': 'image/x-icon', 'Cache-Control': 'public, max-age=31536000, immutable' } });
  } catch {
    return jsonError('Uygulama simgesi bulunamadı.', 404);
  }
}

export async function POST(request: Request) {
  let written: string | null = null;
  try {
    const current = await requireApiUser();
    if (!current) return unauthorized();
    if (current.role !== 'superadmin') return jsonError('Bu işlem için superadmin yetkisi gerekiyor.', 403);
    const file = (await request.formData()).get('file');
    if (!(file instanceof File)) return jsonError('Bir .ico dosyası seçin.', 400);
    if (file.size < 4 || file.size > 2 * 1024 * 1024) return jsonError('Simge en fazla 2 MB olabilir.', 413);
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes[0] !== 0 || bytes[1] !== 0 || bytes[2] !== 1 || bytes[3] !== 0) return jsonError('Geçerli bir .ico dosyası seçin.', 415);
    const storedName = `${randomUUID()}.ico`;
    written = path.join(/* turbopackIgnore: true */ brandingUploadsDirectory(), storedName);
    await writeFile(written, bytes, { flag: 'wx' });
    const old = getStoredBranding().iconStoredName;
    const branding = updateBranding({ iconStoredName: storedName });
    if (old) await unlink(path.join(/* turbopackIgnore: true */ brandingUploadsDirectory(), old)).catch(() => undefined);
    return NextResponse.json({ branding });
  } catch (error) {
    if (written) await unlink(written).catch(() => undefined);
    return handleApiError(error);
  }
}

export async function DELETE() {
  try {
    const current = await requireApiUser();
    if (!current) return unauthorized();
    if (current.role !== 'superadmin') return jsonError('Bu işlem için superadmin yetkisi gerekiyor.', 403);
    const old = getStoredBranding().iconStoredName;
    const branding = updateBranding({ iconStoredName: null });
    if (old) await unlink(path.join(/* turbopackIgnore: true */ brandingUploadsDirectory(), old)).catch(() => undefined);
    return NextResponse.json({ branding });
  } catch (error) {
    return handleApiError(error);
  }
}
