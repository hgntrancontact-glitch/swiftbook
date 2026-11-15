import {test} from 'node:test';
import assert from 'node:assert/strict';
import {presentDetailSample} from '../src/utils/pdfDetailSurface';
import {pdfDetailTile} from '../src/utils/pdfDetailTile';
import {detailSampleRect,oversampleDetail,clipDetailTile,scaledDetailCovers} from '../src/utils/pdfRasterSampling';

function surface(id:number,events:string[]) {
  const style:Record<string,any>={display:'none',visibility:'hidden',setProperty(key:string,value:string){this[key]=value;events.push(`geometry-${id}`);}};
  const context={imageSmoothingEnabled:false,imageSmoothingQuality:'low',drawImage(){events.push(`draw-${id}`);}};
  return new Proxy({width:1,height:1,style:new Proxy(style,{set(target,key,value){events.push(`${String(key)}-${id}-${value}`);target[String(key)]=value;return true;}}),getContext:()=>context},
    {set(target,key,value){events.push(`resize-${id}-${String(key)}`);(target as any)[key]=value;return true;}}) as unknown as HTMLCanvasElement;
}

test('pinch samples never clear the visible buffer and swap only after pixels and geometry are ready',()=>{
  const events:string[]=[],canvases=[surface(0,events),surface(1,events)];
  const source={width:4000,height:6000} as HTMLCanvasElement;
  let front=-1;
  for(const scale of [1,1.1,1.5,2.42,1.3,.7,.2]) {
    const tile=pdfDetailTile({width:595,height:842},{left:0,top:0,right:Math.min(1200,595*scale),bottom:Math.min(800,842*scale)},scale,2)!;
    events.length=0;const old=front;
    front=presentDetailSample(canvases,front,source,{x:0,y:0,width:source.width,height:source.height},tile,scale);
    if(old>=0) assert.ok(!events.some(event=>event.startsWith(`resize-${old}`)));
    const shown=events.indexOf(`visibility-${front}-visible`);
    assert.ok(events.indexOf(`draw-${front}`)<shown);
    assert.ok(events.lastIndexOf(`geometry-${front}`)<shown);
    if(old>=0) assert.ok(shown<events.indexOf(`visibility-${old}-hidden`));
    // Moving from committed scale=1/live=scale to committed=scale/live=1
    // leaves all four screen coordinates identical, without a new sample.
    for(const [key,value] of Object.entries({left:tile.x,top:tile.y,width:tile.width,height:tile.height})) {
      const pdf=parseFloat((canvases[front].style as any)[key].slice(5));
      assert.ok(Math.abs(pdf*1*scale-value)<1e-9);
      assert.ok(Math.abs(pdf*scale*1-value)<1e-9);
    }
  }
});

test('retained native detail can be resampled after zoom-out without moving PDF text',()=>{
  const page={width:1320,height:750};
  const prepared=oversampleDetail(pdfDetailTile(page,{left:200,top:100,right:1600,bottom:900},2,2)!);
  const source={width:prepared.pixelsWide,height:prepared.pixelsHigh};
  const tile=pdfDetailTile(page,{left:200,top:150,right:1000,bottom:600},1.5,2)!;
  const crop=detailSampleRect(source,prepared,2,tile,1.5);
  const pdfX=prepared.x/2+crop.x/source.width*prepared.width/2;
  const pdfY=prepared.y/2+crop.y/source.height*prepared.height/2;
  assert.ok(Math.abs(pdfX*1.5-tile.x)<1e-9);
  assert.ok(Math.abs(pdfY*1.5-tile.y)<1e-9);
  assert.ok(Math.abs(crop.width/source.width*prepared.width/2*1.5-tile.width)<1e-9);
});

test('crossing an overscan grid boundary reuses a sharp crop when visible content remains covered',()=>{
  const prepared={x:128,y:128,width:1408,height:896,density:6,pixelsWide:4224,pixelsHigh:2688};
  const scale=2.2,visible={left:210,top:210,right:1550,bottom:950};
  const tile=pdfDetailTile({width:1320,height:750},visible,scale,2)!;
  assert.ok(scaledDetailCovers(prepared,2,scale,visible,tile.density));
  const clipped=clipDetailTile(tile,prepared,2,scale);
  assert.ok(clipped.x<=visible.left && clipped.y<=visible.top);
  assert.ok(clipped.x+clipped.width>=visible.right && clipped.y+clipped.height>=visible.bottom);
  const source={width:prepared.pixelsWide,height:prepared.pixelsHigh};
  const crop=detailSampleRect(source,prepared,2,clipped,scale);
  assert.ok(crop.x>=-1e-9 && crop.y>=-1e-9);
  assert.ok(crop.x+crop.width<=source.width+1e-9 && crop.y+crop.height<=source.height+1e-9);
});
