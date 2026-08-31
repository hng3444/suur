import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { dataDirectory, uploadsDirectory } from '@/lib/db';
import {
  addAttachment,
  createLabel,
  createNote,
  getSettings,
  listAllOwnedNotes,
  listLabels,
  listOwnedAttachmentRecords,
  permanentlyDeleteNote,
  storageUsage,
  updateSettings,
} from '@/lib/repository';
import type { Label, Note, NoteColor } from '@/lib/types';
import { attachmentExtension, normalizedAttachmentMime } from '@/lib/attachment-policy';
import { settingsSchema } from '@/lib/validation';

const BACKUP_FORMAT = 'suur-backup';
const EXPORT_FORMAT = 'suur-export';

interface PortableManifest {
  format: typeof BACKUP_FORMAT | typeof EXPORT_FORMAT;
  version: 1;
  exportedAt: string;
  labels: Label[];
  notes: Note[];
  settings?: ReturnType<typeof getSettings>;
  files?: Array<{ attachmentId: string; noteId: string; filename: string; mimeType: string; size: number; path: string }>;
}

type PortableFile = NonNullable<PortableManifest['files']>[number];

function safeName(value: string, fallback: string) {
  return value.normalize('NFKC').replace(/[^\p{L}\p{N}._ -]/gu, '_').replace(/\s+/g, ' ').slice(0, 100) || fallback;
}

function extensionFor(record: { filename: string; mime_type?: string; mimeType?: string }) {
  return attachmentExtension(record.mime_type || record.mimeType);
}

function manifestFor(userId: string, format: PortableManifest['format']): PortableManifest {
  return {
    format,
    version: 1,
    exportedAt: new Date().toISOString(),
    labels: listLabels(userId),
    notes: listAllOwnedNotes(userId),
    settings: getSettings(userId),
  };
}

export function exportJson(userId: string) {
  return Buffer.from(JSON.stringify(manifestFor(userId, EXPORT_FORMAT), null, 2));
}

function noteText(note: Note, markdown: boolean) {
  const title = note.title || 'Untitled note';
  const content = note.type === 'checklist'
    ? note.items.map((item) => `${markdown ? `- [${item.checked ? 'x' : ' '}]` : item.checked ? '[x]' : '[ ]'} ${item.text}`).join('\n')
    : note.content;
  const labels = note.labels.length ? `\n\n${markdown ? '**Labels:**' : 'Labels:'} ${note.labels.map((label) => label.name).join(', ')}` : '';
  const reminder = note.reminderAt ? `\n${markdown ? '**Reminder:**' : 'Reminder:'} ${note.reminderAt}` : '';
  return markdown ? `# ${title}\n\n${content}${labels}${reminder}\n` : `${title}\n${'='.repeat(Math.min(title.length, 70))}\n\n${content}${labels}${reminder}\n`;
}

export function exportTextArchive(userId: string, format: 'markdown' | 'txt') {
  const files: Record<string, Uint8Array> = {};
  for (const note of listAllOwnedNotes(userId)) {
    const extension = format === 'markdown' ? 'md' : 'txt';
    const filename = `${safeName(note.title, 'untitled')}-${note.id.slice(0, 8)}.${extension}`;
    files[filename] = strToU8(noteText(note, format === 'markdown'));
  }
  if (!Object.keys(files).length) files[`README.${format === 'markdown' ? 'md' : 'txt'}`] = strToU8('No notes were found.\n');
  return Buffer.from(zipSync(files, { level: 6 }));
}

export async function createBackupBytes(userId: string) {
  const manifest = manifestFor(userId, BACKUP_FORMAT);
  const files: Record<string, Uint8Array> = {};
  const records = listOwnedAttachmentRecords(userId);
  manifest.files = [];
  for (const record of records) {
    const archivePath = `attachments/${record.id}${extensionFor(record)}`;
    try {
      files[archivePath] = new Uint8Array(await readFile(path.join(/* turbopackIgnore: true */ uploadsDirectory(), record.stored_name)));
      manifest.files.push({ attachmentId: record.id, noteId: record.note_id, filename: record.filename, mimeType: record.mime_type, size: record.size, path: archivePath });
    } catch {
      // Keep the backup usable even when one orphaned database record exists.
    }
  }
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  return Buffer.from(zipSync(files, { level: 6 }));
}

function normalizeImportedNotes(value: unknown): { labels: Label[]; notes: Note[] } {
  const source = Array.isArray(value) ? { notes: value } : value as Record<string, unknown>;
  if (!source || !Array.isArray(source.notes)) throw new Error('JSON file does not contain a notes array.');
  const labels = (Array.isArray(source.labels) ? source.labels : []).slice(0, 5_000).flatMap((raw, index) => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Partial<Label>;
    const name = String(item.name || '').trim().slice(0, 80);
    if (!name) return [];
    const timestamp = new Date().toISOString();
    return [{
      id: String(item.id || `label-${index}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || `label-${index}`,
      name,
      color: typeof item.color === 'string' && /^#[0-9a-f]{6}$/i.test(item.color) ? item.color : '#198754',
      createdAt: typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt)) ? item.createdAt : timestamp,
      updatedAt: typeof item.updatedAt === 'string' && Number.isFinite(Date.parse(item.updatedAt)) ? item.updatedAt : timestamp,
    }];
  });
  const now = new Date().toISOString();
  const colors = new Set<NoteColor>(['default', 'mint', 'sage', 'sand', 'rose', 'sky', 'lavender']);
  const normalizedDate = (date: unknown) => typeof date === 'string' && Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : null;
  const notes = source.notes.slice(0, 50_000).map((raw, index) => {
    const item = (raw && typeof raw === 'object' ? raw : {}) as Partial<Note> & { text?: string };
    const color = colors.has(item.color as NoteColor) ? item.color as NoteColor : 'default';
    const createdAt = normalizedDate(item.createdAt) || now;
    const updatedAt = normalizedDate(item.updatedAt) || createdAt;
    return {
      id: String(item.id || `import-${index}`), ownerId: '', assignedUserId: null,
      title: String(item.title || '').slice(0, 500), content: String(item.content ?? item.text ?? '').slice(0, 100_000),
      contentFormat: item.contentFormat === 'markdown' ? 'markdown' as const : 'plain' as const,
      type: item.type === 'checklist' ? 'checklist' as const : 'text' as const,
      items: Array.isArray(item.items) ? item.items.slice(0, 500).map((entry) => ({ id: randomUUID(), text: String(entry.text || '').slice(0, 10_000), checked: Boolean(entry.checked) })) : [],
      color, pinned: Boolean(item.pinned), archived: Boolean(item.archived), trashedAt: normalizedDate(item.trashedAt), reminderAt: normalizedDate(item.reminderAt),
      position: Number.isFinite(item.position) ? Number(item.position) : index * 1024, version: 1, createdAt, updatedAt,
      labels: Array.isArray(item.labels) ? item.labels.flatMap((label) => label && typeof label === 'object' ? [{ id: String(label.id || '').slice(0, 80), name: String(label.name || '').slice(0, 80), color: '#198754', createdAt: now, updatedAt: now }] : []) : [], attachments: [],
    } satisfies Note;
  });
  return { labels, notes };
}

function importNotes(data: { labels: Label[]; notes: Note[] }, userId: string) {
  const labelByName = new Map(listLabels(userId).map((label) => [label.name.toLocaleLowerCase(), label]));
  const sourceLabelNames = new Map(data.labels.map((label) => [label.id, label.name]));
  for (const label of data.labels) {
    const key = label.name.toLocaleLowerCase();
    if (!labelByName.has(key)) {
      const created = createLabel({ name: label.name.slice(0, 80), color: /^#[0-9a-f]{6}$/i.test(label.color) ? label.color : '#198754' }, userId);
      labelByName.set(key, created);
    }
  }
  const noteMap = new Map<string, string>();
  const createdNoteIds: string[] = [];
  let imported = 0;
  try {
    for (const note of data.notes) {
      const labelIds = note.labels.map((label) => labelByName.get((sourceLabelNames.get(label.id) || label.name).toLocaleLowerCase())?.id).filter((id): id is string => Boolean(id));
      const created = createNote({
        title: note.title, content: note.content, contentFormat: note.contentFormat, type: note.type, items: note.items,
        color: note.color, pinned: note.pinned, archived: note.archived, trashedAt: note.trashedAt, reminderAt: note.reminderAt,
        position: note.position, labelIds, createdAt: note.createdAt, updatedAt: note.updatedAt,
      }, null, userId);
      if (created) { noteMap.set(note.id, created.id); createdNoteIds.push(created.id); imported += 1; }
    }
  } catch (error) {
    for (const noteId of createdNoteIds) permanentlyDeleteNote(noteId, null, userId);
    throw error;
  }
  return { imported, noteMap, createdNoteIds };
}

export function importJson(bytes: Uint8Array, userId: string) {
  const value = JSON.parse(strFromU8(bytes));
  return importNotes(normalizeImportedNotes(value), userId).imported;
}

export function importMarkdown(bytes: Uint8Array, filename: string, userId: string) {
  const text = strFromU8(bytes).slice(0, 100_000);
  const lines = text.split(/\r?\n/);
  const heading = lines.find((line) => /^#\s+/.test(line));
  const title = heading ? heading.replace(/^#\s+/, '').trim() : path.basename(filename, path.extname(filename));
  const content = heading ? lines.filter((line) => line !== heading).join('\n').trim() : text;
  createNote({ title: title.slice(0, 500), content, contentFormat: 'markdown' }, null, userId);
  return 1;
}

export async function importBackup(bytes: Uint8Array, userId: string, quotaMb: number) {
  const mebibyte = 1024 * 1024;
  const maxExpandedBytes = Math.min(256 * mebibyte, Math.max(10 * mebibyte, quotaMb * mebibyte + 5 * mebibyte));
  let expandedBytes = 0;
  let fileCount = 0;
  const archive = unzipSync(bytes, {
    filter: (file) => {
      const allowed = file.name === 'manifest.json'
        || (file.name.startsWith('attachments/') && !file.name.includes('..') && !file.name.includes('\\'));
      if (!allowed) return false;
      fileCount += 1;
      expandedBytes += file.originalSize;
      if (fileCount > 10_001 || file.originalSize > 25 * mebibyte || expandedBytes > maxExpandedBytes) {
        throw new Error('The backup expands beyond the safe import limit.');
      }
      return true;
    },
  });
  const manifestBytes = archive['manifest.json'];
  if (!manifestBytes) throw new Error('Backup manifest is missing.');
  const raw = JSON.parse(strFromU8(manifestBytes)) as PortableManifest;
  if (raw.format !== BACKUP_FORMAT || raw.version !== 1) throw new Error('Unsupported Suur backup format.');
  const data = normalizeImportedNotes(raw);
  const portableFiles: PortableFile[] = (Array.isArray(raw.files) ? raw.files : []).flatMap((file) => {
    if (!file || typeof file !== 'object') return [];
    const entry = file as Partial<PortableFile>;
    if (typeof entry.path !== 'string' || !entry.path.startsWith('attachments/') || entry.path.includes('..') || entry.path.includes('\\')) return [];
    if (typeof entry.noteId !== 'string') return [];
    return [{
      attachmentId: String(entry.attachmentId || ''),
      noteId: entry.noteId,
      filename: String(entry.filename || ''),
      mimeType: normalizedAttachmentMime(entry.mimeType),
      size: Number(entry.size) || 0,
      path: entry.path,
    }];
  });
  const attachmentBytes = portableFiles.reduce((sum, file) => sum + (archive[file.path]?.byteLength || 0), 0);
  if (storageUsage(userId) + attachmentBytes > quotaMb * 1024 * 1024) throw new Error('The backup exceeds this user’s storage quota.');
  const { imported, noteMap, createdNoteIds } = importNotes(data, userId);
  const writtenFiles: string[] = [];
  let attachments = 0;
  try {
    for (const file of portableFiles) {
      const content = archive[file.path];
      const noteId = noteMap.get(String(file.noteId || ''));
      if (!content || !noteId) continue;
      const mimeType = normalizedAttachmentMime(file.mimeType);
      const extension = attachmentExtension(mimeType);
      const id = randomUUID();
      const storedName = `${id}${extension}`;
      await writeFile(path.join(/* turbopackIgnore: true */ uploadsDirectory(), storedName), content, { flag: 'wx' });
      writtenFiles.push(storedName);
      addAttachment({ id, note_id: noteId, filename: safeName(String(file.filename || ''), `attachment${extension}`), stored_name: storedName, mime_type: mimeType, size: content.byteLength });
      attachments += 1;
    }
    const parsedSettings = settingsSchema.safeParse(raw.settings);
    if (parsedSettings.success) updateSettings(parsedSettings.data, userId);
    return { imported, attachments };
  } catch (error) {
    for (const noteId of createdNoteIds) permanentlyDeleteNote(noteId, null, userId);
    await Promise.all(writtenFiles.map((name) => unlink(path.join(/* turbopackIgnore: true */ uploadsDirectory(), name)).catch(() => undefined)));
    throw error;
  }
}

function backupDirectory(userId: string) {
  return path.join(/* turbopackIgnore: true */ dataDirectory(), 'backups', userId);
}

export async function createStoredBackup(userId: string) {
  const directory = backupDirectory(userId);
  await mkdir(directory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `suur-backup-${timestamp}.zip`;
  await writeFile(path.join(directory, filename), await createBackupBytes(userId), { flag: 'wx' });
  const entries = (await readdir(directory)).filter((name) => /^suur-backup-[\w-]+\.zip$/.test(name)).sort().reverse();
  await Promise.all(entries.slice(14).map((name) => unlink(path.join(directory, name)).catch(() => undefined)));
  return filename;
}

export async function listStoredBackups(userId: string) {
  const directory = backupDirectory(userId);
  await mkdir(directory, { recursive: true });
  const names = (await readdir(directory)).filter((name) => /^suur-backup-[\w-]+\.zip$/.test(name)).sort().reverse();
  return Promise.all(names.map(async (name) => { const info = await stat(path.join(directory, name)); return { name, size: info.size, createdAt: info.mtime.toISOString() }; }));
}

export function storedBackupPath(userId: string, filename: string) {
  if (!/^suur-backup-[\w-]+\.zip$/.test(filename)) return null;
  return path.join(/* turbopackIgnore: true */ backupDirectory(userId), filename);
}

export async function automaticBackupDue(userId: string) {
  const settings = getSettings(userId);
  if (settings.backupFrequency === 'off') return false;
  const backups = await listStoredBackups(userId);
  const interval = settings.backupFrequency === 'daily' ? 86_400_000 : 604_800_000;
  return !backups[0] || Date.now() - new Date(backups[0].createdAt).getTime() >= interval;
}
