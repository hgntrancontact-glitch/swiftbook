import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pdfDetailTile} from '../src/utils/pdfDetailTile';
import {rasterSourceDensity} from '../src/utils/pdfRasterCache';
import {rasterSampleRect,sourceCoversDensity,oversampleDetail,scaledDetailCovers} from '../src/utils/pdfRasterSampling';

test('prepared source covers ordinary pinch-in and pinch-out without another PDF render',()=>{
  const previous=globalThis.window;
  globalThis.window={devicePixelRatio:2} as Window & typeof globalThis;
  try {
    for(const page of [{width:1320,height:750},{width:595,height:842}]) {
      const density=rasterSourceDensity(page,.5);
      const source={width:Math.round(page.width*density),height:Math.round(page.height*density)};
      assert.ok(source.width*source.height<=10_000_010);
      for(const scale of [.1,.35,.5,.775,1]) {
        const tile=pdfDetailTile(page,{left:0,top:0,right:Math.min(1280,page.width*scale),bottom:Math.min(720,page.height*scale)},scale,2)!;
        assert.equal(sourceCoversDensity(source,page,tile.density),true);
        const crop=rasterSampleRect(source,page,tile,scale);
        assert.ok(Math.abs(crop.x/source.width*page.width*scale-tile.x)<1e-9);
        assert.ok(Math.abs(crop.width/source.width*page.width*scale-tile.width)<1e-9);
        assert.ok(crop.x+crop.width<=source.width+.001 && crop.y+crop.height<=source.height+.001);
      }
    }
  } finally {globalThis.window=previous;}
});

test('cached crop sampling keeps fractional PDF positions exact for native text and scan images',()=>{
  const page={width:1320,height:750},scale=2.263;
  const tile=pdfDetailTile(page,{left:450.13,top:150.71,right:1730.22,bottom:796.33},scale,2)!;
  for(const source of [{width:4195,height:2384},{width:5280,height:3000}]) {
    const crop=rasterSampleRect(source,page,tile,scale);
    assert.ok(Math.abs(crop.y/source.height*page.height*scale-tile.y)<1e-9);
    assert.ok(Math.abs(crop.height/source.height*page.height*scale-tile.height)<1e-9);
  }
  assert.equal(sourceCoversDensity({width:1320,height:750},page,4),false);
});

test('live native crops prepare bounded headroom and remain reusable as zoom grows',()=>{
  const tile=pdfDetailTile({width:1320,height:750},{left:450,top:150,right:1730,bottom:796},2,2)!;
  const ahead=oversampleDetail(tile);
  assert.ok(ahead.pixelsWide*ahead.pixelsHigh<=12_000_000);
  assert.ok(ahead.density>=tile.density);
  assert.ok(scaledDetailCovers(ahead,2,2.2,{left:600,top:220,right:1600,bottom:800},4.4));
  assert.equal(scaledDetailCovers(ahead,2,4,{left:600,top:220,right:1600,bottom:800},8),false);
});
