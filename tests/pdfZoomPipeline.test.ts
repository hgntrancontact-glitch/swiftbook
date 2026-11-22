import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act,useState} from 'react';
import {JSDOM} from 'jsdom';
import {PDFPageView,clearDocCanvasCache} from '../src/components/PDFPageView';
import {detailRasterOwnership} from '../src/utils/pdfRasterOwnership';

test('zoom renders the visible native crop once instead of replaying a full-page raster too; crop failure restores full-page rendering',async()=>{
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost'});
  const descriptors=new Map<string,PropertyDescriptor|undefined>(),frames=new Map<number,FrameRequestCallback>();let serial=0,visualScale=1,failNext=false,holdNext=false,cancelledPreviews=0;
  const globals={window:dom.window,document:dom.window.document,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,SVGElement:dom.window.SVGElement,
    Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,MutationObserver:dom.window.MutationObserver,CSS:{escape:(s:string)=>s},
    getComputedStyle:dom.window.getComputedStyle,IS_REACT_ACT_ENVIRONMENT:true,
    ResizeObserver:class {observe(){}unobserve(){}disconnect(){}},
    requestAnimationFrame:(fn:FrameRequestCallback)=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:(id:number)=>frames.delete(id)};
  for(const [key,value] of Object.entries(globals)){descriptors.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
  Object.defineProperty(dom.window,'innerWidth',{value:1200});Object.defineProperty(dom.window,'innerHeight',{value:900});
  dom.window.HTMLElement.prototype.getBoundingClientRect=function(){
    const width=this.hasAttribute('data-page-container')?595*visualScale:1200,height=this.hasAttribute('data-page-container')?842*visualScale:900;
    return {left:0,top:0,right:width,bottom:height,width,height,x:0,y:0,toJSON(){}};
  };
  dom.window.HTMLCanvasElement.prototype.getContext=function(){return new Proxy({} as any,{get:()=>()=>{}});};
  const rendered:number[]=[],pdfDoc={async getPage(){return {
    getViewport({scale}:{scale:number}){return {scale,width:595*scale,height:842*scale};},
    render({viewport}:{viewport:{scale:number}}){
      rendered.push(viewport.scale);const fail=failNext;failNext=false;
      const held=holdNext;holdNext=false;let release=()=>{},stopped=false;
      const promise=held?new Promise<void>(resolve=>{release=resolve;}):fail?Promise.reject(new Error('Test crop failure')):Promise.resolve();
      return {promise,cancel(){if(held && !stopped){stopped=true;cancelledPreviews++;release();}}};
    }
  };}};
  let setScale!:(scale:number)=>void;
  const noop=()=>{};
  function App(){const [scale,update]=useState(1);setScale=update;
    return React.createElement('div',{'data-workspace-doc':'pipeline','data-active':'true'},React.createElement('div',{className:'pdf-viewport-container','data-zoom-epoch':'0'},
      React.createElement(PDFPageView,{fileId:'pipeline',pdfDoc,pageNumber:1,scale,activeTool:'text',penColor:'#000',penSize:4,
        highlights:[],textNotes:[],drawings:[],boxes:[],freeTexts:[],onTextSelected:noop,onAddNote:noop,onUpdateNote:noop,onDeleteNote:noop,
        onAddBox:noop,onUpdateBox:noop,onDeleteBox:noop,onAddFreeText:noop,onUpdateFreeText:noop,onDeleteFreeText:noop,onDeleteHighlight:noop,onAddStroke:noop,onDeleteStroke:noop})));}
  const {createRoot}=await import('react-dom/client'),root=createRoot(dom.window.document.getElementById('root')!);
  const flush=async()=>{for(let i=0;i<20;i++)await act(async()=>{await Promise.resolve();const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn(0));});};
  const zoom=async(target:number)=>{
    const view=dom.window.document.querySelector<HTMLElement>('.pdf-viewport-container')!;
    view.dataset.zoomGesture='true';view.dataset.zoomEpoch=String(Number(view.dataset.zoomEpoch)+1);
    await act(async()=>view.dispatchEvent(new dom.window.Event('pdf-zoom-start')));
    await act(async()=>{visualScale=target;view.dispatchEvent(new dom.window.Event('pdf-zoom-frame'));});
    await act(async()=>setScale(target));
    delete view.dataset.zoomGesture;
    await act(async()=>view.dispatchEvent(new dom.window.Event('pdf-zoom-end')));
    await flush();
  };
  const warn=console.warn;
  try {
    await act(async()=>root.render(React.createElement(App)));await flush();
    assert.ok(rendered.length>0);
    for(const target of [2.2,3.1,.55]) {
      const before=rendered.length;await zoom(target);
      assert.deepEqual(rendered.slice(before),[target]); // a derived thumbnail also gets one native refinement on zoom-out, never a second full-page replay
      const settled=rendered.length;
      const viewport=dom.window.document.querySelector<HTMLElement>('.pdf-viewport-container')!;
      await act(async()=>viewport.dispatchEvent(new dom.window.Event('pdf-zoom-end')));await flush();
      assert.equal(rendered.length,settled); // the completed native result settles once, without a render loop
      const page=dom.window.document.querySelector<HTMLElement>('[data-page-container]')!;
      assert.equal(detailRasterOwnership.owns(page,target,page.closest<HTMLElement>('.pdf-viewport-container')!.dataset.zoomEpoch),true);
      const hidden=[...page.querySelectorAll<HTMLCanvasElement>('[data-pdf-detail-tile]')].filter(canvas=>canvas.style.visibility==='hidden');
      assert.ok(hidden.every(canvas=>canvas.width===1 && canvas.height===1));
    }
    // Reversing a pinch can make an in-flight crop obsolete even though the
    // old displayed surface is already sharp enough. It must still be cancelled.
    const view=dom.window.document.querySelector<HTMLElement>('.pdf-viewport-container')!;
    view.dataset.zoomGesture='true';view.dataset.zoomEpoch=String(Number(view.dataset.zoomEpoch)+1);
    await act(async()=>view.dispatchEvent(new dom.window.Event('pdf-zoom-start')));
    holdNext=true;const previewStart=rendered.length;visualScale=5;
    view.dispatchEvent(new dom.window.Event('pdf-zoom-frame'));await flush();
    assert.deepEqual(rendered.slice(previewStart),[5]);
    visualScale=.55;view.dispatchEvent(new dom.window.Event('pdf-zoom-frame'));await flush();
    assert.equal(cancelledPreviews,1);assert.equal(rendered.length,previewStart+1);
    delete view.dataset.zoomGesture;await act(async()=>view.dispatchEvent(new dom.window.Event('pdf-zoom-end')));await flush();
    failNext=true;console.warn=()=>{};const before=rendered.length;await zoom(4);
    assert.ok(rendered.length>before+1); // failed crop, then a full-page fallback
    const page=dom.window.document.querySelector<HTMLElement>('[data-page-container]')!;
    assert.equal(detailRasterOwnership.owns(page,4,page.closest<HTMLElement>('.pdf-viewport-container')!.dataset.zoomEpoch),false);
    assert.ok(page.querySelector('canvas[data-rendered-scale="4"]'));
  } finally {
    console.warn=warn;await act(async()=>root.unmount());clearDocCanvasCache('pipeline');dom.window.close();
    for(const [key,descriptor] of descriptors){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}
  }
});
