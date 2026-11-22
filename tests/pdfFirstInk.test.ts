import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {PDFDetailTile,clearDocCanvasCache} from '../src/components/PDFPageView';

test('the first PDF chunk containing real ink is visible before slow image decoding finishes',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map<string,PropertyDescriptor|undefined>(),frames=new Map<number,FrameRequestCallback>();
  let serial=0,ready=0,finish!:()=>void,ink=false;
  const globals={window:dom.window,document:dom.window.document,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,
    getComputedStyle:dom.window.getComputedStyle,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}},
    requestAnimationFrame:(fn:FrameRequestCallback)=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:(id:number)=>frames.delete(id)};
  for(const [key,value] of Object.entries(globals)){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
  Object.defineProperty(dom.window,'innerWidth',{value:1200});Object.defineProperty(dom.window,'innerHeight',{value:900});
  dom.window.HTMLElement.prototype.getBoundingClientRect=function(){return {left:0,top:0,right:595,bottom:842,width:595,height:842,x:0,y:0,toJSON(){}};};
  dom.window.HTMLCanvasElement.prototype.getContext=function(){return {fillRect(){},drawImage(){},getImageData(){const data=new Uint8ClampedArray(32*32*4).fill(255);if(ink)data[0]=0;return {data};}} as any;};
  const task:any={promise:new Promise<void>(resolve=>finish=resolve),cancel(){finish();}},pdfDoc={async getPage(){return {
    getViewport({scale}:{scale:number}){return {width:595*scale,height:842*scale};},render(){return task;}};}};
  const {createRoot}=await import('react-dom/client'),root=createRoot(dom.window.document.getElementById('root')!);
  const flush=async()=>act(async()=>{for(let i=0;i<10;i++){await Promise.resolve();const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(0));}});
  try {
    await act(async()=>root.render(React.createElement('div',{className:'pdf-viewport-container'},React.createElement('div',{'data-page-container':true,style:{'--pdf-layout-scale':1} as any},
      React.createElement(PDFDetailTile,{pdfDoc,pageNumber:1,size:{width:595,height:842},near:true,cacheKey:'first-ink_1',onReady:()=>ready++})))));await flush();
    assert.equal(ready,0);
    await act(async()=>task.onContinue(()=>{ink=true;}));await flush();
    assert.equal(ready,1); // one continuation is enough; the task is still held
    const shown=dom.window.document.querySelector<HTMLCanvasElement>('[data-pdf-detail-tile][style*="visible"]')!;
    assert.ok(shown.width>1);
    finish();await flush();assert.ok(ready>1);
  } finally {
    await act(async()=>root.unmount());clearDocCanvasCache('first-ink');dom.window.close();
    for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}
  }
});
