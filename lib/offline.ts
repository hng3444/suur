let databaseName = 'suur-offline-anonymous';
const DATABASE_VERSION = 1;

export interface QueuedOperation {
  id: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  url: string;
  body?: unknown;
  createdAt: string;
}

function bodyRecord(operation: QueuedOperation) {
  return operation.body && typeof operation.body === 'object' && !Array.isArray(operation.body)
    ? operation.body as Record<string, unknown>
    : null;
}

function noteId(operation: QueuedOperation) {
  if (operation.method === 'POST' && operation.url === '/api/notes') {
    const id = bodyRecord(operation)?.id;
    return typeof id === 'string' ? id : null;
  }
  const match = operation.url.match(/^\/api\/notes\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

const validId = /^[a-zA-Z0-9_-]{1,80}$/;
const noteColors = new Set(['default', 'mint', 'sage', 'sand', 'rose', 'sky', 'lavender']);

function validDateOrNull(value: unknown) {
  if (value === null) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}

/** Repairs operations written by older Suur versions before replaying them. */
export function sanitizeQueuedOperation(operation: QueuedOperation): QueuedOperation {
  const isCreate = operation.method === 'POST' && operation.url === '/api/notes';
  const isPatch = operation.method === 'PATCH' && /^\/api\/notes\/[^/]+$/.test(operation.url);
  const source = bodyRecord(operation);
  if ((!isCreate && !isPatch) || !source) return operation;

  const body: Record<string, unknown> = {};
  if (isCreate && typeof source.id === 'string' && validId.test(source.id)) body.id = source.id;
  if (typeof source.title === 'string') body.title = source.title.slice(0, 500);
  if (typeof source.content === 'string') body.content = source.content.slice(0, 100_000);
  if (source.contentFormat === 'plain' || source.contentFormat === 'markdown') body.contentFormat = source.contentFormat;
  if (source.type === 'text' || source.type === 'checklist') body.type = source.type;
  if (Array.isArray(source.items)) {
    body.items = source.items.slice(0, 500).map((raw, index) => {
      const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
      const id = typeof item.id === 'string' && validId.test(item.id) ? item.id : `recovered-${index}`;
      return { id, text: String(item.text || '').slice(0, 10_000), checked: Boolean(item.checked) };
    });
  }
  if (typeof source.color === 'string') body.color = noteColors.has(source.color) ? source.color : 'default';
  for (const key of ['pinned', 'archived'] as const) if (typeof source[key] === 'boolean') body[key] = source[key];
  for (const key of ['trashedAt', 'reminderAt'] as const) {
    if (source[key] !== undefined) {
      const date = validDateOrNull(source[key]);
      if (date !== undefined) body[key] = date;
    }
  }
  if (typeof source.position === 'number' && Number.isFinite(source.position)) body.position = source.position;
  if (Array.isArray(source.labelIds)) body.labelIds = source.labelIds.filter((id): id is string => typeof id === 'string' && validId.test(id)).slice(0, 100);
  if (source.assignedUserId === null || (typeof source.assignedUserId === 'string' && validId.test(source.assignedUserId))) body.assignedUserId = source.assignedUserId;
  if (isPatch && Number.isInteger(source.baseVersion) && Number(source.baseVersion) > 0) body.baseVersion = source.baseVersion;

  return { ...operation, body };
}

/**
 * Collapses autosave bursts without losing their newest fields. In particular,
 * edits made after an offline note was created are folded into that pending POST,
 * so reconnecting cannot replay one stale PATCH per keystroke.
 */
export function compactOperations(operations: QueuedOperation[]) {
  const result: QueuedOperation[] = [];
  for (const rawOperation of [...operations].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const operation = sanitizeQueuedOperation(rawOperation);
    if (operation.method === 'POST' && operation.url === '/api/notes/reorder') {
      const existing = result.findIndex((item) => item.method === 'POST' && item.url === operation.url);
      if (existing >= 0) result[existing] = { ...result[existing], body: operation.body };
      else result.push(operation);
      continue;
    }

    const id = noteId(operation);
    if (!id) {
      result.push(operation);
      continue;
    }

    const pendingCreate = result.findIndex((item) => item.method === 'POST' && item.url === '/api/notes' && noteId(item) === id);
    const pendingPatch = result.findIndex((item) => item.method === 'PATCH' && noteId(item) === id);
    const pendingDelete = result.findIndex((item) => item.method === 'DELETE' && noteId(item) === id);

    if (operation.method === 'POST') {
      if (pendingCreate >= 0) {
        result[pendingCreate] = {
          ...result[pendingCreate],
          body: { ...bodyRecord(result[pendingCreate]), ...bodyRecord(operation) },
        };
      } else result.push(operation);
      continue;
    }

    if (operation.method === 'PATCH') {
      if (pendingDelete >= 0) continue;
      if (pendingCreate >= 0) {
        const patch = { ...bodyRecord(operation) };
        delete patch.baseVersion;
        result[pendingCreate] = {
          ...result[pendingCreate],
          body: { ...bodyRecord(result[pendingCreate]), ...patch },
        };
      } else if (pendingPatch >= 0) {
        const previous = bodyRecord(result[pendingPatch]) || {};
        const incoming = bodyRecord(operation) || {};
        result[pendingPatch] = {
          ...result[pendingPatch],
          body: {
            ...previous,
            ...incoming,
            baseVersion: previous.baseVersion ?? incoming.baseVersion,
          },
        };
      } else result.push(operation);
      continue;
    }

    // A permanent delete makes older PATCH operations unnecessary. A pending
    // create is deliberately retained before it: if its response was lost, the
    // idempotent create is replayed and then deleted instead of becoming a ghost.
    if (pendingPatch >= 0) result.splice(pendingPatch, 1);
    const duplicateDelete = result.findIndex((item) => item.method === 'DELETE' && noteId(item) === id);
    if (duplicateDelete >= 0) result[duplicateDelete] = operation;
    else result.push(operation);
  }
  return result;
}

function openDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB kullanılamıyor.'));
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('cache')) database.createObjectStore('cache');
      if (!database.objectStoreNames.contains('queue')) database.createObjectStore('queue', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function setOfflineNamespace(userId: string) {
  databaseName = `suur-offline-${userId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

async function transaction<T>(storeName: 'cache' | 'queue', mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = database.transaction(storeName, mode);
    const request = action(tx.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => database.close();
    tx.onerror = () => reject(tx.error);
  });
}

export async function setCache(key: string, value: unknown) {
  await transaction('cache', 'readwrite', (store) => store.put(value, key));
}

export async function getCache<T>(key: string) {
  return transaction<T | undefined>('cache', 'readonly', (store) => store.get(key));
}

async function rewriteQueue(addition?: QueuedOperation) {
  const database = await openDatabase();
  return new Promise<QueuedOperation[]>((resolve, reject) => {
    const tx = database.transaction('queue', 'readwrite');
    const store = tx.objectStore('queue');
    const request = store.getAll() as IDBRequest<QueuedOperation[]>;
    let compacted: QueuedOperation[] = [];
    request.onsuccess = () => {
      compacted = compactOperations(addition ? [...request.result, addition] : request.result);
      store.clear();
      for (const item of compacted) store.put(item);
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => { database.close(); resolve(compacted); };
    tx.onerror = () => { database.close(); reject(tx.error); };
    tx.onabort = () => { database.close(); reject(tx.error); };
  });
}

export async function enqueue(operation: QueuedOperation) {
  await rewriteQueue(operation);
}

export async function queuedOperations() {
  return rewriteQueue();
}

export async function removeQueuedOperation(id: string) {
  await transaction('queue', 'readwrite', (store) => store.delete(id));
}

export async function clearOfflineData() {
  if (typeof indexedDB === 'undefined') return;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}
