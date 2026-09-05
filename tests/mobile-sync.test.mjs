import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMobileDelta,
  applyMobileSnapshot,
  createConflictCopy,
  createEmptyMobileState,
  runMobileSync,
} from '../lib/mobile-sync.ts';

const settings = {
  theme: 'system', view: 'grid', sortOrder: 'manual', backgroundTone: 'neutral', sidebarCollapsed: false,
  locale: 'tr', accent: 'forest', notificationsEnabled: false, backupFrequency: 'off', trashRetentionDays: 30,
  completedItemsBottom: true,
};

function note(id, title = 'Note', version = 1) {
  const timestamp = '2026-09-03T10:00:00.000Z';
  return {
    id, ownerId: 'user-1', assignedUserId: null, title, content: '', contentFormat: 'plain', type: 'text',
    items: [], color: 'default', pinned: false, archived: false, trashedAt: null, reminderAt: null,
    position: 0, version, createdAt: timestamp, updatedAt: timestamp, labels: [], attachments: [],
  };
}

function snapshot(notes = []) {
  return {
    mode: 'snapshot', serverId: 'server-1', userId: 'user-1', apiVersion: 2,
    generatedAt: '2026-09-03T10:00:00.000Z', cursor: 4, notes, labels: [], settings,
  };
}

class MemoryStore {
  constructor(state, queue = []) { this.state = state; this.queue = queue; }
  async readState() { return structuredClone(this.state); }
  async writeState(value) { this.state = structuredClone(value); }
  async readQueue() { return structuredClone(this.queue); }
  async writeQueue(value) { this.queue = structuredClone(value); }
}

test('snapshot requests do not bind browser fetch to a configuration object', async () => {
  const store = new MemoryStore(createEmptyMobileState('server-1', 'user-1'));
  const result = await runMobileSync({
    serverUrl: 'https://notes.example.com', token: 'a'.repeat(43), store,
    fetcher: function () {
      assert.equal(this, undefined, 'Browser fetch throws Illegal invocation with an object receiver');
      return Promise.resolve(Response.json(snapshot([note('browser-note')])));
    },
  });
  assert.equal(result.online, true);
  assert.equal(result.state.notes[0].id, 'browser-note');
});

test('mobile snapshots replace local data only for the expected server and user', () => {
  const state = createEmptyMobileState('server-1', 'user-1');
  const next = applyMobileSnapshot(state, snapshot([note('n1')]));
  assert.equal(next.cursor, 4);
  assert.deepEqual(next.notes.map((item) => item.id), ['n1']);
  assert.throws(
    () => applyMobileSnapshot(createEmptyMobileState('other-server', 'user-1'), snapshot()),
    /SYNC_IDENTITY_MISMATCH/,
  );
});

test('mobile deltas upsert notes and remove deleted notes and labels', () => {
  const label = { id: 'l1', name: 'Work', color: '#1971c2', createdAt: '2026-09-03T10:00:00.000Z', updatedAt: '2026-09-03T10:00:00.000Z' };
  const first = { ...note('n1'), labels: [label] };
  const state = { ...createEmptyMobileState('server-1', 'user-1'), cursor: 4, notes: [first, note('n2')], labels: [label], settings };
  const next = applyMobileDelta(state, {
    mode: 'delta', serverId: 'server-1', userId: 'user-1', apiVersion: 2,
    generatedAt: '2026-09-03T10:01:00.000Z', fromCursor: 4, cursor: 7, hasMore: false,
    changes: [
      { cursor: 5, entity: 'note', id: 'n1', operation: 'upsert', data: note('n1', 'Changed', 2) },
      { cursor: 6, entity: 'note', id: 'n2', operation: 'delete', data: null },
      { cursor: 7, entity: 'label', id: 'l1', operation: 'delete', data: null },
    ],
  });
  assert.equal(next.cursor, 7);
  assert.deepEqual(next.notes.map((item) => [item.id, item.title]), [['n1', 'Changed']]);
  assert.deepEqual(next.labels, []);
});

test('version conflicts become deterministic offline copies instead of overwriting server text', () => {
  const copy = createConflictCopy({
    id: 'mutation-1', method: 'PATCH', url: '/api/notes/n1', createdAt: '2026-09-03T10:00:00.000Z',
    body: { title: 'Local text', content: 'kept', baseVersion: 1, assignedUserId: 'user-2' },
  });
  assert.equal(copy?.method, 'POST');
  assert.equal(copy?.url, '/api/notes');
  assert.equal(copy?.id, 'conflict_mutation-1');
  assert.equal(copy?.body.baseVersion, undefined);
  assert.equal(copy?.body.assignedUserId, null);
  assert.equal(copy?.body.title, 'Local text (offline copy)');
});

test('mobile sync pushes the durable queue before downloading a fresh snapshot', async () => {
  const pending = {
    id: 'mutation-1', method: 'POST', url: '/api/notes', createdAt: '2026-09-03T10:00:00.000Z',
    body: { id: 'n1', title: 'Offline note', content: '' },
  };
  const store = new MemoryStore(createEmptyMobileState('server-1', 'user-1'), [pending]);
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url: String(url), options });
    if (options.method === 'POST') return Response.json({ note: note('n1', 'Offline note') }, { status: 201 });
    return Response.json(snapshot([note('n1', 'Offline note')]));
  };
  const result = await runMobileSync({ serverUrl: 'https://notes.example.com', token: 'a'.repeat(43), store, fetcher });
  assert.equal(result.online, true);
  assert.equal(result.pending, 0);
  assert.equal(result.pushed, 1);
  assert.deepEqual(result.state.notes.map((item) => item.title), ['Offline note']);
  assert.equal(requests[0].options.headers.Authorization, `Bearer ${'a'.repeat(43)}`);
  assert.equal(requests[0].options.headers['X-Suur-Mutation-Id'], 'mutation-1');
  assert.equal(requests[0].options.credentials, 'omit');
  assert.equal(requests[0].options.redirect, 'manual');
  assert.match(requests[1].url, /\/api\/mobile\/sync$/);
});

test('network loss keeps queued operations and cached notes intact', async () => {
  const cached = { ...createEmptyMobileState('server-1', 'user-1'), cursor: 4, notes: [note('cached')], settings };
  const store = new MemoryStore(cached, [{ id: 'mutation-1', method: 'DELETE', url: '/api/notes/n1', createdAt: '2026-09-03T10:00:00.000Z' }]);
  const result = await runMobileSync({
    serverUrl: 'https://notes.example.com', token: 'a'.repeat(43), store,
    fetcher: async () => { throw new TypeError('offline'); },
  });
  assert.equal(result.online, false);
  assert.equal(result.pending, 1);
  assert.deepEqual(result.state.notes.map((item) => item.id), ['cached']);
  assert.equal(store.queue.length, 1);
});

test('a rejected operation cannot be erased by a later server snapshot', async () => {
  const cached = { ...createEmptyMobileState('server-1', 'user-1'), cursor: 4, notes: [note('local', 'Unsynced local')], settings };
  const store = new MemoryStore(cached, [{
    id: 'mutation-1', method: 'PATCH', url: '/api/notes/local', createdAt: '2026-09-03T10:00:00.000Z',
    body: { title: 'Unsynced local', baseVersion: 1 },
  }]);
  let requestCount = 0;
  const result = await runMobileSync({
    serverUrl: 'https://notes.example.com', token: 'a'.repeat(43), store,
    fetcher: async () => { requestCount += 1; return Response.json({ code: 'INVALID' }, { status: 422 }); },
  });
  assert.equal(result.blocked, true);
  assert.equal(result.pending, 1);
  assert.equal(requestCount, 1);
  assert.equal(result.state.notes[0].title, 'Unsynced local');
});

test('the synchronization runner uploads a conflict copy and then pulls both server notes', async () => {
  const original = note('n1', 'Server text', 2);
  const copy = note('conflict_mutation-1', 'Local text (offline copy)', 1);
  const store = new MemoryStore(
    { ...createEmptyMobileState('server-1', 'user-1'), cursor: 3, notes: [note('n1', 'Local text', 1)], settings },
    [{
      id: 'mutation-1', method: 'PATCH', url: '/api/notes/n1', createdAt: '2026-09-03T10:00:00.000Z',
      body: { title: 'Local text', content: '', baseVersion: 1 },
    }],
  );
  const methods = [];
  const fetcher = async (_url, options) => {
    methods.push(options.method);
    if (methods.length === 1) return Response.json({ code: 'VERSION_CONFLICT', note: original }, { status: 409 });
    if (methods.length === 2) return Response.json({ note: copy }, { status: 201 });
    return Response.json({ ...snapshot([original, copy]), cursor: 5 });
  };
  const result = await runMobileSync({ serverUrl: 'https://notes.example.com', token: 'a'.repeat(43), store, fetcher });
  assert.deepEqual(methods, ['PATCH', 'POST', 'GET']);
  assert.equal(result.conflictCopies, 1);
  assert.equal(result.pending, 0);
  assert.deepEqual(result.state.notes.map((item) => item.title), ['Server text', 'Local text (offline copy)']);
});
