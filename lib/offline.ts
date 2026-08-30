let databaseName = 'suur-offline-anonymous';
const DATABASE_VERSION = 1;

export interface QueuedOperation {
  id: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  url: string;
  body?: unknown;
  createdAt: string;
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

export async function enqueue(operation: QueuedOperation) {
  await transaction('queue', 'readwrite', (store) => store.put(operation));
}

export async function queuedOperations() {
  const items = await transaction<QueuedOperation[]>('queue', 'readonly', (store) => store.getAll());
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function removeQueuedOperation(id: string) {
  await transaction('queue', 'readwrite', (store) => store.delete(id));
}
