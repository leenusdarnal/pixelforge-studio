import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateSnapshotBytes, MAX_HISTORY_BYTES, MAX_HISTORY_ENTRIES } from '../src/lib/editor/history.js';

test('estimates snapshot size from image and mask payloads', () => {
  const snapshot = { layers: [{ data: 'a'.repeat(100), maskData: 'b'.repeat(20) }, { data: 'c'.repeat(80) }] };
  assert.equal(estimateSnapshotBytes(snapshot), 150);
});

test('returns zero for a missing or malformed snapshot', () => {
  assert.equal(estimateSnapshotBytes(null), 0);
  assert.equal(estimateSnapshotBytes({}), 0);
});

test('uses bounded history limits', () => {
  assert.equal(MAX_HISTORY_BYTES, 150 * 1024 * 1024);
  assert.equal(MAX_HISTORY_ENTRIES, 24);
});
