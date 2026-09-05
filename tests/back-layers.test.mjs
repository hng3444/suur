import test from 'node:test';
import assert from 'node:assert/strict';
import { BackLayers } from '../lib/back-layers.ts';

test('back closes panel, then editor, then viewer; one guard only', async () => {
  let pushes = 0;
  let backs = 0;
  const closed = [];
  const layers = new BackLayers({ push: () => pushes++, back: () => backs++ });
  const viewer = layers.add(20, () => { closed.push('viewer'); viewer(); });
  const editor = layers.add(30, () => { closed.push('editor'); editor(); });
  const panel = layers.add(40, () => { closed.push('panel'); panel(); });
  assert.equal(pushes, 1);
  layers.popped();
  layers.popped();
  layers.popped();
  await Promise.resolve();
  assert.deepEqual(closed, ['panel', 'editor', 'viewer']);
  assert.equal(backs, 1);
  layers.popped(); // The guard cleanup must not close another surface.
  assert.equal(closed.length, 3);
});

test('failed saves keep the editor guarded and StrictMode does not duplicate history', async () => {
  let pushes = 0;
  let backs = 0;
  let attempts = 0;
  const layers = new BackLayers({ push: () => pushes++, back: () => backs++ });
  layers.add(30, () => {})();
  const remove = layers.add(30, () => attempts++);
  await Promise.resolve();
  assert.equal(pushes, 1);
  assert.equal(backs, 0);
  layers.popped(); layers.popped();
  assert.equal(attempts, 2);
  assert.equal(backs, 0);
  remove();
  await Promise.resolve();
  assert.equal(backs, 1);
});
