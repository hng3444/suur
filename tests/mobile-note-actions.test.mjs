import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMobileNote,
  createNoteOperation,
  replaceLocalNote,
  sortMobileNotes,
  visibleMobileNotes,
  mergeMobileDraft,
} from '../lib/mobile-note-actions.ts';
import { createEmptyMobileState } from '../lib/mobile-sync.ts';

test('mobile note creation uses stable client ids and queues a matching create', () => {
  const state = createEmptyMobileState('server-1', 'user-1');
  const note = createMobileNote(state, 'checklist');
  const operation = createNoteOperation(note);
  assert.match(note.id, /^note_[a-f0-9-]{36}$/);
  assert.equal(note.ownerId, 'user-1');
  assert.equal(note.items.length, 1);
  assert.equal(operation.method, 'POST');
  assert.equal(operation.body.id, note.id);
});

test('saving an editor draft retains uploaded files and unrelated remote changes', () => {
  const original = createMobileNote(createEmptyMobileState('server', 'user'));
  const latest = { ...original, version: 4, pinned: true, attachments: [{ id: 'upload' }] };
  const result = mergeMobileDraft(latest, { ...original, content: 'Typed during upload' }, original);
  assert.equal(result.content, 'Typed during upload');
  assert.equal(result.pinned, true);
  assert.equal(result.version, 4);
  assert.deepEqual(result.attachments, [{ id: 'upload' }]);
});

test('conflicting text keeps the old base version for safe conflict preservation', () => {
  const original = { ...createMobileNote(createEmptyMobileState('server', 'user')), content: 'Before' };
  const result = mergeMobileDraft({ ...original, version: 8, content: 'Remote edit' }, { ...original, content: 'Local edit' }, original);
  assert.equal(result.version, original.version);
  assert.equal(result.content, 'Local edit');
});

test('local replacement retains the server version used for conflict checks', () => {
  const state = createEmptyMobileState('server-1', 'user-1');
  const note = { ...createMobileNote(state), version: 7, title: 'Before' };
  const withNote = replaceLocalNote(state, note);
  const changed = replaceLocalNote(withNote, { ...note, title: 'After' });
  assert.equal(changed.notes[0].version, 7);
  assert.equal(changed.notes[0].title, 'After');
});

test('mobile views filter archived and trashed notes before sorting them', () => {
  const state = createEmptyMobileState('server-1', 'user-1');
  const active = { ...createMobileNote(state), id: 'active', title: 'Active', position: 10 };
  const pinned = { ...active, id: 'pinned', title: 'Pinned', pinned: true, position: 20 };
  const archived = { ...active, id: 'archived', title: 'Archive', archived: true };
  const trashed = { ...active, id: 'trashed', title: 'Trash', trashedAt: new Date().toISOString() };
  const full = { ...state, notes: [archived, active, trashed, pinned] };
  assert.deepEqual(sortMobileNotes(visibleMobileNotes(full, 'notes', ''), 'manual').map((note) => note.id), ['pinned', 'active']);
  assert.deepEqual(visibleMobileNotes(full, 'archive', '').map((note) => note.id), ['archived']);
  assert.deepEqual(visibleMobileNotes(full, 'trash', 'trash').map((note) => note.id), ['trashed']);
});
