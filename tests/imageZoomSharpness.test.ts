import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {PDFDetailTile,clearDocCanvasCache} from '../src/components/PDFPageView';
import {IMAGE_PIXELS_METADATA} from '../src/utils/imagePdfResolution';

for(const preview of [false,true])test(`zoom samples the original image, including during pinch and with an enlarged preview present (${preview})`,async()=>{
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost'});
  const saved=new Map<string,PropertyDescriptor|undefined>(),frames=new Map<number,FrameRequestCallback>();let serial=0,scale=.5;
  const size={width:595,height:371.875},copies:{source:HTMLCanvasElement;destination:HTMLCanvasElement}[]=[],sources:HTMLCanvasElement[]=[];
  const globals={window:dom.window,document:dom.window.document,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,
    getComputedStyle:dom.window.getComputedStyle,IS_REACT_ACT_ENVIRONMENT:true,
    ResizeObserver:class {observe(){}unobserve(){}disconnect(){}},
    requestAnimationFrame:(fn:FrameRequestCallback)=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:(id:number)=>frames.delete(id)};
  for(const [key,value] of Object.entries(globals)){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
  Object.defineProperty(dom.window,'innerWidth',{value:1200});Object.defineProperty(dom.window,'innerHeight',{value:900});
  Object.defineProperty(dom.window,'devicePixelRatio',{value:2});
  dom.window.HTMLElement.prototype.getBoundingClientRect=function(){
    const page=this.hasAttribute('data-page-container'),width=page?size.width*scale:1200,height=page?size.height*scale:900;
    return {left:0,top:0,right:width,bottom:height,width,height,x:0,y:0,toJSON(){}};
  };
  dom.window.HTMLCanvasElement.prototype.getContext=function(){return {canvas:this,fillRect(){},drawImage:(source:HTMLCanvasElement)=>copies.push({source,destination:this})} as any;};
  const pdfDoc={getMetadata:async()=>({info:{Custom:{[IMAGE_PIXELS_METADATA]:'{"1":{"width":1600,"height":1000}}'}}}),
    getPage:async()=>({getViewport:({scale}:{scale:number})=>({width:size.width*scale,height:size.height*scale}),
      render:({canvasContext}:any)=>{sources.push(canvasContext.canvas);return {promise:Promise.resolve(),cancel(){}};}})};
  const {createRoot}=await import('react-dom/client'),root=createRoot(dom.window.document.getElementById('root')!);
  const flush=async()=>{for(let i=0;i<25;i++)await act(async()=>{await Promise.resolve();const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn(0));});};
  const key=`zoom-image-${preview}`;
  const active=()=>[...dom.window.document.querySelectorAll<HTMLCanvasElement>('[data-pdf-detail-tile]')].find(c=>c.style.visibility==='visible')!;
  try {
    await act(async()=>root.render(React.createElement('div',{className:'pdf-viewport-container','data-zoom-epoch':'1'},
      React.createElement('div',{'data-page-container':true,style:{'--pdf-layout-scale':scale} as any},
        preview && React.createElement('canvas',{'data-raster-density':8,width:4760,height:2975}),
        React.createElement(PDFDetailTile,{pdfDoc,pageNumber:1,size,near:true,cacheKey:key+'_1'})))));await flush();
    const view=dom.window.document.querySelector<HTMLElement>('.pdf-viewport-container')!,page=view.querySelector<HTMLElement>('[data-page-container]')!;
    await act(async()=>dom.window.dispatchEvent(new dom.window.Event('resize')));await flush();
    assert.equal(copies.at(-1)!.source,sources[0],'A large upscaled fallback cannot replace intrinsic image pixels');
    for(const zoom of [.35,1.2,.22,2.6,.5]) {
      view.dataset.zoomGesture='true';await act(async()=>view.dispatchEvent(new dom.window.Event('pdf-zoom-start')));
      scale=zoom;await act(async()=>view.dispatchEvent(new dom.window.Event('pdf-zoom-frame')));await flush();
      assert.equal(active().width,1600,'During pinch, display the original raster instead of CSS-scaling a previously reduced screen buffer');
      assert.equal(copies.at(-1)!.source,sources[0]);
      const count=copies.length;
      for(let i=0;i<30;i++){scale=zoom*(1+.01*Math.sin(i));view.dispatchEvent(new dom.window.Event('pdf-zoom-frame'));}
      assert.equal(copies.length,count,'Once native image pixels are displayed, reuse them across intermediate pinch ticks');
      scale=zoom;page.style.setProperty('--pdf-layout-scale',String(scale));delete view.dataset.zoomGesture;
      await act(async()=>view.dispatchEvent(new dom.window.Event('pdf-zoom-end')));await flush();
      assert.equal(copies.at(-1)!.source,sources[0],'Zoom release must sample the intrinsic image directly');
      await act(async()=>view.dispatchEvent(new dom.window.Event('pdf-raster-ready')));await flush();
      assert.equal(copies.at(-1)!.source,sources[0],'Late background previews cannot downgrade the original image');
    }
    assert.equal(sources.length,1);
  } finally {
    await act(async()=>root.unmount());clearDocCanvasCache(key);dom.window.close();
    for(const [key,descriptor] of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];
  }
});
