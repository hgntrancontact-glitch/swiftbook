import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {PDFDetailTile} from '../src/components/PDFPageView';

test('continuous pinch reuses a sharp surface instead of copying on every tick, then resolves the final device pixels without PDF replay',async()=>{
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost'});
  const descriptors=new Map<string,PropertyDescriptor|undefined>(),frames=new Map<number,FrameRequestCallback>();let serial=0,draws=0,scale=1;
  const globals={window:dom.window,document:dom.window.document,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,
    getComputedStyle:dom.window.getComputedStyle,IS_REACT_ACT_ENVIRONMENT:true,
    ResizeObserver:class {observe(){}unobserve(){}disconnect(){}},
    requestAnimationFrame:(fn:FrameRequestCallback)=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:(id:number)=>frames.delete(id)};
  for(const [key,value] of Object.entries(globals)){descriptors.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
  Object.defineProperty(dom.window,'innerWidth',{value:1200});Object.defineProperty(dom.window,'innerHeight',{value:900});
  dom.window.HTMLElement.prototype.getBoundingClientRect=function(){
    const width=this.hasAttribute('data-page-container')?595*scale:1200,height=this.hasAttribute('data-page-container')?842*scale:900;
    return {left:0,top:0,right:width,bottom:height,width,height,x:0,y:0,toJSON(){}};
  };
  dom.window.HTMLCanvasElement.prototype.getContext=function(){return {fillRect(){},drawImage(){draws++;}} as any;};
  const rendered:number[]=[],pdfDoc={async getPage(){return {getViewport({scale}:{scale:number}){return {scale};},render({viewport}:{viewport:{scale:number}}){rendered.push(viewport.scale);return {promise:Promise.resolve(),cancel(){}};}};}};
  const {createRoot}=await import('react-dom/client'),root=createRoot(dom.window.document.getElementById('root')!);
  const flush=async()=>act(async()=>{for(let i=0;i<12;i++){await Promise.resolve();const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn(0));}});
  try {
    await act(async()=>root.render(React.createElement('div',{className:'pdf-viewport-container','data-zoom-gesture':'true','data-zoom-epoch':'1'},
      React.createElement('div',{'data-page-container':true,style:{'--pdf-layout-scale':1} as any},
        React.createElement('canvas',{'data-raster-density':10,width:5950,height:8420}),
        React.createElement(PDFDetailTile,{pdfDoc,pageNumber:1,size:{width:595,height:842},near:true,cacheKey:'test-pinch'})))));
    await flush();const before=draws;
    const view=dom.window.document.querySelector<HTMLElement>('.pdf-viewport-container')!;
    for(let i=0;i<120;i++) {
      scale=1+.35*Math.sin(i/119*Math.PI);
      view.dispatchEvent(new dom.window.Event('pdf-zoom-frame'));
    }
    assert.equal(draws,before);assert.equal(rendered.length,0);
    scale=1.226;
    dom.window.document.querySelector<HTMLElement>('[data-page-container]')!.style.setProperty('--pdf-layout-scale',String(scale));
    delete view.dataset.zoomGesture;
    view.dispatchEvent(new dom.window.Event('pdf-zoom-end'));await flush();
    assert.deepEqual(rendered,[]); // the original full-page raster already has enough density
    assert.ok(draws>before);
    const active=[...dom.window.document.querySelectorAll<HTMLElement>('[data-pdf-detail-tile]')].filter(el=>el.style.visibility==='visible');
    assert.equal(active.length,1);
    const canvas=active[0] as HTMLCanvasElement;
    const cssWidth=parseFloat(canvas.style.width.slice(5))*scale;
    assert.ok(Math.abs(canvas.width/cssWidth-1)<1e-9); // exact DPR=1 output, not CSS-downscaled headroom
  } finally {
    await act(async()=>root.unmount());dom.window.close();
    for(const [key,descriptor] of descriptors){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}
  }
});
