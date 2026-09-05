import 'server-only';
import Database from 'better-sqlite3';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const SCHEMA_REVISION = 4;
const globalForSuur = globalThis as unknown as { suurDb?: Database.Database; suurSchemaRevision?: number };

export function dataDirectory() {
  return process.env.DATA_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), 'data');
}

export function uploadsDirectory() {
  return path.join(/* turbopackIgnore: true */ dataDirectory(), 'uploads');
}

export function profileUploadsDirectory() {
  return path.join(/* turbopackIgnore: true */ uploadsDirectory(), 'profiles');
}

export function brandingUploadsDirectory() {
  return path.join(/* turbopackIgnore: true */ uploadsDirectory(), 'branding');
}

function passwordHash(password: string) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt.toString('hex')}$${derived.toString('hex')}`;
}

function passwordMatches(password: string, encoded: string) {
  try {
    const [algorithm, n, r, p, saltHex, hashHex] = encoded.split('$');
    if (algorithm !== 'scrypt') return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch { return false; }
}

function ensureColumn(database: Database.Database, table: string, column: string, definition: string) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

function ensureRuntimeSchema(database: Database.Database) {
  ensureColumn(database, 'notes', 'user_id', 'user_id TEXT REFERENCES users(id) ON DELETE CASCADE');
  ensureColumn(database, 'labels', 'user_id', 'user_id TEXT REFERENCES users(id) ON DELETE CASCADE');
  ensureColumn(database, 'users', 'storage_quota_mb', 'storage_quota_mb INTEGER NOT NULL DEFAULT 512');
  ensureColumn(database, 'users', 'must_change_password', 'must_change_password INTEGER NOT NULL DEFAULT 0');
  ensureColumn(database, 'notes', 'content_format', "content_format TEXT NOT NULL DEFAULT 'plain'");
  ensureColumn(database, 'notes', 'assigned_user_id', 'assigned_user_id TEXT REFERENCES users(id) ON DELETE SET NULL');
  ensureColumn(database, 'note_versions', 'changed_by_user_id', 'changed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL');
  ensureColumn(database, 'sessions', 'session_type', "session_type TEXT NOT NULL DEFAULT 'web' CHECK (session_type IN ('web', 'mobile'))");
  ensureColumn(database, 'sessions', 'device_name', 'device_name TEXT');
  ensureColumn(database, 'mutations', 'user_id', 'user_id TEXT REFERENCES users(id) ON DELETE CASCADE');
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_notes_assigned_user
      ON notes (assigned_user_id, trashed_at, archived, position);
    CREATE INDEX IF NOT EXISTS idx_sessions_type_expiry
      ON sessions (session_type, expires_at);
    CREATE INDEX IF NOT EXISTS idx_mutations_user_created
      ON mutations (user_id, created_at);
    CREATE TABLE IF NOT EXISTS sync_clock (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      sequence INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO sync_clock (id, sequence) VALUES (1, 0);
    CREATE TABLE IF NOT EXISTS sync_changes (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('note', 'label', 'settings')),
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
      sequence INTEGER NOT NULL UNIQUE,
      changed_at TEXT NOT NULL,
      PRIMARY KEY (user_id, entity_type, entity_id)
    );
    CREATE INDEX IF NOT EXISTS idx_sync_changes_user_sequence
      ON sync_changes (user_id, sequence);
  `);
}

function migrateLabelUniqueness(database: Database.Database) {
  const indexes = database.pragma('index_list(labels)') as Array<{ name: string; unique: number }>;
  const hasLegacyGlobalUniqueName = indexes.some((index) => {
    if (!index.unique) return false;
    const escapedName = index.name.replaceAll("'", "''");
    const columns = database.pragma(`index_info('${escapedName}')`) as Array<{ name: string }>;
    return columns.length === 1 && columns[0]?.name === 'name';
  });
  if (!hasLegacyGlobalUniqueName) return;

  database.pragma('foreign_keys = OFF');
  try {
    database.transaction(() => database.exec(`
      CREATE TABLE labels_per_user (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL COLLATE NOCASE,
        color TEXT NOT NULL DEFAULT '#3f5efb',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (user_id, name)
      );
      INSERT INTO labels_per_user (id, user_id, name, color, created_at, updated_at)
        SELECT id, user_id, name, color, created_at, updated_at FROM labels;
      DROP TABLE labels;
      ALTER TABLE labels_per_user RENAME TO labels;
    `))();
  } finally {
    database.pragma('foreign_keys = ON');
  }
  const violations = database.pragma('foreign_key_check') as unknown[];
  if (violations.length) throw new Error('Etiket veritabanı geçişi bütünlük kontrolünü geçemedi.');
}

function initializeDatabase() {
  mkdirSync(profileUploadsDirectory(), { recursive: true });
  mkdirSync(brandingUploadsDirectory(), { recursive: true });
  const database = new Database(path.join(/* turbopackIgnore: true */ dataDirectory(), 'suur.db'));

  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.pragma('busy_timeout = 5000');
  database.pragma('synchronous = NORMAL');

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('superadmin', 'admin', 'user')),
      avatar_stored_name TEXT,
      storage_quota_mb INTEGER NOT NULL DEFAULT 512,
      must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      session_type TEXT NOT NULL DEFAULT 'web' CHECK (session_type IN ('web', 'mobile')),
      device_name TEXT
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      content_format TEXT NOT NULL DEFAULT 'plain' CHECK (content_format IN ('plain', 'markdown')),
      type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'checklist')),
      items_json TEXT NOT NULL DEFAULT '[]',
      color TEXT NOT NULL DEFAULT 'default',
      pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
      archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
      trashed_at TEXT,
      reminder_at TEXT,
      position REAL NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS note_versions (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      changed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS note_shares (
      token_hash TEXT PRIMARY KEY,
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT
    );

    CREATE TABLE IF NOT EXISTS labels (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL COLLATE NOCASE,
      color TEXT NOT NULL DEFAULT '#3f5efb',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, name)
    );

    CREATE TABLE IF NOT EXISTS note_labels (
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
      PRIMARY KEY (note_id, label_id)
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      stored_name TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    );

    CREATE TABLE IF NOT EXISTS mutations (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_clock (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      sequence INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sync_changes (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('note', 'label', 'settings')),
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
      sequence INTEGER NOT NULL UNIQUE,
      changed_at TEXT NOT NULL,
      PRIMARY KEY (user_id, entity_type, entity_id)
    );

    CREATE TABLE IF NOT EXISTS imported_items (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      fingerprint TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, fingerprint)
    );

    CREATE INDEX IF NOT EXISTS idx_notes_state_position
      ON notes (trashed_at, archived, pinned, position);
    CREATE INDEX IF NOT EXISTS idx_notes_reminder
      ON notes (reminder_at) WHERE reminder_at IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_note_labels_label
      ON note_labels (label_id, note_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_note
      ON attachments (note_id);
    CREATE INDEX IF NOT EXISTS idx_note_versions_note
      ON note_versions (note_id, version DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_expiry
      ON sessions (user_id, expires_at);
    CREATE INDEX IF NOT EXISTS idx_sync_changes_user_sequence
      ON sync_changes (user_id, sequence);
  `);

  database.prepare('INSERT OR IGNORE INTO sync_clock (id, sequence) VALUES (1, 0)').run();

  const timestamp = new Date().toISOString();
  let defaultUser = database.prepare('SELECT id FROM users ORDER BY created_at LIMIT 1').get() as { id: string } | undefined;
  if (!defaultUser) {
    const id = randomUUID();
    database.prepare(`
      INSERT INTO users (id, username, display_name, password_hash, role, must_change_password, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'superadmin', ?, ?, ?)
    `).run(
      id,
      process.env.SUUR_DEFAULT_USERNAME || 'alaferoce',
      'Superadmin',
      passwordHash(process.env.SUUR_DEFAULT_PASSWORD || '7Admin7'),
      process.env.SUUR_FORCE_DEFAULT_PASSWORD_CHANGE === 'false' ? 0 : 1,
      timestamp,
      timestamp,
    );
    defaultUser = { id };
  }

  ensureRuntimeSchema(database);
  if (process.env.SUUR_FORCE_DEFAULT_PASSWORD_CHANGE !== 'false') {
    const defaultUsername = process.env.SUUR_DEFAULT_USERNAME || 'alaferoce';
    const defaultPassword = process.env.SUUR_DEFAULT_PASSWORD || '7Admin7';
    const defaultCredentialUser = database.prepare('SELECT id, password_hash FROM users WHERE username = ? COLLATE NOCASE').get(defaultUsername) as { id: string; password_hash: string } | undefined;
    if (defaultCredentialUser && passwordMatches(defaultPassword, defaultCredentialUser.password_hash)) database.prepare('UPDATE users SET must_change_password = 1 WHERE id = ?').run(defaultCredentialUser.id);
  }
  database.prepare('UPDATE notes SET user_id = ? WHERE user_id IS NULL').run(defaultUser.id);
  database.prepare('UPDATE labels SET user_id = ? WHERE user_id IS NULL').run(defaultUser.id);
  migrateLabelUniqueness(database);
  database.prepare(`
    INSERT OR IGNORE INTO user_settings (user_id, key, value_json, updated_at)
    SELECT ?, key, value_json, updated_at FROM settings
  `).run(defaultUser.id);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_notes_user_state_position
      ON notes (user_id, trashed_at, archived, pinned, position);
    CREATE INDEX IF NOT EXISTS idx_labels_user_name
      ON labels (user_id, name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_notes_assigned_user
      ON notes (assigned_user_id, trashed_at, archived, position);
  `);

  database.prepare("DELETE FROM mutations WHERE created_at < datetime('now', '-30 days')").run();
  database.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
  database.pragma('optimize');
  return database;
}

export function getDb() {
  if (!globalForSuur.suurDb) {
    globalForSuur.suurDb = initializeDatabase();
    globalForSuur.suurSchemaRevision = SCHEMA_REVISION;
  } else if (globalForSuur.suurSchemaRevision !== SCHEMA_REVISION) {
    ensureRuntimeSchema(globalForSuur.suurDb);
    globalForSuur.suurSchemaRevision = SCHEMA_REVISION;
  }
  return globalForSuur.suurDb;
}
