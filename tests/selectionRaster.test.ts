import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rasterImageSelectionLines, type RasterSelectionImage, beginLineGesture, moveLineGesture, lineSelectionRects } from '../src/utils/selectionLines';

test('scan projection works without DOM/main-thread canvas APIs and caches each column',()=> {
  const width=400,height=600,pixels=new Uint8ClampedArray(width*height*4).fill(255);
  for(const baseline of [110,130,150]) for(let x=40;x<360;x++) if(x%6<3)
    for(let dy=0;dy<10;dy++) {
      const y=Math.round(baseline-.012*(x-40))-dy,i=(y*width+x)*4;
      pixels[i]=pixels[i+1]=pixels[i+2]=0;
    }
  const image:RasterSelectionImage={key:'scan',width,height,pixels,fits:new Map(),slopes:new Map()};
  const rows=rasterImageSelectionLines(image,.5,.5,14/height,true);
  assert.equal(rows.length,3);
  assert.ok(rows.every(r=>r.height-Math.abs(r.rise||0)<12/height));
  assert.equal(rasterImageSelectionLines(image,.5,.2,14/height,true),rows);
  const first=rows[0],last=rows[2];
  const a=beginLineGesture(rows,.2,first.y+first.height/2,.02);
  moveLineGesture(a,last.y+last.height/2,.7);
  const b=beginLineGesture(rows,.7,last.y+last.height/2,.02);
  moveLineGesture(b,first.y+first.height/2,.2);
  assert.deepEqual(lineSelectionRects(a,.2,.7),lineSelectionRects(b,.7,.2));
});
