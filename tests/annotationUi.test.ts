import assert from 'node:assert/strict';
import { test } from 'node:test';
import { annotationZoom, HIGHLIGHT_TOOLBAR_SIZE, HIGHLIGHT_NOTE_SIZE, placeAnnotationToolbar } from '../src/utils/annotationUi';

const anchor = { left: 300, right: 800, top: 300, bottom: 320 };
const limits = { left: 8, right: 1192, top: 100, bottom: 1000 };
const natural = { width: 288, height: 94 };

test('highlight toolbar and note grow with 50%, 100%, 200% zoom instead of keeping screen size', () => {
  const placements = [0.5, 1, 2].map(userZoom => {
    const zoom = annotationZoom(userZoom, 600 * userZoom, 600 * userZoom);
    return { toolbar: placeAnnotationToolbar(anchor, natural, limits, zoom * HIGHLIGHT_TOOLBAR_SIZE, false, true, 'left'),
      noteWidth: 224 * HIGHLIGHT_NOTE_SIZE * zoom };
  });
  assert.ok(placements[1].toolbar.width < natural.width);
  assert.equal(placements[0].toolbar.width * 2, placements[1].toolbar.width);
  assert.equal(placements[1].toolbar.width * 2, placements[2].toolbar.width);
  assert.equal(placements[0].noteWidth * 2, placements[1].noteWidth);
  assert.equal(placements[1].noteWidth * 2, placements[2].noteWidth);
  for (const { toolbar } of placements) {
    assert.equal(toolbar.left, anchor.left);
    assert.equal(toolbar.top, anchor.bottom + toolbar.gap);
  }
});

test('fit-to-page layout and committing a live pinch do not change the UI zoom reference', () => {
  assert.equal(annotationZoom(1, 420, 420), 1);
  assert.equal(annotationZoom(1, 900, 600), annotationZoom(1.5, 900, 900));
  assert.equal(annotationZoom(Number.NaN, 0, 0), 1);
});

test('a scaled toolbar stays within the right edge and scrolls long editing content above its anchor', () => {
  const atRight = placeAnnotationToolbar({ ...anchor, left: 1100, right: 1180 }, natural, limits, 1.7, false, true, 'left');
  assert.ok(atRight.left + atRight.width <= limits.right);
  const tall = placeAnnotationToolbar({ ...anchor, top: 400, bottom: 420 }, { width: 288, height: 360 },
    { ...limits, bottom: 700 }, 2, false, true, 'left');
  assert.equal(tall.above, true);
  assert.equal(tall.top, limits.top);
  assert.equal(tall.top + tall.height + tall.gap, 400);
  assert.equal(tall.maxHeight! * 2, tall.height);
});
