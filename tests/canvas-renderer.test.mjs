import test from 'node:test';
import assert from 'node:assert/strict';
import { getPaintTarget, getRenderedLayerCanvas, invalidateCanvasComposite } from '../src/lib/editor/canvasRenderer.js';

function createCanvas(width = 0, height = 0) {
  const calls = [];
  const context = {
    globalCompositeOperation: 'source-over',
    clearRect: (...args) => calls.push(['clearRect', ...args]),
    drawImage: (...args) => calls.push(['drawImage', ...args])
  };
  return { width, height, calls, getContext: () => context };
}

test('returns source canvas when no mask exists', () => {
  const canvas = createCanvas(20, 10);
  assert.equal(getRenderedLayerCanvas({ canvas }, 20, 10), canvas);
});

test('composites mask once, reuses cache and invalidates on demand', () => {
  const canvas = createCanvas(20, 10), mask = createCanvas(20, 10), composite = createCanvas();
  const original = globalThis.document;
  globalThis.document = { createElement: () => composite };
  try {
    const layer = { canvas, mask, _maskCompositeDirty: true };
    assert.equal(getRenderedLayerCanvas(layer, 20, 10), composite);
    assert.equal(layer._maskCompositeDirty, false);
    assert.deepEqual(composite.calls.map(call => call[0]), ['clearRect', 'drawImage', 'drawImage']);
    composite.calls.length = 0;
    getRenderedLayerCanvas(layer, 20, 10);
    assert.equal(composite.calls.length, 0);
    invalidateCanvasComposite(layer);
    getRenderedLayerCanvas(layer, 20, 10);
    assert.equal(composite.calls.length, 3);
  } finally {
    if (original === undefined) delete globalThis.document;
    else globalThis.document = original;
  }
});

test('recreates mask cache when document dimensions change', () => {
  const created = [], original = globalThis.document;
  globalThis.document = { createElement: () => { const canvas = createCanvas(); created.push(canvas); return canvas; } };
  try {
    const layer = { canvas: createCanvas(20, 10), mask: createCanvas(20, 10) };
    getRenderedLayerCanvas(layer, 20, 10);
    getRenderedLayerCanvas(layer, 40, 20);
    assert.equal(created.length, 2);
    assert.equal(created[1].width, 40);
    assert.equal(created[1].height, 20);
  } finally {
    if (original === undefined) delete globalThis.document;
    else globalThis.document = original;
  }
});

test('selects mask only while editing the mask', () => {
  const canvas = createCanvas(), mask = createCanvas();
  assert.equal(getPaintTarget({ canvas, mask, editMask: true }), mask);
  assert.equal(getPaintTarget({ canvas, mask, editMask: false }), canvas);
  assert.equal(getPaintTarget({ canvas, editMask: true }), canvas);
});
