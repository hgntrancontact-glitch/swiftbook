import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rasterDensity } from '../src/utils/pdfRasterCache';
import { continuousRenderWindow } from '../src/utils/pdfViewport';

test('retina pages retain the final quality target within the canvas memory bound', () => {
  const previous = globalThis.window;
  globalThis.window = { devicePixelRatio: 2 } as Window & typeof globalThis;
  try {
    const size = { width: 1200, height: 1700 };
    assert.equal(rasterDensity(size, 1), 2);
    assert.ok(size.width * size.height * rasterDensity(size, 5) ** 2 <= 10_000_001);
  } finally { globalThis.window = previous; }
});

test('reading through 416 pages does not retain every visited canvas', () => {
  let mounted = new Set<number>();
  for (let current = 1; current <= 416; current++) {
    mounted = continuousRenderWindow([current - 2, current - 1, current, current + 1, current + 2], current, 416);
    assert.ok(mounted.size <= 5);
    assert.ok(mounted.has(current));
  }
  assert.equal(mounted.has(1), false);
  const pinned = continuousRenderWindow([53, 54, 55], 54, 416, [1]);
  assert.ok(pinned.has(1));
  assert.ok(pinned.has(54));
});
