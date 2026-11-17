import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {PDFDetailTile,clearDocCanvasCache} from '../src/components/PDFPageView';

test('a smaller browser window repaints the final PDF at its new pixel origin and device density without rerendering every scroll',async()=>{
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost'});
  const saved=new Map<string,PropertyDescriptor|undefined>(),frames=new Map<number,FrameRequestCallback>(),observers=new Set<()=>void>();
  let serial=0,width=1200,left=48.125,top=50.125,scale=1,dpr=2;
  const globals={window:dom.window,document:dom.window.document,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,
    getComputedStyle:dom.window.getComputedStyle,IS_REACT_ACT_ENVIRONMENT:true,
    ResizeObserver:class {constructor(callback:()=>void){observers.add(callback);this.callback=callback;}callback:()=>void;observe(){}unobserve(){}disconnect(){observers.delete(this.callback);}},
    requestAnimationFrame:(fn:FrameRequestCallback)=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:(id:number)=>frames.delete(id)};
  for(const [key,value] of Object.entries(globals)){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
  Object.defineProperty(dom.window,'innerWidth',{get:()=>width});Object.defineProperty(dom.window,'innerHeight',{value:900});
  Object.defineProperty(dom.window,'devicePixelRatio',{get:()=>dpr});
  dom.window.HTMLElement.prototype.getBoundingClientRect=function(){
    const page=this.hasAttribute('data-page-container'),x=page?left:0,y=page?top:0,w=page?595*scale:width,h=page?842*scale:900;
    return {left:x,top:y,right:x+w,bottom:y+h,width:w,height:h,x,y,toJSON(){}};
  };
  dom.window.HTMLCanvasElement.prototype.getContext=function(){return {fillRect(){},drawImage(){}} as any;};
  const renders:number[]=[],pdfDoc={async getPage(){return {getViewport({scale}:{scale:number}){return {scale};},
    render({viewport}:{viewport:{scale:number}}){renders.push(viewport.scale);return {promise:Promise.resolve(),cancel(){}};}};}};
  const {createRoot}=await import('react-dom/client'),root=createRoot(dom.window.document.getElementById('root')!);
  const flush=async()=>act(async()=>{for(let i=0;i<16;i++){await Promise.resolve();const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn(0));}});
  const shown=()=>[...dom.window.document.querySelectorAll<HTMLCanvasElement>('[data-pdf-detail-tile]')].find(c=>c.style.visibility==='visible')!;
  const native=()=>{
    const canvas=shown(),css=(key:'left'|'top'|'width')=>parseFloat(canvas.style[key].slice(5))*scale;
    const pixels=canvas.width/css('width');
    assert.ok(Math.abs(pixels-dpr)<1e-9);
    assert.ok(Math.abs((left+css('left'))*dpr-Math.round((left+css('left'))*dpr))<1e-9);
    assert.ok(Math.abs((top+css('top'))*dpr-Math.round((top+css('top'))*dpr))<1e-9);
  };
  try {
    await act(async()=>root.render(React.createElement('div',{className:'pdf-viewport-container'},React.createElement('div',{'data-page-container':true,style:{'--pdf-layout-scale':1} as any},
      React.createElement(PDFDetailTile,{pdfDoc,pageNumber:17,size:{width:595,height:842},near:true,cacheKey:'window-resize_17'})))));await flush();native();
    const before=renders.length;width=1050;left=48.375;
    await act(async()=>{observers.forEach(fn=>fn());dom.window.dispatchEvent(new dom.window.Event('resize'));});await flush();
    assert.ok(renders.length>before);native(); // same PDF zoom, new half-device-pixel phase
    scale=.7;left=101.3125;top=26.3125;
    dom.window.document.querySelector<HTMLElement>('[data-page-container]')!.style.setProperty('--pdf-layout-scale',String(scale));
    await act(async()=>observers.forEach(fn=>fn()));await flush();native();
    dpr=1.25;await act(async()=>dom.window.dispatchEvent(new dom.window.Event('resize')));await flush();native();
    const settled=renders.length;top-=.125;
    await act(async()=>dom.window.document.querySelector('.pdf-viewport-container')!.dispatchEvent(new dom.window.Event('scroll')));await flush();
    assert.equal(renders.length,settled);
  } finally {
    await act(async()=>root.unmount());clearDocCanvasCache('window-resize');dom.window.close();
    for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}
  }
});
