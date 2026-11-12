import assert from 'node:assert/strict';
import { test } from 'node:test';
import { horizontalPanShift, boundedPanShift, settledPanShift, SPREAD_GAP, CONTINUOUS_GAP } from '../src/utils/pdfViewport';

test('a fitting page moves gradually toward centre only on a wheel', () => {
  assert.equal(horizontalPanShift(100,600,24,1392,0),0);
  assert.equal(horizontalPanShift(100,600,24,1392,-30),30);
  assert.equal(horizontalPanShift(100,600,24,1392,30),0);
  assert.equal(horizontalPanShift(100,600,24,1392,-5000),320);
});

test('fitting pages lock pan and zoom-out settlement restores their centre on either axis', () => {
  for (const [start,size,view,extent] of [[-900,600,0,1200],[150,300,24,600]]) {
    assert.equal(start+boundedPanShift(start,size,view,extent,10000),view+(extent-size)/2);
    assert.equal(start+boundedPanShift(start,size,view,extent,-10000),view+(extent-size)/2);
    const shift=settledPanShift(start,size,view,extent,true);
    assert.equal(start+shift,view+(extent-size)/2);
    assert.equal(start+settledPanShift(start,size,view,extent,false),view+(extent-size)/2);
  }
});

test('oversized pages reach both edges with only a small fixed gutter, including old excessive offsets', () => {
  for (const [size,extent] of [[1800,1200],[900,600]]) {
    const start=-900;
    const left=start+boundedPanShift(start,size,24,extent,10000);
    const right=left+boundedPanShift(left,size,24,extent,-10000);
    assert.equal(left,24+extent-size-24);
    assert.equal(right,48);
    assert.equal(boundedPanShift(right,size,24,extent,-1),0);
    assert.equal(boundedPanShift(left,size,24,extent,1),0);
  }
});

test('page gaps remain small screen dimensions independently of committed zoom', () => {
  assert.equal(SPREAD_GAP,6);
  assert.equal(CONTINUOUS_GAP,8);
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
