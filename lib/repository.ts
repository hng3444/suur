import 'server-only';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';
import type { AppSettings, Attachment, BrandingSettings, ChecklistItem, Label, Note, NoteView } from '@/lib/types';

interface NoteRow {
  id: string;
  user_id: string;
  assigned_user_id: string | null;
  title: string;
  content: string;
  content_format: 'plain' | 'markdown';
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

export interface AttachmentRow {
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
  contentFormat?: 'plain' | 'markdown';
  type?: 'text' | 'checklist';
  items?: ChecklistItem[];
  color?: Note['color'];
  pinned?: boolean;
  archived?: boolean;
  trashedAt?: string | null;
  reminderAt?: string | null;
  position?: number;
  labelIds?: string[];
  assignedUserId?: string | null;
  baseVersion?: number;
  createdAt?: string;
  updatedAt?: string;
}

const defaultSettings: AppSettings = {
  theme: 'system',
  view: 'grid',
  sortOrder: 'manual',
  backgroundTone: 'neutral',
  sidebarCollapsed: false,
  locale: 'tr',
  accent: 'forest',
  notificationsEnabled: false,
  backupFrequency: 'off',
  trashRetentionDays: 30,
  completedItemsBottom: true,
};

const defaultBranding: BrandingSettings = {
  appName: 'Suur',
  hasCustomIcon: false,
  iconVersion: 'default',
};

interface StoredBranding extends BrandingSettings {
  iconStoredName: string | null;
}

function now() {
  return new Date().toISOString();
}

function boundedEnvironmentNumber(name: string, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, Math.trunc(parsed))) : fallback;
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

function hydrateRows(rows: NoteRow[]): Note[] {
  if (!rows.length) return [];
  const database = getDb();
  const labelsByNote = new Map<string, Label[]>();
  const attachmentsByNote = new Map<string, Attachment[]>();
  for (let offset = 0; offset < rows.length; offset += 400) {
    const ids = rows.slice(offset, offset + 400).map((row) => row.id);
    const placeholders = ids.map(() => '?').join(', ');
    const linkedLabels = database.prepare(`
      SELECT note_labels.note_id AS linked_note_id, labels.* FROM labels
      JOIN note_labels ON note_labels.label_id = labels.id
      WHERE note_labels.note_id IN (${placeholders})
      ORDER BY labels.name COLLATE NOCASE
    `).all(...ids) as Array<LabelRow & { linked_note_id: string }>;
    for (const label of linkedLabels) labelsByNote.set(label.linked_note_id, [...(labelsByNote.get(label.linked_note_id) || []), toLabel(label)]);
    const attachments = database.prepare(`SELECT * FROM attachments WHERE note_id IN (${placeholders}) ORDER BY created_at`).all(...ids) as AttachmentRow[];
    for (const attachment of attachments) attachmentsByNote.set(attachment.note_id, [...(attachmentsByNote.get(attachment.note_id) || []), toAttachment(attachment)]);
  }

  return rows.map((row) => ({
    id: row.id,
    ownerId: row.user_id,
    assignedUserId: row.assigned_user_id,
    title: row.title,
    content: row.content,
    contentFormat: row.content_format || 'plain',
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
    labels: labelsByNote.get(row.id) || [],
    attachments: attachmentsByNote.get(row.id) || [],
  }));
}

function hydrateNote(row: NoteRow): Note {
  return hydrateRows([row])[0];
}

export function getNote(id: string, userId: string) {
  const row = getDb().prepare('SELECT * FROM notes WHERE id = ? AND (user_id = ? OR assigned_user_id = ?)').get(id, userId, userId) as NoteRow | undefined;
  return row ? hydrateNote(row) : null;
}

export function listNotes(options: { userId: string; view: NoteView; search?: string; labelId?: string }) {
  const conditions: string[] = ['(notes.user_id = ? OR notes.assigned_user_id = ?)'];
  const values: string[] = [options.userId, options.userId];

  if (options.view === 'trash') conditions.push('notes.trashed_at IS NOT NULL');
  else {
    conditions.push('notes.trashed_at IS NULL');
    if (options.view === 'archive') conditions.push('notes.archived = 1');
    else conditions.push('notes.archived = 0');
    if (options.view === 'reminders' || options.view === 'calendar') conditions.push('notes.reminder_at IS NOT NULL');
    if (options.view === 'shared') conditions.push('notes.assigned_user_id IS NOT NULL');
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
  return hydrateRows(rows);
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

  const maximumNotes = boundedEnvironmentNumber('SUUR_MAX_NOTES_PER_USER', 50_000, 1_000, 100_000);
  const noteCount = (database.prepare('SELECT COUNT(*) AS count FROM notes WHERE user_id = ?').get(userId) as { count: number }).count;
  if (noteCount >= maximumNotes) throw new Error('NOTE_LIMIT_REACHED');

  const transaction = database.transaction(() => {
    const timestamp = now();
    const createdAt = input.createdAt && Number.isFinite(Date.parse(input.createdAt)) ? input.createdAt : timestamp;
    const updatedAt = input.updatedAt && Number.isFinite(Date.parse(input.updatedAt)) ? input.updatedAt : createdAt;
    const position = input.position ?? (database.prepare(
      'SELECT COALESCE(MIN(position), 1024) - 1024 AS position FROM notes WHERE user_id = ? AND trashed_at IS NULL',
    ).get(userId) as { position: number }).position;

    database.prepare(`
      INSERT INTO notes (
        id, user_id, assigned_user_id, title, content, content_format, type, items_json, color, pinned, archived,
        trashed_at, reminder_at, position, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      id,
      userId,
      input.assignedUserId ?? null,
      input.title ?? '',
      input.content ?? '',
      input.contentFormat ?? 'plain',
      input.type ?? 'text',
      JSON.stringify(input.items ?? []),
      input.color ?? 'default',
      input.pinned ? 1 : 0,
      input.archived ? 1 : 0,
      input.trashedAt ?? null,
      input.reminderAt ?? null,
      position,
      createdAt,
      updatedAt,
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
    database.prepare(`
      INSERT INTO note_versions (id, note_id, version, snapshot_json, changed_by_user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), id, current.version, JSON.stringify(current), userId, now());
    const historyLimit = boundedEnvironmentNumber('SUUR_NOTE_HISTORY_LIMIT', 100, 10, 1_000);
    database.prepare(`
      DELETE FROM note_versions WHERE note_id = ? AND id NOT IN (
        SELECT id FROM note_versions WHERE note_id = ? ORDER BY version DESC, created_at DESC LIMIT ?
      )
    `).run(id, id, historyLimit);
    const assignments: string[] = [];
    const values: unknown[] = [];
    const mappings: Array<[keyof NoteInput, string, (value: unknown) => unknown]> = [
      ['title', 'title', (value) => value],
      ['content', 'content', (value) => value],
      ['contentFormat', 'content_format', (value) => value],
      ['type', 'type', (value) => value],
      ['items', 'items_json', (value) => JSON.stringify(value)],
      ['color', 'color', (value) => value],
      ['pinned', 'pinned', (value) => value ? 1 : 0],
      ['archived', 'archived', (value) => value ? 1 : 0],
      ['trashedAt', 'trashed_at', (value) => value],
      ['reminderAt', 'reminder_at', (value) => value],
      ['position', 'position', (value) => value],
    ];

    if (input.assignedUserId !== undefined && current.ownerId === userId) {
      assignments.push('assigned_user_id = ?');
      values.push(input.assignedUserId);
    }

    for (const [key, column, transform] of mappings) {
      if (input[key] !== undefined) {
        assignments.push(`${column} = ?`);
        values.push(transform(input[key]));
      }
    }

    if (input.labelIds !== undefined) setNoteLabels(id, input.labelIds, current.ownerId);
    assignments.push('version = version + 1', 'updated_at = ?');
    values.push(now(), id, userId, userId);
    database.prepare(`UPDATE notes SET ${assignments.join(', ')} WHERE id = ? AND (user_id = ? OR assigned_user_id = ?)`).run(...values);
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

export function deleteExpiredTrash(userId: string, cutoff: string) {
  const database = getDb();
  const records = database.prepare(`
    SELECT attachments.stored_name FROM attachments JOIN notes ON notes.id = attachments.note_id
    WHERE notes.user_id = ? AND notes.trashed_at IS NOT NULL AND notes.trashed_at < ?
  `).all(userId, cutoff) as Array<{ stored_name: string }>;
  const deleted = database.prepare('DELETE FROM notes WHERE user_id = ? AND trashed_at IS NOT NULL AND trashed_at < ?').run(userId, cutoff).changes;
  return { deleted, storedNames: records.map((record) => record.stored_name) };
}

export function reorderNotes(positions: Array<{ id: string; position: number }>, mutation: string | null, userId: string) {
  if (hasMutation(mutation)) return;
  const database = getDb();
  const statement = database.prepare(
    'UPDATE notes SET position = ?, version = version + 1, updated_at = ? WHERE id = ? AND (user_id = ? OR assigned_user_id = ?)',
  );
  database.transaction(() => {
    const timestamp = now();
    for (const item of positions) statement.run(item.position, timestamp, item.id, userId, userId);
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

export function getStoredBranding(): StoredBranding {
  const row = getDb().prepare("SELECT value_json FROM settings WHERE key = 'branding'").get() as { value_json: string } | undefined;
  if (!row) return { ...defaultBranding, iconStoredName: null };
  try {
    const value = JSON.parse(row.value_json) as Partial<StoredBranding>;
    return {
      appName: typeof value.appName === 'string' && value.appName.trim() ? value.appName.trim().slice(0, 40) : defaultBranding.appName,
      hasCustomIcon: Boolean(value.hasCustomIcon && value.iconStoredName),
      iconVersion: typeof value.iconVersion === 'string' ? value.iconVersion : defaultBranding.iconVersion,
      iconStoredName: typeof value.iconStoredName === 'string' ? value.iconStoredName : null,
    };
  } catch {
    return { ...defaultBranding, iconStoredName: null };
  }
}

export function getBranding(): BrandingSettings {
  const stored = getStoredBranding();
  return { appName: stored.appName, hasCustomIcon: stored.hasCustomIcon, iconVersion: stored.iconVersion };
}

export function updateBranding(input: { appName?: string; iconStoredName?: string | null }) {
  const current = getStoredBranding();
  const next: StoredBranding = {
    appName: input.appName === undefined ? current.appName : input.appName.trim().slice(0, 40),
    iconStoredName: input.iconStoredName === undefined ? current.iconStoredName : input.iconStoredName,
    hasCustomIcon: input.iconStoredName === undefined ? current.hasCustomIcon : Boolean(input.iconStoredName),
    iconVersion: input.iconStoredName === undefined ? current.iconVersion : randomUUID(),
  };
  getDb().prepare(`
    INSERT INTO settings (key, value_json, updated_at) VALUES ('branding', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
  `).run(JSON.stringify(next), now());
  return getBranding();
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
    WHERE attachments.id = ? AND (notes.user_id = ? OR notes.assigned_user_id = ?)
  `).get(id, userId, userId) as AttachmentRow | undefined;
}

export function deleteAttachment(id: string, userId: string) {
  const record = getAttachmentRecord(id, userId);
  if (!record) return null;
  getDb().prepare('DELETE FROM attachments WHERE id = ?').run(id);
  return record;
}

export function listAllOwnedNotes(userId: string) {
  return hydrateRows(getDb().prepare('SELECT * FROM notes WHERE user_id = ? ORDER BY created_at').all(userId) as NoteRow[]);
}

export function listOwnedAttachmentRecords(userId: string) {
  return getDb().prepare(`
    SELECT attachments.* FROM attachments JOIN notes ON notes.id = attachments.note_id
    WHERE notes.user_id = ? ORDER BY attachments.created_at
  `).all(userId) as AttachmentRow[];
}

export function storageUsage(userId: string) {
  return (getDb().prepare(`
    SELECT COALESCE(SUM(attachments.size), 0) AS bytes FROM attachments
    JOIN notes ON notes.id = attachments.note_id WHERE notes.user_id = ?
  `).get(userId) as { bytes: number }).bytes;
}

export function listNoteHistory(id: string, userId: string) {
  if (!getNote(id, userId)) return null;
  return (getDb().prepare(`
    SELECT note_versions.id, note_versions.version, note_versions.snapshot_json, note_versions.created_at,
      users.display_name AS changed_by
    FROM note_versions LEFT JOIN users ON users.id = note_versions.changed_by_user_id
    WHERE note_versions.note_id = ? ORDER BY note_versions.version DESC LIMIT 100
  `).all(id) as Array<{ id: string; version: number; snapshot_json: string; created_at: string; changed_by: string | null }>).map((row) => {
    const snapshot = JSON.parse(row.snapshot_json) as Note;
    return { id: row.id, version: row.version, createdAt: row.created_at, title: snapshot.title, preview: snapshot.content.slice(0, 140), changedBy: row.changed_by };
  });
}

export function restoreNoteVersion(noteId: string, historyId: string, userId: string) {
  const current = getNote(noteId, userId);
  if (!current) return null;
  const row = getDb().prepare('SELECT snapshot_json FROM note_versions WHERE id = ? AND note_id = ?').get(historyId, noteId) as { snapshot_json: string } | undefined;
  if (!row) return null;
  const snapshot = JSON.parse(row.snapshot_json) as Note;
  return updateNote(noteId, {
    title: snapshot.title,
    content: snapshot.content,
    contentFormat: snapshot.contentFormat || 'plain',
    type: snapshot.type,
    items: snapshot.items,
    color: snapshot.color,
    pinned: snapshot.pinned,
    archived: snapshot.archived,
    trashedAt: snapshot.trashedAt,
    reminderAt: snapshot.reminderAt,
    assignedUserId: snapshot.assignedUserId,
    labelIds: snapshot.labels.map((label) => label.id),
    baseVersion: current.version,
  }, null, userId).note;
}

function shareHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function createNoteShare(noteId: string, userId: string) {
  const note = getDb().prepare('SELECT id FROM notes WHERE id = ? AND user_id = ? AND trashed_at IS NULL').get(noteId, userId);
  if (!note) return null;
  const token = randomBytes(28).toString('base64url');
  getDb().transaction(() => {
    getDb().prepare('DELETE FROM note_shares WHERE note_id = ? AND user_id = ?').run(noteId, userId);
    getDb().prepare('INSERT INTO note_shares (token_hash, note_id, user_id, created_at) VALUES (?, ?, ?, ?)').run(shareHash(token), noteId, userId, now());
  })();
  return token;
}

export function deleteNoteShare(noteId: string, userId: string) {
  return getDb().prepare('DELETE FROM note_shares WHERE note_id = ? AND user_id = ?').run(noteId, userId).changes > 0;
}

export function getSharedNote(token: string) {
  const row = getDb().prepare(`
    SELECT notes.* FROM note_shares JOIN notes ON notes.id = note_shares.note_id
    WHERE note_shares.token_hash = ? AND notes.trashed_at IS NULL
      AND (note_shares.expires_at IS NULL OR note_shares.expires_at > ?)
  `).get(shareHash(token), now()) as NoteRow | undefined;
  return row ? hydrateNote(row) : null;
}

export function getSharedAttachmentRecord(token: string, attachmentId: string) {
  return getDb().prepare(`
    SELECT attachments.* FROM note_shares
    JOIN notes ON notes.id = note_shares.note_id
    JOIN attachments ON attachments.note_id = notes.id
    WHERE note_shares.token_hash = ? AND attachments.id = ? AND notes.trashed_at IS NULL
      AND (note_shares.expires_at IS NULL OR note_shares.expires_at > ?)
  `).get(shareHash(token), attachmentId, now()) as AttachmentRow | undefined;
}
