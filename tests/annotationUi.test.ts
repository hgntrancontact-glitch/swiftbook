import assert from 'node:assert/strict';
import { test } from 'node:test';
import { annotationZoom, HIGHLIGHT_TOOLBAR_SIZE, HIGHLIGHT_NOTE_SIZE, placeAnnotationToolbar, toolbarLimitsWithinPage } from '../src/utils/annotationUi';

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

test('highlight toolbar follows its anchor without flipping or shrinking during scroll at any zoom', () => {
  for (const scale of [0.5, 1, 2.53, 4]) {
    for (const top of [110, 300, 600, 900, 600, 300, 110]) {
      const moving = {...anchor, top, bottom: top + 20};
      const placed = placeAnnotationToolbar(moving, {width:288,height:360}, limits, scale, false, true, 'left');
      assert.equal(placed.above, false);
      assert.equal(placed.top, moving.bottom + 10 * scale);
      assert.equal(placed.height, 360 * scale);
    }
  }
  const atRight = placeAnnotationToolbar({ ...anchor, left: 1100, right: 1180 }, natural, limits, 1.7, false, true, 'left');
  assert.ok(atRight.left + atRight.width <= limits.right);
});

test('other annotation controls retain viewport fitting', () => {
  const placed = placeAnnotationToolbar({...anchor,top:900,bottom:920}, natural, limits, 1, false, false, 'center');
  assert.equal(placed.above,true);
  assert.ok(placed.top >= limits.top);
  assert.ok(placed.top + placed.height <= limits.bottom);
});

test('Box toolbar centres around its box, shifts within the paper and flips only to fit top/bottom limits',()=>{
  const size={width:380,height:44};
  for(const bounds of [anchor,{left:10,right:160,top:300,bottom:400},{left:1050,right:1180,top:300,bottom:400},
    {left:300,right:800,top:105,bottom:180},{left:300,right:800,top:920,bottom:980}]) {
    const placed=placeAnnotationToolbar(bounds,size,limits,1,true,false,'left',true);
    assert.ok(placed.left>=limits.left);assert.ok(placed.left+placed.width<=limits.right);
    assert.ok(placed.top>=limits.top);assert.ok(placed.top+placed.height<=limits.bottom);
    assert.equal(placed.above,bounds.top!==105);
    assert.equal(placed.left,Math.max(limits.left,Math.min(limits.right-size.width,(bounds.left+bounds.right-size.width)/2)));
  }
});

test('Box toolbar shifts continuously at PDF edges without switching abruptly between box edges',()=>{
  const viewport={left:8,right:1990,top:160,bottom:1220};
  for(const page of [{left:350,right:1640,top:250,bottom:1160},{left:550,right:1450,top:200,bottom:1200},
    {left:-400,right:2100,top:-600,bottom:2000}]) {
    const paper=toolbarLimitsWithinPage(viewport,page);
    const size={width:380,height:44};
    const threshold=paper.right-size.width;
    for(const left of [paper.left,threshold-1,threshold+1,paper.right-120]) {
      const anchor={left,right:left+100,top:350,bottom:410};
      const result=placeAnnotationToolbar(anchor,size,paper,1,true,false,'left',true);
      assert.ok(result.left>=Math.max(page.left,viewport.left));
      assert.ok(result.left+result.width<=Math.min(page.right,viewport.right));
      assert.equal(result.left,Math.max(paper.left,Math.min(paper.right-size.width,(anchor.left+anchor.right-size.width)/2)));
      const next=placeAnnotationToolbar({...anchor,left:anchor.left+1,right:anchor.right+1},size,paper,1,true,false,'left',true);
      assert.ok(Math.abs(next.left-result.left)<=1);
    }
    const above=placeAnnotationToolbar({left:paper.left,right:paper.left+100,top:paper.top+3,bottom:paper.top+70},size,paper,1,true,false,'left',true);
    assert.equal(above.above,false);assert.ok(above.top>=page.top);
  }
});
