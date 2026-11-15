import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageLabelZoom,snapUiPixel} from '../src/utils/annotationSharpness';

test('page numbers grow gently on either side of 100% and stay bounded at extreme zoom',()=>{
  assert.equal(pageLabelZoom(1),1);
  assert.equal(pageLabelZoom(.5),1.15);
  assert.equal(pageLabelZoom(1.5),1.15);
  for(const zoom of [.2,.5,.7,.99,1.01,1.5,2,10,50]) {
    assert.ok(pageLabelZoom(zoom)>1 && pageLabelZoom(zoom)<=1.35);
  }
  assert.ok(Math.abs(pageLabelZoom(.999)-pageLabelZoom(1))<.001);
  assert.equal(pageLabelZoom(NaN),1);
});

test('annotation placement can align to pixels without modifying font or icon sizes',()=>{
  for(const dpr of [1,1.25,2,3]) {
    const x=snapUiPixel(381.137,dpr);
    assert.ok(Math.abs(x*dpr-Math.round(x*dpr))<1e-9);
    assert.ok(Math.abs(x-381.137)<=.5/dpr);
  }
});
