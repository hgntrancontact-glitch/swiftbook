import {test} from 'node:test';
import assert from 'node:assert/strict';
import {retainPageDetail,takePageDetail,clearPageDetails,detailCacheRevision,takePageDetailPreview,retainPageDetailPreview} from '../src/utils/pdfDetailCache';

test('native crops transfer across mode changes within a pixel budget; eviction and document closure never invalidate a live lease',()=>{
  const doc={};
  const crop=()=>({canvas:{width:3000,height:3000} as HTMLCanvasElement,scale:3,final:true,
    tile:{x:0,y:0,width:1000,height:1000,density:3,pixelsWide:3000,pixelsHigh:3000}});
  const one=crop(),two=crop(),three=crop(),four=crop();
  try {
    retainPageDetail('crop-cache_1',doc,one);
    assert.equal(takePageDetail('crop-cache_1',doc),one); // ownership leaves the cache
    retainPageDetail('crop-cache_2',doc,two);retainPageDetail('crop-cache_3',doc,three);retainPageDetail('crop-cache_4',doc,four);
    const extra=crop();retainPageDetail('crop-cache_5',doc,extra);
    assert.equal(two.canvas.width,1);assert.equal(one.canvas.width,3000); // live source cannot be evicted
    assert.equal(takePageDetail('crop-cache_4',{}),null);assert.equal(four.canvas.width,1);
    const revision=detailCacheRevision('crop-cache_1');
    clearPageDetails('crop-cache');
    assert.equal(three.canvas.width,1);assert.equal(extra.canvas.width,1);
    retainPageDetail('crop-cache_1',doc,one,revision); // unmount after close cannot resurrect the cache
    assert.equal(one.canvas.width,1);assert.equal(takePageDetail('crop-cache_1',doc),null);
    const headroom={...crop(),final:false};retainPageDetail('crop-cache_6',doc,headroom);
    assert.equal(takePageDetail('crop-cache_6',doc),headroom); // completed gesture source survives remount without a replay
    headroom.canvas.width=headroom.canvas.height=1;
  } finally {clearPageDetails('crop-cache');}
});

test('recent sharp pages use the rebalanced cache instead of being discarded after three visits',()=>{
  const doc={},values=Array.from({length:5},()=>({canvas:{width:2000,height:2000} as HTMLCanvasElement,scale:2,final:true,
    tile:{x:0,y:0,width:1000,height:1000,density:2,pixelsWide:2000,pixelsHigh:2000}}));
  try {
    values.forEach((detail,index)=>retainPageDetail(`recent-cache_${index}`,doc,detail));
    values.forEach((detail,index)=>assert.equal(takePageDetail(`recent-cache_${index}`,doc),detail));
  } finally {clearPageDetails('recent-cache');}
});

test('an evicted native page retains a bounded crop preview without treating it as a sharp source or reviving closed documents',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'document');
  const canvas=(width:number,height:number)=>({width,height,getContext:()=>({drawImage(){}})} as unknown as HTMLCanvasElement);
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>canvas(1,1)}});
  const doc={},crop=(width:number,height:number)=>({canvas:canvas(width,height),scale:1,final:true,
    tile:{x:0,y:0,width:width/2,height:height/2,density:2,pixelsWide:width,pixelsHigh:height}});
  try {
    const first=crop(1000,3000);retainPageDetail('preview-cache_1',doc,first);
    for(let i=2;i<=4;i++)retainPageDetail(`preview-cache_${i}`,doc,crop(2000,4000));
    assert.equal(first.canvas.width,1);assert.equal(takePageDetail('preview-cache_1',doc),null);
    const preview=takePageDetailPreview('preview-cache_1',doc)!;assert.ok(preview);
    assert.equal(preview.canvas.width,300);assert.equal(preview.canvas.height,900);
    assert.equal(preview.tile.density,.6);assert.equal(preview.final,false);
    const revision=detailCacheRevision('preview-cache_1');clearPageDetails('preview-cache');
    assert.equal(preview.canvas.width,300,'A taken preview has a live lease');
    retainPageDetailPreview('preview-cache_1',doc,preview,revision);
    assert.equal(preview.canvas.width,1);assert.equal(takePageDetailPreview('preview-cache_1',doc),null);
  } finally {clearPageDetails('preview-cache');if(descriptor)Object.defineProperty(globalThis,'document',descriptor);else delete (globalThis as any).document;}
});
