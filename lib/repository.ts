import 'server-only';
import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';
import type { AppSettings, Attachment, ChecklistItem, Label, Note, NoteView } from '@/lib/types';

interface NoteRow {
  id: string;
  user_id: string;
  title: string;
  content: string;
  type: 'text' | 'checklist';
  items_json: string;
  color: Note['color'];
  pinned: number;
  archived: number;
  trashed_at: string | null;
  reminder_at: string | null;
  position: number;
  version: number;
  created_at: string;
  updated_at: string;
}

interface LabelRow {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

interface AttachmentRow {
  id: string;
  note_id: string;
  filename: string;
  stored_name: string;
  mime_type: string;
  size: number;
  created_at: string;
}

export interface NoteInput {
  id?: string;
  title?: string;
  content?: string;
  type?: 'text' | 'checklist';
  items?: ChecklistItem[];
  color?: Note['color'];
  pinned?: boolean;
  archived?: boolean;
  trashedAt?: string | null;
  reminderAt?: string | null;
  position?: number;
  labelIds?: string[];
  baseVersion?: number;
}

const defaultSettings: AppSettings = {
  theme: 'system',
  view: 'grid',
  sidebarCollapsed: false,
};

function now() {
  return new Date().toISOString();
}

function toLabel(row: LabelRow): Label {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    noteId: row.note_id,
    filename: row.filename,
    mimeType: row.mime_type,
    size: row.size,
    createdAt: row.created_at,
    url: `/api/attachments/${row.id}`,
  };
}

function parseItems(value: string): ChecklistItem[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hydrateNote(row: NoteRow): Note {
  const database = getDb();
  const labels = database.prepare(`
    SELECT labels.* FROM labels
    JOIN note_labels ON note_labels.label_id = labels.id
    WHERE note_labels.note_id = ? ORDER BY labels.name COLLATE NOCASE
  `).all(row.id) as LabelRow[];
  const attachments = database.prepare(
    'SELECT * FROM attachments WHERE note_id = ? ORDER BY created_at',
  ).all(row.id) as AttachmentRow[];

  return {
    id: row.id,
    title: row.title,
    content: row.content,
    type: row.type,
    items: parseItems(row.items_json),
    color: row.color,
    pinned: Boolean(row.pinned),
    archived: Boolean(row.archived),
    trashedAt: row.trashed_at,
    reminderAt: row.reminder_at,
    position: row.position,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    labels: labels.map(toLabel),
    attachments: attachments.map(toAttachment),
  };
}

export function getNote(id: string, userId: string) {
  const row = getDb().prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(id, userId) as NoteRow | undefined;
  return row ? hydrateNote(row) : null;
}

export function listNotes(options: { userId: string; view: NoteView; search?: string; labelId?: string }) {
  const conditions: string[] = ['notes.user_id = ?'];
  const values: string[] = [options.userId];

  if (options.view === 'trash') conditions.push('notes.trashed_at IS NOT NULL');
  else {
    conditions.push('notes.trashed_at IS NULL');
    if (options.view === 'archive') conditions.push('notes.archived = 1');
    else conditions.push('notes.archived = 0');
    if (options.view === 'reminders') conditions.push('notes.reminder_at IS NOT NULL');
  }

  if (options.search) {
    conditions.push(`(
      notes.title LIKE ? ESCAPE '\\' OR notes.content LIKE ? ESCAPE '\\' OR
      notes.items_json LIKE ? ESCAPE '\\'
    )`);
    const escaped = options.search.replace(/[\\%_]/g, '\\$&');
    values.push(`%${escaped}%`, `%${escaped}%`, `%${escaped}%`);
  }

  if (options.labelId) {
    conditions.push('EXISTS (SELECT 1 FROM note_labels WHERE note_labels.note_id = notes.id AND note_labels.label_id = ?)');
    values.push(options.labelId);
  }

  const rows = getDb().prepare(`
    SELECT notes.* FROM notes
    WHERE ${conditions.join(' AND ')}
    ORDER BY notes.pinned DESC, notes.position ASC, notes.updated_at DESC
  `).all(...values) as NoteRow[];
  return rows.map(hydrateNote);
}

function setNoteLabels(noteId: string, labelIds: string[], userId: string) {
  const database = getDb();
  database.prepare('DELETE FROM note_labels WHERE note_id = ?').run(noteId);
  const insert = database.prepare('INSERT INTO note_labels (note_id, label_id) VALUES (?, ?)');
  const owned = database.prepare('SELECT 1 FROM labels WHERE id = ? AND user_id = ?');
  for (const labelId of [...new Set(labelIds)]) {
    if (owned.get(labelId, userId)) insert.run(noteId, labelId);
  }
}

export function hasMutation(id: string | null) {
  if (!id) return false;
  return Boolean(getDb().prepare('SELECT 1 FROM mutations WHERE id = ?').get(id));
}

export function recordMutation(id: string | null, entityId: string, action: string) {
  if (!id) return;
  getDb().prepare(
    'INSERT OR IGNORE INTO mutations (id, entity_id, action, created_at) VALUES (?, ?, ?, ?)',
  ).run(id, entityId, action, now());
}

export function createNote(input: NoteInput, mutation: string | null, userId: string) {
  const database = getDb();
  const id = input.id || randomUUID();

  if (hasMutation(mutation)) return getNote(id, userId);
  const existing = getNote(id, userId);
  if (existing) return existing;

  const transaction = database.transaction(() => {
    const timestamp = now();
    const position = input.position ?? (database.prepare(
      'SELECT COALESCE(MIN(position), 1024) - 1024 AS position FROM notes WHERE user_id = ? AND trashed_at IS NULL',
    ).get(userId) as { position: number }).position;

    database.prepare(`
      INSERT INTO notes (
        id, user_id, title, content, type, items_json, color, pinned, archived,
        trashed_at, reminder_at, position, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      id,
      userId,
      input.title ?? '',
      input.content ?? '',
      input.type ?? 'text',
      JSON.stringify(input.items ?? []),
      input.color ?? 'default',
      input.pinned ? 1 : 0,
      input.archived ? 1 : 0,
      input.trashedAt ?? null,
      input.reminderAt ?? null,
      position,
      timestamp,
      timestamp,
    );
    setNoteLabels(id, input.labelIds ?? [], userId);
    recordMutation(mutation, id, 'create');
  });
  transaction();
  return getNote(id, userId);
}

export function updateNote(id: string, input: NoteInput, mutation: string | null, userId: string) {
  const database = getDb();
  const current = getNote(id, userId);
  if (!current) return { status: 'missing' as const, note: null };
  if (hasMutation(mutation)) return { status: 'ok' as const, note: current };
  if (input.baseVersion && input.baseVersion !== current.version) {
    return { status: 'conflict' as const, note: current };
  }

  const transaction = database.transaction(() => {
    const assignments: string[] = [];
    const values: unknown[] = [];
    const mappings: Array<[keyof NoteInput, string, (value: unknown) => unknown]> = [
      ['title', 'title', (value) => value],
      ['content', 'content', (value) => value],
      ['type', 'type', (value) => value],
      ['items', 'items_json', (value) => JSON.stringify(value)],
      ['color', 'color', (value) => value],
      ['pinned', 'pinned', (value) => value ? 1 : 0],
      ['archived', 'archived', (value) => value ? 1 : 0],
      ['trashedAt', 'trashed_at', (value) => value],
      ['reminderAt', 'reminder_at', (value) => value],
      ['position', 'position', (value) => value],
    ];

    for (const [key, column, transform] of mappings) {
      if (input[key] !== undefined) {
        assignments.push(`${column} = ?`);
        values.push(transform(input[key]));
      }
    }

    if (input.labelIds !== undefined) setNoteLabels(id, input.labelIds, userId);
    assignments.push('version = version + 1', 'updated_at = ?');
    values.push(now(), id, userId);
    database.prepare(`UPDATE notes SET ${assignments.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
    recordMutation(mutation, id, 'update');
  });
  transaction();
  return { status: 'ok' as const, note: getNote(id, userId) };
}

export function permanentlyDeleteNote(id: string, mutation: string | null, userId: string) {
  const database = getDb();
  if (hasMutation(mutation)) return { deleted: true, storedNames: [] as string[] };
  const storedNames = (database.prepare(`
    SELECT attachments.stored_name FROM attachments JOIN notes ON notes.id = attachments.note_id
    WHERE attachments.note_id = ? AND notes.user_id = ?
  `).all(id, userId) as Array<{ stored_name: string }>).map(
    (row) => row.stored_name,
  );
  const transaction = database.transaction(() => {
    const result = database.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(id, userId);
    recordMutation(mutation, id, 'delete');
    return result.changes > 0;
  });
  return { deleted: transaction(), storedNames };
}

export function reorderNotes(positions: Array<{ id: string; position: number }>, mutation: string | null, userId: string) {
  if (hasMutation(mutation)) return;
  const database = getDb();
  const statement = database.prepare(
    'UPDATE notes SET position = ?, version = version + 1, updated_at = ? WHERE id = ? AND user_id = ?',
  );
  database.transaction(() => {
    const timestamp = now();
    for (const item of positions) statement.run(item.position, timestamp, item.id, userId);
    recordMutation(mutation, positions[0].id, 'reorder');
  })();
}

export function listLabels(userId: string) {
  return (getDb().prepare('SELECT * FROM labels WHERE user_id = ? ORDER BY name COLLATE NOCASE').all(userId) as LabelRow[]).map(toLabel);
}

export function createLabel(input: { name: string; color: string }, userId: string) {
  const id = randomUUID();
  const timestamp = now();
  getDb().prepare(
    'INSERT INTO labels (id, user_id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, userId, input.name, input.color, timestamp, timestamp);
  return toLabel(getDb().prepare('SELECT * FROM labels WHERE id = ?').get(id) as LabelRow);
}

export function updateLabel(id: string, input: { name?: string; color?: string }, userId: string) {
  const assignments: string[] = [];
  const values: unknown[] = [];
  if (input.name !== undefined) { assignments.push('name = ?'); values.push(input.name); }
  if (input.color !== undefined) { assignments.push('color = ?'); values.push(input.color); }
  assignments.push('updated_at = ?');
  values.push(now(), id, userId);
  const result = getDb().prepare(`UPDATE labels SET ${assignments.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
  if (!result.changes) return null;
  return toLabel(getDb().prepare('SELECT * FROM labels WHERE id = ?').get(id) as LabelRow);
}

export function deleteLabel(id: string, userId: string) {
  return getDb().prepare('DELETE FROM labels WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
}

export function getSettings(userId: string): AppSettings {
  const rows = getDb().prepare('SELECT key, value_json FROM user_settings WHERE user_id = ?').all(userId) as Array<{ key: keyof AppSettings; value_json: string }>;
  const settings = { ...defaultSettings };
  for (const row of rows) {
    try { Object.assign(settings, { [row.key]: JSON.parse(row.value_json) }); } catch { /* Keep safe default. */ }
  }
  return settings;
}

export function updateSettings(input: Partial<AppSettings>, userId: string) {
  const database = getDb();
  const statement = database.prepare(`
    INSERT INTO user_settings (user_id, key, value_json, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
  `);
  database.transaction(() => {
    const timestamp = now();
    for (const [key, value] of Object.entries(input)) statement.run(userId, key, JSON.stringify(value), timestamp);
  })();
  return getSettings(userId);
}

export function addAttachment(input: Omit<AttachmentRow, 'created_at'>) {
  const timestamp = now();
  getDb().prepare(`
    INSERT INTO attachments (id, note_id, filename, stored_name, mime_type, size, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(input.id, input.note_id, input.filename, input.stored_name, input.mime_type, input.size, timestamp);
  return toAttachment(getDb().prepare('SELECT * FROM attachments WHERE id = ?').get(input.id) as AttachmentRow);
}

export function getAttachmentRecord(id: string, userId: string) {
  return getDb().prepare(`
    SELECT attachments.* FROM attachments JOIN notes ON notes.id = attachments.note_id
    WHERE attachments.id = ? AND notes.user_id = ?
  `).get(id, userId) as AttachmentRow | undefined;
}

export function deleteAttachment(id: string, userId: string) {
  const record = getAttachmentRecord(id, userId);
  if (!record) return null;
  getDb().prepare('DELETE FROM attachments WHERE id = ?').run(id);
  return record;
}
