import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zoomPanShift,boundedPanShift} from '../src/utils/pdfViewport';

// Geometry from the user's 70% starting screenshot, with the cursor on “đen”.
const viewStart=24,viewSize=1872,initialLeft=480,initialWidth=960,cursor=600;
const local=(cursor-initialLeft)/initialWidth;
function position(zoom:number,point=local,pointer=cursor) {
  const width=initialWidth*zoom/.7;
  const desired=pointer-point*width;
  return {width,left:desired+zoomPanShift(desired,width,viewStart,viewSize)};
}

test('zooming the left-hand text from a fitting page keeps a reading gutter instead of drifting to the screen edge',()=>{
  for(const zoom of [1.46,1.88,2.42]) {
    const {left,width}=position(zoom);
    assert.equal(left,48);
    assert.ok(left+local*width>left);
  }
  assert.equal(position(.7).left,initialLeft);
  // A subsequent wheel must not re-centre a page that is only slightly wider
  // than the reading area (viewport minus the two edge gutters).
  const width=1830,left=48;
  assert.equal(boundedPanShift(left,width,viewStart,viewSize,0,left),0);
});

test('zoom placement depends on the original target, not the number or direction of intermediate ticks',()=>{
  const paths=[[.7,1.88],[.7,.9,1.1,1.3,1.46,1.88],[.7,2.42,1.88]];
  for(const path of paths) {
    let last=position(path[0]);
    for(const zoom of path.slice(1)) last=position(zoom);
    assert.deepEqual(last,position(1.88));
    // The final layout uses the displayed anchor, not the unclamped cursor
    // target: committing the same page width must leave its position unchanged.
    const displayed=(cursor-last.left)/last.width;
    assert.equal(cursor-displayed*last.width,last.left);
  }
});

test('fit boundary is continuous, with mirrored gutters and exact cursor anchoring away from edges',()=>{
  const fit=(viewSize-48)/initialWidth*.7;
  const before=position(fit-1e-6),after=position(fit+1e-6);
  assert.ok(Math.abs(before.left-after.left)<.002);
  for(const zoom of [.7,1.3,1.46,1.88,2.42]) {
    const left=position(zoom),right=position(zoom,1-local,1920-cursor);
    assert.ok(Math.abs(left.left-(1920-right.left-right.width))<1e-9);
  }
  const center=position(1.88,.5,960);
  assert.equal(center.left+.5*center.width,960);
  // Same finite, symmetric rule on the vertical axis.
  assert.equal(zoomPanShift(300,1500,16,900),-260);
  assert.equal(zoomPanShift(-700,1500,16,900),92);
});
