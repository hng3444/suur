import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { attachmentResponseHeaders } from '@/lib/attachment-policy';
import { uploadsDirectory } from '@/lib/db';
import { getSharedAttachmentRecord } from '@/lib/repository';
import { idParamSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ token: string; id: string }> };

export async function GET(_: Request, context: Context) {
  const { token, id: rawId } = await context.params;
  const id = idParamSchema.safeParse(rawId);
  if (!id.success || token.length < 20 || token.length > 128) return new NextResponse('Not found', { status: 404 });
  const record = getSharedAttachmentRecord(token, id.data);
  if (!record) return new NextResponse('Not found', { status: 404 });
  try {
    const bytes = await readFile(path.join(uploadsDirectory(), record.stored_name));
    return new NextResponse(bytes, { headers: {
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'private, max-age=3600',
      ...attachmentResponseHeaders(record.mime_type, record.filename),
    } });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}

