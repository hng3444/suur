import { NextResponse } from 'next/server';
import { handleApiError, jsonError, requireApiUser, unauthorized } from '@/lib/api';
import { importBackup, importJson, importMarkdown } from '@/lib/portable';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorized();
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return jsonError('Choose a backup, JSON, or Markdown file.', 400);
    const maxBytes = 256 * 1024 * 1024;
    if (file.size < 1 || file.size > maxBytes) return jsonError('The import file may be at most 256 MB.', 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.zip')) return NextResponse.json(await importBackup(bytes, user.id, user.storageQuotaMb));
    if (lower.endsWith('.json')) return NextResponse.json({ imported: importJson(bytes, user.id), attachments: 0 });
    if (lower.endsWith('.md') || lower.endsWith('.markdown')) return NextResponse.json({ imported: importMarkdown(bytes, file.name, user.id), attachments: 0 });
    return jsonError('Only ZIP, JSON, MD, and Markdown files are supported.', 415);
  } catch (error) {
    return handleApiError(error);
  }
}
