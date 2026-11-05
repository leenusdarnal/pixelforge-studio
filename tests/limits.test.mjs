import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_DOCUMENT_PIXELS, MAX_DOCUMENT_SIDE, fitWithinDocumentLimit, isAllowedDocumentSize } from '../static/legacy/limits.js';

test('accepts common document dimensions within the target', () => {
  assert.equal(isAllowedDocumentSize(1920, 1080), true);
  assert.equal(isAllowedDocumentSize(4000, 6000), true);
});

test('rejects documents above the 24 MP target or side limit', () => {
  assert.equal(isAllowedDocumentSize(5000, 5000), false);
  assert.equal(isAllowedDocumentSize(7000, 1000), false);
  assert.equal(isAllowedDocumentSize(0, 100), false);
});

test('scales imported images proportionally into the target', () => {
  const fitted = fitWithinDocumentLimit(8000, 6000);
  assert.equal(fitted.scaled, true);
  assert.ok(fitted.width <= MAX_DOCUMENT_SIDE && fitted.height <= MAX_DOCUMENT_SIDE);
  assert.ok(fitted.width * fitted.height <= MAX_DOCUMENT_PIXELS);
  assert.ok(Math.abs(fitted.width / fitted.height - 8000 / 6000) < 0.001);
});

test('keeps a document unchanged when already within the target', () => {
  assert.deepEqual(fitWithinDocumentLimit(3000, 4000), { width: 3000, height: 4000, scaled: false });
});
