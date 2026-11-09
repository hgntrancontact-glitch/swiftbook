import assert from 'node:assert/strict';
import { test } from 'node:test';
import { horizontalPanShift, boundedPanShift } from '../src/utils/pdfViewport';

test('a fitting page moves gradually toward centre only on a wheel', () => {
  assert.equal(horizontalPanShift(100,600,24,1392,0),0);
  assert.equal(horizontalPanShift(100,600,24,1392,-30),30);
  assert.equal(horizontalPanShift(100,600,24,1392,30),0);
  assert.equal(horizontalPanShift(100,600,24,1392,-5000),320);
});

test('both pan axes allow a fitting document to be repositioned within a finite gutter', () => {
  for (const [start,size,view,extent] of [[300,600,0,1200],[150,300,0,600]]) {
    const forward=boundedPanShift(start,size,view,extent,10000);
    const back=boundedPanShift(start+forward,size,view,extent,-10000);
    assert.ok(forward<0 && back>0);
    assert.ok(back<=240);
    assert.equal(boundedPanShift(start+forward,size,view,extent,10000),0);
    assert.equal(boundedPanShift(start+forward+back,size,view,extent,-10000),0);
  }
});

test('an offscreen zoom anchor can return into the pan range without being pushed farther away', () => {
  assert.equal(boundedPanShift(-900,600,0,1200,100),0);
  assert.equal(boundedPanShift(-900,600,0,1200,-100),100);
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

test('a cursor-anchored offset is not snapped when a gesture ends', () => {
  assert.equal(horizontalPanShift(-900,1000,24,1392,0),0);
  assert.equal(horizontalPanShift(-900,1800,24,1392,0),0);
  assert.equal(horizontalPanShift(-900,1800,24,1392,-30),30);
});
