import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canPresentRaster,canReplaceRaster,sameRasterScale} from '../src/utils/rasterPresentation';
import {rememberPageRaster,getPageRaster,clearPageRasters,getRasterCacheUsage} from '../src/utils/pdfRasterCache';

test('text PDFs and scan PDFs reject old epochs, layouts and documents at presentation time',()=>{
  for(const doc of [{kind:'text'},{kind:'scan'}]) {
    const completed={doc,page:2,scale:2.26,epoch:'7'};
    assert.equal(canPresentRaster(completed,completed,false),true);
    assert.equal(canPresentRaster(completed,completed,true),false);
    assert.equal(canPresentRaster(completed,{...completed,epoch:'8'},false),false);
    assert.equal(canPresentRaster(completed,{...completed,scale:.75},false),false);
    assert.equal(canPresentRaster(completed,{...completed,page:3},false),false);
    assert.equal(canPresentRaster(completed,{...completed,doc:{}},false),false);
  }
});

test('an old high-resolution snapshot cannot overwrite the newer final zoom-out raster',async()=>{
  const previous=globalThis.createImageBitmap;
  const pending:((bitmap:ImageBitmap)=>void)[]=[];
  Object.assign(globalThis,{createImageBitmap:()=>new Promise<ImageBitmap>(resolve=>pending.push(resolve))});
  const doc={},key='presentation-test_1';
  let oldClosed=false,newClosed=false;
  const old={width:1000,height:1000,close:()=>{oldClosed=true;}} as ImageBitmap;
  const latest={width:250,height:250,close:()=>{newClosed=true;}} as ImageBitmap;
  const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
  try {
    rememberPageRaster(key,doc,{width:1000,height:1000} as HTMLCanvasElement,4,{width:250,height:250},true);
    rememberPageRaster(key,doc,{width:250,height:250} as HTMLCanvasElement,1,{width:250,height:250},true);
    pending[1](latest);await tick();pending[0](old);await tick();
    assert.equal(getPageRaster(key,doc)?.density,1);
    assert.equal(oldClosed,true);assert.equal(newClosed,false);
    // A low-quality prefetch cannot replace that final raster.
    rememberPageRaster(key,doc,{width:125,height:125} as HTMLCanvasElement,.5,{width:250,height:250},false);
    assert.equal(pending.length,2);
    assert.equal(getRasterCacheUsage().pendingPixels,0);
  } finally {clearPageRasters('presentation-test');globalThis.createImageBitmap=previous;}
  assert.equal(newClosed,true);
});

test('prefetch cannot downgrade visible text, while a final zoom-out render may replace the old density',()=>{
  assert.equal(canReplaceRaster(.7,2,false),false);
  assert.equal(canReplaceRaster(2,.7,false),true);
  assert.equal(canReplaceRaster(1,2,true),true);
});

test('small final zoom changes are not deduplicated against an obsolete render',()=>{
  assert.equal(sameRasterScale(1,1.0005),false);
  assert.equal(sameRasterScale(1,1.0000001),true);
  const doc={},target={doc,page:2,scale:1,epoch:'8'};
  assert.equal(canPresentRaster(target,{...target,scale:1.0005},false),false);
});
