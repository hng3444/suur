import { compactOperations } from './offline.ts';
import { createEmptyMobileState, type MobileLocalState, type MobilePendingOperation, type MobileSyncStore } from './mobile-sync.ts';
import type { AppSettings, Label, Note } from './types.ts';

const DATABASE_VERSION = 1;

function safeNamespace(value: string) {
  const cleaned = value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  if (!cleaned) throw new Error('INVALID_OFFLINE_NAMESPACE');
  return cleaned;
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('OFFLINE_TRANSACTION_ABORTED'));
  });
}

export class IndexedDbMobileSyncStore implements MobileSyncStore {
  readonly databaseName: string;

  constructor(readonly serverId: string, readonly userId: string) {
    this.databaseName = `suur-mobile-${safeNamespace(serverId)}-${safeNamespace(userId)}`;
  }

  private open() {
    if (typeof indexedDB === 'undefined') return Promise.reject(new Error('INDEXED_DB_UNAVAILABLE'));
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('notes')) database.createObjectStore('notes', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('labels')) database.createObjectStore('labels', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('meta')) database.createObjectStore('meta');
        if (!database.objectStoreNames.contains('queue')) database.createObjectStore('queue', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async readState(): Promise<MobileLocalState> {
    const database = await this.open();
    try {
      const transaction = database.transaction(['notes', 'labels', 'meta'], 'readonly');
      const done = transactionDone(transaction);
      const notesRequest = transaction.objectStore('notes').getAll() as IDBRequest<Note[]>;
      const labelsRequest = transaction.objectStore('labels').getAll() as IDBRequest<Label[]>;
      const meta = transaction.objectStore('meta');
      const cursorRequest = meta.get('cursor') as IDBRequest<number | null | undefined>;
      const settingsRequest = meta.get('settings') as IDBRequest<AppSettings | null | undefined>;
      const serverRequest = meta.get('serverId') as IDBRequest<string | undefined>;
      const userRequest = meta.get('userId') as IDBRequest<string | undefined>;
      const [notes, labels, cursor, settings, storedServerId, storedUserId] = await Promise.all([
        requestResult(notesRequest),
        requestResult(labelsRequest),
        requestResult(cursorRequest),
        requestResult(settingsRequest),
        requestResult(serverRequest),
        requestResult(userRequest),
      ]);
      await done;
      if ((storedServerId && storedServerId !== this.serverId) || (storedUserId && storedUserId !== this.userId)) {
        throw new Error('OFFLINE_IDENTITY_MISMATCH');
      }
      return {
        serverId: this.serverId,
        userId: this.userId,
        cursor: typeof cursor === 'number' ? cursor : null,
        notes,
        labels,
        settings: settings || null,
      };
    } finally {
      database.close();
    }
  }

  async writeState(state: MobileLocalState) {
    if (state.serverId !== this.serverId || state.userId !== this.userId) throw new Error('OFFLINE_IDENTITY_MISMATCH');
    const database = await this.open();
    try {
      const transaction = database.transaction(['notes', 'labels', 'meta'], 'readwrite');
      const done = transactionDone(transaction);
      const notes = transaction.objectStore('notes');
      const labels = transaction.objectStore('labels');
      notes.clear();
      labels.clear();
      for (const note of state.notes) notes.put(note);
      for (const label of state.labels) labels.put(label);
      const meta = transaction.objectStore('meta');
      meta.put(state.serverId, 'serverId');
      meta.put(state.userId, 'userId');
      meta.put(state.cursor, 'cursor');
      meta.put(state.settings, 'settings');
      await done;
    } finally {
      database.close();
    }
  }

  async readQueue() {
    const database = await this.open();
    try {
      const transaction = database.transaction('queue', 'readonly');
      const done = transactionDone(transaction);
      const operations = await requestResult(
        transaction.objectStore('queue').getAll() as IDBRequest<MobilePendingOperation[]>,
      );
      await done;
      return compactOperations(operations);
    } finally {
      database.close();
    }
  }

  async writeQueue(operations: MobilePendingOperation[]) {
    const database = await this.open();
    try {
      const transaction = database.transaction('queue', 'readwrite');
      const done = transactionDone(transaction);
      const queue = transaction.objectStore('queue');
      queue.clear();
      for (const operation of compactOperations(operations)) queue.put(operation);
      await done;
    } finally {
      database.close();
    }
  }

  async enqueue(operation: MobilePendingOperation) {
    const database = await this.open();
    try {
      const transaction = database.transaction('queue', 'readwrite');
      const done = transactionDone(transaction);
      const queue = transaction.objectStore('queue');
      const operations = await requestResult(queue.getAll() as IDBRequest<MobilePendingOperation[]>);
      queue.clear();
      for (const item of compactOperations([...operations, operation])) queue.put(item);
      await done;
    } finally {
      database.close();
    }
  }

  async initialize() {
    const state = await this.readState();
    if (state.cursor === null && !state.notes.length && !state.labels.length && !state.settings) {
      await this.writeState(createEmptyMobileState(this.serverId, this.userId));
    }
  }

  async clear() {
    if (typeof indexedDB === 'undefined') return;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.databaseName);
      request.onsuccess = () => resolve();
      request.onblocked = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export async function requestMobileStoragePersistence() {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  return navigator.storage.persist();
}
