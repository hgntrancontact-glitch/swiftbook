import assert from 'node:assert/strict';
import { test } from 'node:test';
import { horizontalPanShift } from '../src/utils/pdfViewport';

test('a fitting page stays centered regardless of wheel delta', () => {
  for (const delta of [-5000,0,5000]) assert.equal(horizontalPanShift(100,600,24,1392,delta),320);
});

test('a page translated outside native scroll bounds can reach both edges', () => {
  // Regression: the left edge was at -1100px, while native scrollLeft was 0.
  const left=-1100,width=1735,viewLeft=24,viewWidth=1392;
  const rightward=horizontalPanShift(left,width,viewLeft,viewWidth,-5000);
  assert.equal(left+rightward,viewLeft);
  const leftward=horizontalPanShift(left+rightward,width,viewLeft,viewWidth,5000);
  assert.equal(left+rightward+leftward+width,viewLeft+viewWidth);
});

test('pan is linear inside the bounds and stops at each edge', () => {
  assert.equal(horizontalPanShift(-200,1800,24,1392,30),-30);
  assert.equal(horizontalPanShift(24,1800,24,1392,-30),0);
  assert.equal(horizontalPanShift(24+1392-1800,1800,24,1392,30),0);
});

test('resizing or zooming back to fit corrects an old offset', () => {
  assert.equal(horizontalPanShift(-900,1000,24,1392,0),1120);
  assert.equal(horizontalPanShift(-900,1800,24,1392,0),516);
});
