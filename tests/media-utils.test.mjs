import assert from 'node:assert/strict';
import test from 'node:test';
import { audioFilenameExtension, baseMimeType, preferredAudioRecordingMime } from '../lib/media-utils.ts';

test('audio MIME codec parameters are normalized before upload validation', () => {
  assert.equal(baseMimeType('audio/webm;codecs=opus'), 'audio/webm');
  assert.equal(baseMimeType('audio/mp4; codecs=mp4a.40.2'), 'audio/mp4');
  assert.equal(baseMimeType('audio/x-m4a'), 'audio/mp4');
  assert.equal(baseMimeType('audio/x-wav'), 'audio/wav');
  assert.equal(baseMimeType('application/x-unsafe'), 'application/x-unsafe');
});

test('recording selects the first browser-supported format and matching extension', () => {
  assert.equal(preferredAudioRecordingMime((type) => type === 'audio/webm;codecs=opus'), 'audio/webm;codecs=opus');
  assert.equal(preferredAudioRecordingMime(() => false), '');
  assert.equal(audioFilenameExtension('audio/mp4;codecs=mp4a.40.2'), 'm4a');
  assert.equal(audioFilenameExtension('audio/ogg;codecs=opus'), 'ogg');
});
