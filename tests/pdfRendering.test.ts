import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialRasterDensity, rasterDensity } from '../src/utils/pdfRasterCache';
import { continuousRenderWindow } from '../src/utils/pdfViewport';

test('a large retina page gets a cheaper first frame and keeps its final quality target', () => {
  const previous = globalThis.window;
  globalThis.window = { devicePixelRatio: 2 } as Window & typeof globalThis;
  try {
    const size = { width: 1200, height: 1700 };
    const final = rasterDensity(size, 1);
    const first = initialRasterDensity(size, 1);
    assert.ok(first < final);
    assert.ok(size.width * size.height * first * first <= 1_500_001);
    assert.equal(rasterDensity(size, 1), 2);
    const ordinary = { width: 595, height: 842 };
    assert.equal(initialRasterDensity(ordinary, 0.5), rasterDensity(ordinary, 0.5));
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
