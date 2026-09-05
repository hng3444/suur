import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { getDb, uploadsDirectory } from '@/lib/db';
import { addAttachment, createLabel, createNote, listLabels } from '@/lib/repository';
import type { NoteColor } from '@/lib/types';

interface KeepNote {
  title?: unknown;
  textContent?: unknown;
  listContent?: Array<{ text?: unknown; isChecked?: unknown }>;
  labels?: Array<{ name?: unknown }>;
  color?: unknown;
  isPinned?: unknown;
  isArchived?: unknown;
  isTrashed?: unknown;
  createdTimestampUsec?: unknown;
  userEditedTimestampUsec?: unknown;
  attachments?: Array<{ filePath?: unknown; mimetype?: unknown }>;
}

const colorMap: Record<string, NoteColor> = {
  DEFAULT: 'default', RED: 'rose', ORANGE: 'sand', YELLOW: 'sand', GREEN: 'mint',
  TEAL: 'sage', BLUE: 'sky', CERULEAN: 'sky', PURPLE: 'lavender', PINK: 'rose', BROWN: 'sand', GRAY: 'default',
};

const imageTypes: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif',
};

function normalizeZipPath(value: string) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function timestampFromMicroseconds(value: unknown) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const milliseconds = Number(value) / 1000;
  return Number.isFinite(milliseconds) && milliseconds > 0
    ? { milliseconds, iso: new Date(milliseconds).toISOString() }
    : null;
}

export async function importGoogleKeep(file: File, userId: string) {
  if (file.size < 1 || file.size > 100 * 1024 * 1024) throw new Error('Takeout dosyası en fazla 100 MB olabilir.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries: Record<string, Uint8Array> = {};

  if (file.name.toLowerCase().endsWith('.zip') || file.type.includes('zip')) {
    let entryCount = 0;
    let expandedBytes = 0;
    Object.assign(entries, unzipSync(bytes, { filter: (entry) => {
      entryCount += 1;
      expandedBytes += entry.originalSize;
      if (entryCount > 10_000 || expandedBytes > 250 * 1024 * 1024 || entry.originalSize > 25 * 1024 * 1024) {
        throw new Error('Takeout arşivi güvenli boyut sınırlarını aşıyor.');
      }
      const extension = path.extname(entry.name).toLowerCase();
      return extension === '.json' || Boolean(imageTypes[extension]);
    } }));
  } else if (file.name.toLowerCase().endsWith('.json') || file.type === 'application/json') {
    entries[file.name] = bytes;
  } else throw new Error('Google Keep Takeout ZIP veya JSON dosyası seçin.');

  const labelByName = new Map(listLabels(userId).map((label) => [label.name.toLocaleLowerCase('tr'), label]));
  const normalizedEntries = new Map(Object.entries(entries).map(([name, data]) => [normalizeZipPath(name), data]));
  let imported = 0;
  let skipped = 0;
  let images = 0;

  for (const [entryName, jsonBytes] of normalizedEntries) {
    if (!entryName.toLowerCase().endsWith('.json')) continue;
    const fingerprint = createHash('sha256').update(jsonBytes).digest('hex');
    if (getDb().prepare('SELECT 1 FROM imported_items WHERE user_id = ? AND fingerprint = ?').get(userId, fingerprint)) {
      skipped += 1;
      continue;
    }

    try {
      const source = JSON.parse(strFromU8(jsonBytes)) as KeepNote;
      const labelIds: string[] = [];
      for (const item of Array.isArray(source.labels) ? source.labels : []) {
        const name = typeof item.name === 'string' ? item.name.trim().slice(0, 80) : '';
        if (!name) continue;
        const key = name.toLocaleLowerCase('tr');
        let label = labelByName.get(key);
        if (!label) {
          try { label = createLabel({ name, color: '#3f5efb' }, userId) || undefined; } catch { label = undefined; }
          if (label) labelByName.set(key, label);
        }
        if (label) labelIds.push(label.id);
      }

      const checklist = Array.isArray(source.listContent);
      const edited = timestampFromMicroseconds(source.userEditedTimestampUsec);
      const created = timestampFromMicroseconds(source.createdTimestampUsec) || edited;
      const note = createNote({
        title: typeof source.title === 'string' ? source.title.slice(0, 500) : '',
        content: typeof source.textContent === 'string' ? source.textContent.slice(0, 100_000) : '',
        type: checklist ? 'checklist' : 'text',
        items: checklist ? source.listContent!.slice(0, 500).map((item) => ({
          id: randomUUID(), text: typeof item.text === 'string' ? item.text.slice(0, 10_000) : '', checked: Boolean(item.isChecked),
        })) : [],
        color: colorMap[String(source.color || 'DEFAULT').toUpperCase()] || 'default',
        pinned: Boolean(source.isPinned), archived: Boolean(source.isArchived),
        trashedAt: source.isTrashed ? new Date().toISOString() : null,
        position: edited ? -Math.trunc(edited.milliseconds) : undefined,
        labelIds,
        createdAt: created?.iso,
        updatedAt: edited?.iso || created?.iso,
      }, `keep-${fingerprint}`, userId);
      if (!note) { skipped += 1; continue; }

      for (const attachment of Array.isArray(source.attachments) ? source.attachments : []) {
        if (typeof attachment.filePath !== 'string') continue;
        const wanted = normalizeZipPath(attachment.filePath);
        const match = normalizedEntries.get(wanted) || [...normalizedEntries.entries()].find(([name]) => name.endsWith(`/${wanted}`))?.[1];
        const extension = path.extname(wanted).toLowerCase();
        if (!match || !imageTypes[extension] || match.byteLength > 25 * 1024 * 1024) continue;
        const id = randomUUID();
        const storedName = `${id}${extension}`;
        await writeFile(path.join(/* turbopackIgnore: true */ uploadsDirectory(), storedName), Buffer.from(match), { flag: 'wx' });
        addAttachment({ id, note_id: note.id, filename: path.basename(wanted).slice(0, 180), stored_name: storedName, mime_type: imageTypes[extension], size: match.byteLength });
        images += 1;
      }

      getDb().prepare('INSERT INTO imported_items (user_id, fingerprint, created_at) VALUES (?, ?, ?)').run(userId, fingerprint, new Date().toISOString());
      imported += 1;
    } catch {
      skipped += 1;
    }
  }

  return { imported, skipped, images, labels: labelByName.size };
}
