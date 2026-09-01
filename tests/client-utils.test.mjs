import assert from 'node:assert/strict';
import test from 'node:test';
import { hasActiveFilters, plainTextPreview, reconcileEditorSave, sortNotes } from '../lib/client-utils.ts';
import { syncDecision } from '../lib/sync-policy.ts';
import { compactOperations, sanitizeQueuedOperation } from '../lib/offline.ts';
import { noteUpdateSchema } from '../lib/validation.ts';
import { languages, missingTranslationKeys, translate } from '../lib/i18n.ts';

test('Markdown card previews do not expose formatting markers', () => {
  assert.equal(plainTextPreview('## Plan\n- [Docs](https://example.com)\n- **Ship**'), 'Plan Docs Ship');
});

test('active filters are detected', () => {
  assert.equal(hasActiveFilters({ color: 'all', label: 'all', date: 'all', reminder: 'all' }), false);
  assert.equal(hasActiveFilters({ color: 'mint', label: 'all', date: 'all', reminder: 'all' }), true);
});

function note(id, overrides = {}) {
  return {
    id, ownerId: 'user-1', assignedUserId: null, title: '', content: '', contentFormat: 'plain', type: 'text', items: [], color: 'default',
    pinned: false, archived: false, trashedAt: null, reminderAt: null, position: 0, version: 1,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', labels: [], attachments: [], ...overrides,
  };
}

test('note sorting follows the selected rule without labels affecting order', () => {
  const olderLabeled = note('older', { title: 'B', position: 1024, updatedAt: '2026-01-01T00:00:00.000Z', labels: [{ id: 'label', name: 'Work' }] });
  const newer = note('newer', { title: 'A', position: 0, updatedAt: '2026-02-01T00:00:00.000Z' });
  assert.deepEqual(sortNotes([olderLabeled, newer], 'manual', 'en').map((item) => item.id), ['newer', 'older']);
  assert.deepEqual(sortNotes([olderLabeled, newer], 'updated-desc', 'en').map((item) => item.id), ['newer', 'older']);
  assert.deepEqual(sortNotes([olderLabeled, newer], 'title-asc', 'en').map((item) => item.id), ['newer', 'older']);
});

test('an autosave response never overwrites text typed after that save started', () => {
  const localDraft = note('note-1', { content: 'newer local text', version: 3, updatedAt: '2026-02-01T00:00:01.000Z' });
  const savedResponse = note('note-1', { content: 'older saved text', version: 2, updatedAt: '2026-02-01T00:00:00.000Z' });
  const reconciled = reconcileEditorSave(localDraft, savedResponse, true);
  assert.equal(reconciled.content, 'newer local text');
  assert.equal(reconciled.version, 3);
  assert.equal(reconcileEditorSave(localDraft, savedResponse, false).content, 'older saved text');
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

test('the immutable About attribution exists in every supported language', () => {
  assert.equal(languages.length, 10);
  for (const language of languages) {
    const attribution = translate(language.value, 'about.attribution');
    assert.ok(attribution.includes('H. N. Güleroğlu'));
    assert.ok(attribution.length > 20);
  }
});

test('sorting, filtering, settings and About metadata are translated in every supported language', () => {
  const keys = ['sort.title', 'sort.updated-desc', 'filter.title', 'filter.clear', 'settings.signOut', 'about.source'];
  for (const language of languages.filter((item) => item.value !== 'en')) {
    for (const key of keys) assert.notEqual(translate(language.value, key), translate('en', key), `${language.value}: ${key}`);
  }
});

test('every registered interface message has a translation in all supported languages', () => {
  for (const language of languages) assert.deepEqual(missingTranslationKeys(language.value), [], language.value);
});
