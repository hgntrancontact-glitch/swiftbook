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

test('zoom release requires a native final raster even when the cached preview is high resolution',async()=>{
  const {needsFinalDetailRender}=await import('../src/utils/pdfRasterSampling');
  const visible={left:0,top:0,right:600,bottom:700};
  const tile=pdfDetailTile({width:595,height:842},visible,1.5,2)!;
  const preview={tile:oversampleDetail(tile),scale:1.5,final:false};
  assert.equal(needsFinalDetailRender(preview,1.5,visible,3,true),false);
  assert.equal(needsFinalDetailRender(preview,1.5,visible,3,false),true);
  assert.equal(needsFinalDetailRender({...preview,final:true},1.5,visible,3,false),false);
  assert.equal(needsFinalDetailRender({...preview,final:true},.9,visible,1.8,false),true);
  assert.equal(needsFinalDetailRender(null,1.5,visible,3,false),true);
});

test('final PDF canvas has whole device pixels without shifting the selected PDF point',async()=>{
  const {alignDetailTile}=await import('../src/utils/pdfRasterSampling');
  for(const scale of [.35,.7,1,1.88,2.42]) for(const dpr of [1,2]) {
    const page={width:1320,height:750},left=48.137,top=-183.213;
    const tile=pdfDetailTile(page,{left:0,top:200,right:Math.min(1200,page.width*scale),bottom:Math.min(700,page.height*scale)},scale,dpr);
    if(!tile) continue;
    const aligned=alignDetailTile(tile,left,top,scale),pixels=aligned.density/scale;
    assert.ok(Math.abs((left+aligned.x)*pixels-Math.round((left+aligned.x)*pixels))<1e-9);
    assert.ok(Math.abs((top+aligned.y)*pixels-Math.round((top+aligned.y)*pixels))<1e-9);
    assert.ok(Math.abs(aligned.width*pixels-aligned.pixelsWide)<1e-9);
    // Rendering the fractional local offset into the buffer, then placing it,
    // recovers the unchanged page position of a text baseline.
    const pdfY=315;
    const rasterY=(pdfY*scale-aligned.y)*pixels;
    assert.ok(Math.abs(top+aligned.y+rasterY/pixels-(top+pdfY*scale))<1e-9);
  }
});

test('native final text and scanned-image crops are copied at 1:1 even across fractional overscan boundaries',async()=>{
  const {alignDetailTile,preparedDetailSample,needsFinalDetailRender}=await import('../src/utils/pdfRasterSampling');
  for(const scale of [.35,.7,1.23456789,2.263,4]) for(const dpr of [1,2]) {
    const page={width:1320,height:1750};
    const visible={left:0,top:30,right:Math.min(900,page.width*scale),bottom:Math.min(700,page.height*scale)};
    const tile=alignDetailTile(pdfDetailTile(page,visible,scale,dpr)!,48.137,-183.213,scale);
    const prepared={tile,scale,final:true},source={width:tile.pixelsWide,height:tile.pixelsHigh};
    const moved=alignDetailTile(pdfDetailTile(page,visible,scale,dpr)!,48.321,-183.737,scale);
    const sample=preparedDetailSample(source,prepared,moved,scale);
    assert.deepEqual(sample.tile,tile);
    assert.deepEqual(sample.crop,{x:0,y:0,width:source.width,height:source.height});
    assert.equal(needsFinalDetailRender(prepared,scale,visible,tile.density,false),false);
    // Even a small final zoom difference requires a fresh raster, not a stale
    // result accepted by the old 0.005 scale tolerance.
    assert.equal(needsFinalDetailRender(prepared,scale+.001,visible,tile.density,false),true);
  }
});

test('floating-point coverage of the same page edge does not trigger endless final rendering',async()=>{
  const {needsFinalDetailRender,preparedDetailSample}=await import('../src/utils/pdfRasterSampling');
  const tile={x:0,y:0,width:595*.7,height:842*.7,density:1.4,pixelsWide:833,pixelsHigh:1179};
  const visible={left:0,top:0,right:416.5+1e-12,bottom:589.4+1e-12};
  const prepared={tile,scale:.7,final:true};
  assert.equal(needsFinalDetailRender(prepared,.7,visible,1.4,false),false);
  assert.equal(needsFinalDetailRender(prepared,.7,{...visible,right:417},1.4,false),true);
  // A final crop from a previous zoom is still resampled only as a preview.
  const next={...tile,width:300,height:400,pixelsWide:600,pixelsHigh:800,density:1};
  const sample=preparedDetailSample({width:833,height:1179},prepared,next,.5);
  assert.notDeepEqual(sample.crop,{x:0,y:0,width:833,height:1179});
});
