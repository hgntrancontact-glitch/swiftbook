import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {prepareAdjacentPages,clearDocCanvasCache} from '../src/components/PDFPageView';
import {getPageRaster} from '../src/utils/pdfRasterCache';

test('adjacent pages prepare bounded native pixels, reuse cache and cancel on a new interaction',async()=>{
  const dom=new JSDOM(''),saved=new Map<string,PropertyDescriptor|undefined>();
  const globals={window:dom.window,document:dom.window.document,requestAnimationFrame:(fn:FrameRequestCallback)=>setTimeout(()=>fn(0),0),
    createImageBitmap:async(source:HTMLCanvasElement)=>({width:source.width,height:source.height,close(){}})};
  for(const [key,value] of Object.entries(globals)){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}
  dom.window.HTMLCanvasElement.prototype.getContext=function(){return {fillRect(){},drawImage(){}} as any;};
  let renders=0,cancels=0,held=false,release=()=>{};
  const pdfDoc={getPage:async()=>({getViewport:({scale}:{scale:number})=>({width:595*scale,height:842*scale}),
    render:()=>{renders++;return {promise:held?new Promise<void>(done=>release=done):Promise.resolve(),cancel(){cancels++;release();}};}})};
  const until=async(check:()=>boolean)=>{for(let i=0;i<100 && !check();i++)await new Promise(resolve=>setTimeout(resolve,2));assert.ok(check());};
  const stops:(()=>void)[]=[];
  try {
    stops.push(prepareAdjacentPages(pdfDoc,'adjacent',[2],2));
    await until(()=>!!getPageRaster('adjacent_2',pdfDoc));
    const raster=getPageRaster('adjacent_2',pdfDoc)!;
    assert.ok(raster.bitmap.width*raster.bitmap.height<=4_005_000);
    assert.ok(raster.density>1.9,'Preloading uses readable pixels instead of a 1200px thumbnail');
    stops.push(prepareAdjacentPages(pdfDoc,'adjacent',[2],2));
    await new Promise(resolve=>setTimeout(resolve,10));assert.equal(renders,1);
    held=true;const cancel=prepareAdjacentPages(pdfDoc,'adjacent',[3],2);stops.push(cancel);
    await until(()=>renders===2);cancel();await until(()=>cancels===1);
    assert.equal(getPageRaster('adjacent_3',pdfDoc),null,'Cancelled work cannot enter the cache');
  } finally {
    stops.forEach(stop=>stop());clearDocCanvasCache('adjacent');dom.window.close();
    for(const [key,descriptor] of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];
  }
});
