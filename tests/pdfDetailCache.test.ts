import {test} from 'node:test';
import assert from 'node:assert/strict';
import {retainPageDetail,takePageDetail,clearPageDetails,detailCacheRevision} from '../src/utils/pdfDetailCache';

test('native crops transfer across mode changes within a pixel budget; eviction and document closure never invalidate a live lease',()=>{
  const doc={};
  const crop=()=>({canvas:{width:2000,height:2000} as HTMLCanvasElement,scale:2,final:true,
    tile:{x:0,y:0,width:1000,height:1000,density:2,pixelsWide:2000,pixelsHigh:2000}});
  const one=crop(),two=crop(),three=crop(),four=crop();
  try {
    retainPageDetail('crop-cache_1',doc,one);
    assert.equal(takePageDetail('crop-cache_1',doc),one); // ownership leaves the cache
    retainPageDetail('crop-cache_2',doc,two);retainPageDetail('crop-cache_3',doc,three);retainPageDetail('crop-cache_4',doc,four);
    const extra=crop();retainPageDetail('crop-cache_5',doc,extra);
    assert.equal(two.canvas.width,1);assert.equal(one.canvas.width,2000); // live source cannot be evicted
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
