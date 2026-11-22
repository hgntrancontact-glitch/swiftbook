import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {PDFDetailTile,clearDocCanvasCache} from '../src/components/PDFPageView';

test('slow PDF work survives fractional scrolling and resize; the last zoom and pixel grid win without a blank swap',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});
  const saved=new Map<string,PropertyDescriptor|undefined>(),frames=new Map<number,FrameRequestCallback>();
  let serial=0,top=20,left=30,scale=1,width=1200,ready=0;
  const jobs:{scale:number;resolve:()=>void;cancelled:boolean}[]=[];
  const globals={window:dom.window,document:dom.window.document,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,
    getComputedStyle:dom.window.getComputedStyle,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}},
    requestAnimationFrame:(fn:FrameRequestCallback)=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:(id:number)=>frames.delete(id)};
  for(const [key,value] of Object.entries(globals)){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
  Object.defineProperty(dom.window,'innerWidth',{get:()=>width});Object.defineProperty(dom.window,'innerHeight',{value:900});
  Object.defineProperty(dom.window,'devicePixelRatio',{value:2});
  dom.window.HTMLElement.prototype.getBoundingClientRect=function(){const p=this.hasAttribute('data-page-container'),x=p?left:0,y=p?top:0,w=p?595*scale:width,h=p?842*scale:900;
    return {left:x,top:y,right:x+w,bottom:y+h,width:w,height:h,x,y,toJSON(){}};};
  dom.window.HTMLCanvasElement.prototype.getContext=function(){return {fillRect(){},drawImage(){}} as any;};
  const pdfDoc={async getPage(){return {getViewport({scale}:{scale:number}){return {width:595*scale,height:842*scale};},render({viewport}:{viewport:{width:number}}){
    let resolve!:()=>void;const promise=new Promise<void>(done=>resolve=done),job={scale:viewport.width/595,resolve,cancelled:false};jobs.push(job);
    return {promise,cancel(){job.cancelled=true;resolve();}};
  }};}};
  const {createRoot}=await import('react-dom/client'),root=createRoot(dom.window.document.getElementById('root')!);
  const flush=async()=>act(async()=>{for(let i=0;i<12;i++){await Promise.resolve();const current=[...frames.values()];frames.clear();current.forEach(fn=>fn(0));}});
  const shown=()=>[...dom.window.document.querySelectorAll<HTMLCanvasElement>('[data-pdf-detail-tile]')].find(canvas=>canvas.style.visibility==='visible' && canvas.style.display!=='none');
  const render=async(key:string)=>{await act(async()=>root.render(React.createElement('div',{className:'pdf-viewport-container','data-zoom-epoch':'0'},
    React.createElement('div',{'data-page-container':true,style:{'--pdf-layout-scale':scale} as any},
      React.createElement(PDFDetailTile,{key,pdfDoc,pageNumber:1,size:{width:595,height:842},near:true,cacheKey:'stability_1',onReady:()=>ready++})))));await flush();};
  try {
    await render('initial');assert.equal(jobs.length,1);
    const view=dom.window.document.querySelector<HTMLElement>('.pdf-viewport-container')!,page=dom.window.document.querySelector<HTMLElement>('[data-page-container]')!;
    for(let i=0;i<8;i++){top-=.125;view.dispatchEvent(new dom.window.Event('scroll'));await flush();}
    assert.equal(jobs.filter(job=>job.cancelled).length,0,'fractional scrolling cannot starve the first visible render');
    assert.equal(jobs.length,1);
    jobs[0].resolve();await flush();assert.ok(ready>0);assert.ok(shown());assert.equal(jobs.length,1);

    // New zooms invalidate the old epoch, but scroll/resize within that zoom
    // must retain useful work and the previous visible pixels.
    scale=1.2;page.style.setProperty('--pdf-layout-scale',String(scale));view.dataset.zoomEpoch='1';view.dispatchEvent(new dom.window.Event('pdf-zoom-end'));await flush();
    const slow=jobs.at(-1)!;left+=.125;width-=100;dom.window.dispatchEvent(new dom.window.Event('resize'));await flush();
    assert.equal(slow.cancelled,false);assert.ok(shown());
    const beforeReady=ready;slow.resolve();await flush();assert.ok(ready>beforeReady,'useful new pixels are shown before any phase refinement');assert.ok(shown());
    assert.notEqual(jobs.at(-1),slow);jobs.at(-1)!.resolve();await flush();
    const native=shown()!,cssLeft=parseFloat(native.style.left.slice(5))*scale;
    assert.ok(Math.abs((left+cssLeft)*2-Math.round((left+cssLeft)*2))<1e-9);

    top-=.125;view.dispatchEvent(new dom.window.Event('scroll'));await flush();const count=jobs.length;
    view.dispatchEvent(new dom.window.Event('scrollend'));await flush();assert.equal(jobs.length,count+1);
    jobs.at(-1)!.resolve();await flush();

    left+=.125;const panCount=jobs.length;view.dispatchEvent(new dom.window.Event('pdf-viewport-pan'));await flush();
    assert.equal(jobs.length,panCount+1);jobs.at(-1)!.resolve();await flush();
    const panCanvas=shown()!,panLeft=parseFloat(panCanvas.style.left.slice(5))*scale;
    assert.ok(Math.abs((left+panLeft)*2-Math.round((left+panLeft)*2))<1e-9);

    // A remount at another zoom keeps the retained PDF visible immediately,
    // while requiring a new final raster rather than treating it as sharp.
    scale=.7;await render('mode-change');assert.ok(shown());assert.equal(jobs.at(-1)!.scale,.7);
    jobs.at(-1)!.resolve();await flush();assert.ok(shown());
    page.style.setProperty('--pdf-layout-scale','.9');scale=.9;view.dataset.zoomEpoch='2';view.dispatchEvent(new dom.window.Event('pdf-zoom-end'));await flush();
    const obsolete=jobs.at(-1)!;
    scale=.65;page.style.setProperty('--pdf-layout-scale',String(scale));view.dataset.zoomEpoch='3';view.dispatchEvent(new dom.window.Event('pdf-zoom-end'));await flush();
    assert.equal(obsolete.cancelled,true);assert.equal(jobs.at(-1)!.scale,.65);obsolete.resolve();jobs.at(-1)!.resolve();await flush();assert.ok(shown());

    // A slow gesture preview remains useful as pinch-in raises the desired
    // density. Only release cancels it in favour of the exact final raster.
    view.dataset.zoomEpoch='4';view.dataset.zoomGesture='true';view.dispatchEvent(new dom.window.Event('pdf-zoom-start'));
    scale=.8;view.dispatchEvent(new dom.window.Event('pdf-zoom-frame'));await flush();
    const preview=jobs.at(-1)!,previewCount=jobs.length;
    for(const next of [.85,.9,.95,1.05]){scale=next;view.dispatchEvent(new dom.window.Event('pdf-zoom-frame'));await flush();assert.ok(shown());}
    assert.equal(preview.cancelled,false);assert.equal(jobs.length,previewCount);
    delete view.dataset.zoomGesture;page.style.setProperty('--pdf-layout-scale',String(scale));view.dispatchEvent(new dom.window.Event('pdf-zoom-end'));await flush();
    assert.equal(preview.cancelled,true);assert.equal(jobs.at(-1)!.scale,1.05);
    jobs.at(-1)!.resolve();await flush();assert.ok(shown());

    scale=3;page.style.setProperty('--pdf-layout-scale',String(scale));view.dataset.zoomEpoch='5';view.dispatchEvent(new dom.window.Event('pdf-zoom-end'));await flush();
    const edge=jobs.at(-1)!;top=-250;view.dispatchEvent(new dom.window.Event('scroll'));await flush();
    assert.equal(edge.cancelled,false);
    const partialReady=ready;edge.resolve();await flush();assert.ok(ready>partialReady);assert.ok(shown());
    assert.notEqual(jobs.at(-1),edge);jobs.at(-1)!.resolve();await flush();assert.ok(shown());

    // Releasing back at the already sharp zoom must discard a late preview,
    // even when no intermediate frame was sent for the reversed position.
    view.dataset.zoomEpoch='6';view.dataset.zoomGesture='true';view.dispatchEvent(new dom.window.Event('pdf-zoom-start'));
    scale=3.5;view.dispatchEvent(new dom.window.Event('pdf-zoom-frame'));await flush();const reversed=jobs.at(-1)!,reversedCount=jobs.length;
    scale=3;delete view.dataset.zoomGesture;view.dispatchEvent(new dom.window.Event('pdf-zoom-end'));await flush();
    assert.equal(reversed.cancelled,true);assert.equal(jobs.length,reversedCount);assert.ok(shown());
  } finally {
    await act(async()=>root.unmount());clearDocCanvasCache('stability');dom.window.close();
    for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}
  }
});
