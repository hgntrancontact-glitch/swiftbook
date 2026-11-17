import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {PDFPageView,clearDocCanvasCache} from '../src/components/PDFPageView';
import {ContinuousView} from '../src/components/ContinuousView';

test('a new epoch at the same zoom replaces pending work and cannot leave an initial page white; final geometry overrides stale IO',async()=>{
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost'});
  const saved=new Map<string,PropertyDescriptor|undefined>(),frames=new Map<number,FrameRequestCallback>();let serial=0,visiblePage=1;
  const globals={window:dom.window,document:dom.window.document,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,SVGElement:dom.window.SVGElement,
    Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,MutationObserver:dom.window.MutationObserver,CSS:{escape:(s:string)=>s},getComputedStyle:dom.window.getComputedStyle,
    IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class {observe(){}unobserve(){}disconnect(){}},
    IntersectionObserver:class {observe(){}unobserve(){}disconnect(){}},
    requestAnimationFrame:(fn:FrameRequestCallback)=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:(id:number)=>frames.delete(id)};
  for(const [key,value] of Object.entries(globals)){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
  Object.defineProperty(dom.window,'devicePixelRatio',{value:2});
  Object.defineProperty(dom.window,'innerWidth',{value:1200});Object.defineProperty(dom.window,'innerHeight',{value:900});
  dom.window.HTMLElement.prototype.getBoundingClientRect=function(){
    const page=Number(this.closest<HTMLElement>('[data-continuous-page]')?.dataset.continuousPage || 1);
    const top=this.classList.contains('pdf-viewport-container')?0:(page-visiblePage)*900;
    return {left:0,top,right:595,bottom:top+842,width:595,height:842,x:0,y:top,toJSON(){}};
  };
  dom.window.HTMLCanvasElement.prototype.getContext=function(){return new Proxy({} as any,{get:()=>()=>{}});};
  let releaseFirst=()=>{},cancels=0,held=true;const scales:number[]=[];
  const pdfDoc={async getPage(){return {getViewport({scale}:{scale:number}){return {scale,width:595*scale,height:842*scale};},
    render({viewport}:{viewport:{scale:number}}){
      scales.push(viewport.scale);
      if(held){held=false;return {promise:new Promise<void>(resolve=>{releaseFirst=resolve;}),cancel(){cancels++;releaseFirst();}};}
      return {promise:Promise.resolve(),cancel(){}};
    }};}};
  const noop=()=>{};
  const props={fileId:'lifecycle',pdfDoc,pageNumber:1,scale:1,currentPage:1,totalPages:8,activeTool:'text' as const,penColor:'#000',penSize:4,
    highlights:[],textNotes:[],drawings:[],boxes:[],freeTexts:[],onTextSelected:noop,onAddNote:noop,onUpdateNote:noop,onDeleteNote:noop,
    onAddBox:noop,onUpdateBox:noop,onDeleteBox:noop,onAddFreeText:noop,onUpdateFreeText:noop,onDeleteFreeText:noop,onDeleteHighlight:noop,onAddStroke:noop,onDeleteStroke:noop};
  const {createRoot}=await import('react-dom/client'),root=createRoot(dom.window.document.getElementById('root')!);
  const flush=async()=>{for(let i=0;i<20;i++)await act(async()=>{await Promise.resolve();const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn(0));});};
  try {
    await act(async()=>root.render(React.createElement('div',{'data-workspace-doc':'lifecycle','data-active':'true'},
      React.createElement('div',{className:'pdf-viewport-container','data-zoom-epoch':'0'},React.createElement(PDFPageView,props)))));await flush();
    assert.deepEqual(scales,[2]); // correct retina density, not 4× pixel count before first paint
    const view=dom.window.document.querySelector<HTMLElement>('.pdf-viewport-container')!;
    view.dataset.zoomEpoch='1';
    await act(async()=>view.dispatchEvent(new dom.window.Event('pdf-viewport-visibility')));await flush();
    await act(async()=>releaseFirst());await flush();
    assert.ok(cancels>=1);assert.ok(view.querySelector('canvas[data-rendered-scale="1"]'));
    assert.ok(!view.textContent!.includes('Đang tải trang'));
    const count=scales.length;await act(async()=>view.dispatchEvent(new dom.window.Event('pdf-zoom-end')));await flush();
    assert.equal(scales.length,count); // no duplicate native crop of the exact final full-page result

    await act(async()=>root.render(React.createElement('div',{className:'pdf-viewport-container','data-zoom-epoch':'2'},React.createElement(ContinuousView,props))));await flush();
    assert.equal(dom.window.document.querySelector('[data-continuous-page="5"] [data-page-container]'),null);
    visiblePage=5;
    const continuous=dom.window.document.querySelector('.pdf-viewport-container')!;
    await act(async()=>continuous.dispatchEvent(new dom.window.Event('pdf-zoom-end')));await flush();
    assert.ok(dom.window.document.querySelector('[data-continuous-page="5"] [data-page-container]'));
  } finally {
    await act(async()=>root.unmount());clearDocCanvasCache('lifecycle');dom.window.close();
    for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}
  }
});
