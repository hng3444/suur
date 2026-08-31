import assert from 'node:assert/strict';
import test from 'node:test';
import { plainTextPreview, hasActiveFilters } from '../lib/client-utils.ts';
import { syncDecision } from '../lib/sync-policy.ts';
import { compactOperations, sanitizeQueuedOperation } from '../lib/offline.ts';
import { noteUpdateSchema } from '../lib/validation.ts';

test('Markdown card previews do not expose formatting markers', () => {
  assert.equal(plainTextPreview('## Plan\n- [Docs](https://example.com)\n- **Ship**'), 'Plan Docs Ship');
});

test('active filters are detected', () => {
  assert.equal(hasActiveFilters({ color: 'all', label: 'all', date: 'all', reminder: 'all' }), false);
  assert.equal(hasActiveFilters({ color: 'mint', label: 'all', date: 'all', reminder: 'all' }), true);
});

test('failed offline operations are never treated as complete', () => {
  assert.equal(syncDecision(204), 'complete');
  assert.equal(syncDecision(401), 'pause-auth');
  assert.equal(syncDecision(422), 'pause-invalid');
  assert.equal(syncDecision(500), 'retry');
});

test('offline autosaves for one note are compacted into one operation', () => {
  const operations = compactOperations([
    { id: 'create', method: 'POST', url: '/api/notes', body: { id: 'note-1', title: 'a', content: 'a' }, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'patch-1', method: 'PATCH', url: '/api/notes/note-1', body: { title: 'ab', content: 'ab', baseVersion: 1 }, createdAt: '2026-01-01T00:00:01.000Z' },
    { id: 'patch-2', method: 'PATCH', url: '/api/notes/note-1', body: { title: 'abc', content: 'abc', baseVersion: 2 }, createdAt: '2026-01-01T00:00:02.000Z' },
  ]);

  assert.equal(operations.length, 1);
  assert.equal(operations[0].method, 'POST');
  assert.deepEqual(operations[0].body, { id: 'note-1', title: 'abc', content: 'abc' });
});

test('online autosave patches keep the original base version and newest content', () => {
  const operations = compactOperations([
    { id: 'patch-1', method: 'PATCH', url: '/api/notes/note-1', body: { title: 'a', baseVersion: 4 }, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'patch-2', method: 'PATCH', url: '/api/notes/note-1', body: { title: 'latest', baseVersion: 5 }, createdAt: '2026-01-01T00:00:01.000Z' },
  ]);

  assert.equal(operations.length, 1);
  assert.deepEqual(operations[0].body, { title: 'latest', baseVersion: 4 });
});

test('partial note updates never fill omitted fields with destructive defaults', () => {
  assert.deepEqual(noteUpdateSchema.parse({ trashedAt: null, baseVersion: 4 }), { trashedAt: null, baseVersion: 4 });
  assert.deepEqual(noteUpdateSchema.parse({ pinned: true }), { pinned: true });
});

test('legacy rejected queue entries are repaired before synchronization', () => {
  const repaired = sanitizeQueuedOperation({
    id: 'legacy', method: 'PATCH', url: '/api/notes/note-1', createdAt: '2026-01-01T00:00:00.000Z',
    body: { title: 'kept', color: 'yellow', reminderAt: '', baseVersion: 0, labels: [{ id: 'private' }], attachments: [] },
  });
  assert.deepEqual(repaired.body, { title: 'kept', color: 'default' });
});
