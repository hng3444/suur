import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { copyFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { handleApiError, jsonError, requireApiUser, unauthorized } from '@/lib/api';
import { uploadsDirectory } from '@/lib/db';
import { findUserById } from '@/lib/auth';
import { addAttachment, createNote, getAttachmentRecord, getNote, permanentlyDeleteNote, storageUsage } from '@/lib/repository';
import { idParamSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function POST(_: Request, context: Context) {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorized();
    const source = getNote(idParamSchema.parse((await context.params).id), user.id);
    if (!source) return jsonError('Note not found.', 404);
    const copyBytes = source.attachments.reduce((sum, attachment) => sum + attachment.size, 0);
    const quotaBytes = (findUserById(user.id)?.storage_quota_mb || 512) * 1024 * 1024;
    if (storageUsage(user.id) + copyBytes > quotaBytes) return jsonError('Notu ve dosyalarını çoğaltmak için yeterli depolama alanı yok.', 413);
    const note = createNote({
      title: `${source.title || 'Untitled note'} (copy)`, content: source.content, contentFormat: source.contentFormat,
      type: source.type, items: source.items.map((item) => ({ ...item, id: randomUUID() })), color: source.color,
      pinned: source.pinned, archived: false, reminderAt: null, labelIds: source.labels.map((label) => label.id),
    }, null, user.id);
    if (!note) return jsonError('Note could not be duplicated.', 500);
    const copiedFiles: string[] = [];
    try {
      for (const attachment of source.attachments) {
        const record = getAttachmentRecord(attachment.id, user.id);
        if (!record) continue;
        const id = randomUUID();
        const storedName = `${id}${path.extname(record.stored_name)}`;
        await copyFile(path.join(uploadsDirectory(), record.stored_name), path.join(uploadsDirectory(), storedName));
        copiedFiles.push(storedName);
        addAttachment({ id, note_id: note.id, filename: record.filename, stored_name: storedName, mime_type: record.mime_type, size: record.size });
      }
    } catch (error) {
      permanentlyDeleteNote(note.id, null, user.id);
      await Promise.all(copiedFiles.map((name) => unlink(path.join(uploadsDirectory(), name)).catch(() => undefined)));
      throw error;
    }
    return NextResponse.json({ note: getNote(note.id, user.id) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
