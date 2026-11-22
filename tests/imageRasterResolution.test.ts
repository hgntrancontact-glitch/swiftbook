import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {PDFDetailTile,clearDocCanvasCache} from '../src/components/PDFPageView';
import {importedImagePixels,IMAGE_PIXELS_METADATA} from '../src/utils/imagePdfResolution';
import {PDFDocument,PDFDict,PDFHexString} from 'pdf-lib';
import sharp from 'sharp';
import {convertImageToPdfBytes} from '../src/utils/fileConverter';

const size={width:595,height:371.875};
test('native image resolution survives PDF save/reopen; metadata is cached, checked, and optional for ordinary PDFs',async()=>{
  const png=await sharp({create:{width:1600,height:1000,channels:3,background:'#fff'}}).png().toBuffer();
  const saved=await PDFDocument.load(await convertImageToPdfBytes(new File([new Uint8Array(png)],'source.png',{type:'image/png'})));
  const info=saved.context.lookup(saved.context.trailerInfo.Info,PDFDict);
  const raw=(info.entries().find(([key])=>key.toString()==='/'+IMAGE_PIXELS_METADATA)![1] as PDFHexString).decodeText();
  let reads=0;const doc={async getMetadata(){reads++;return {info:{Custom:{[IMAGE_PIXELS_METADATA]:raw}}};}};
  for(let i=0;i<3;i++)assert.deepEqual(await importedImagePixels(doc,1,size),{width:1600,height:1000});
  assert.equal(reads,1);assert.equal(await importedImagePixels(doc,2,size),null);
  assert.equal(await importedImagePixels(doc,1,{width:842,height:595}),null);
  for(const value of ['not-json','null','{"1":{"width":1e99,"height":2}}','{"1":{"width":-2,"height":-1.25}}'])
    assert.equal(await importedImagePixels({getMetadata:async()=>({info:{Custom:{[IMAGE_PIXELS_METADATA]:value}}})},1,size),null);
  assert.equal(await importedImagePixels({getMetadata:async()=>{throw new Error('unavailable');}},1,size),null);
  assert.equal(await importedImagePixels({},1,size),null);
});

test('image renderer retains original pixels through small zoom, pinch release, resize and mode remount without repeated filtering/replay',async()=>{
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost'});
  const saved=new Map<string,PropertyDescriptor|undefined>(),frames=new Map<number,FrameRequestCallback>();let serial=0,scale=.5,viewWidth=1200;
  const globals={window:dom.window,document:dom.window.document,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,
    getComputedStyle:dom.window.getComputedStyle,IS_REACT_ACT_ENVIRONMENT:true,
    ResizeObserver:class {observe(){}unobserve(){}disconnect(){}},
    requestAnimationFrame:(fn:FrameRequestCallback)=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:(id:number)=>frames.delete(id)};
  for(const [key,value] of Object.entries(globals)){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
  Object.defineProperty(dom.window,'innerWidth',{value:1200});Object.defineProperty(dom.window,'innerHeight',{value:900});
  Object.defineProperty(dom.window,'devicePixelRatio',{value:2});
  dom.window.HTMLElement.prototype.getBoundingClientRect=function(){
    const page=this.hasAttribute('data-page-container'),width=page?size.width*scale:viewWidth,height=page?size.height*scale:900;
    return {left:0,top:0,right:width,bottom:height,width,height,x:0,y:0,toJSON(){}};
  };
  const renders:{width:number;height:number}[]=[];
  dom.window.HTMLCanvasElement.prototype.getContext=function(){return {canvas:this,fillRect(){},drawImage(){}} as any;};
  const pdfDoc={getMetadata:async()=>({info:{Custom:{[IMAGE_PIXELS_METADATA]:'{"1":{"width":1600,"height":1000}}'}}}),
    async getPage(){return {getViewport:({scale}:{scale:number})=>({width:size.width*scale,height:size.height*scale}),
      render:({canvasContext}:any)=>{renders.push({width:canvasContext.canvas.width,height:canvasContext.canvas.height});return {promise:Promise.resolve(),cancel(){}};}};}};
  const {createRoot}=await import('react-dom/client'),root=createRoot(dom.window.document.getElementById('root')!);
  const flush=async()=>{for(let i=0;i<25;i++)await act(async()=>{await Promise.resolve();const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn(0));});};
  const tree=(key:string)=>React.createElement('div',{className:'pdf-viewport-container','data-zoom-epoch':'1'},
    React.createElement('div',{'data-page-container':true,style:{'--pdf-layout-scale':scale} as any},
      React.createElement(PDFDetailTile,{key,pdfDoc,pageNumber:1,size,near:true,cacheKey:'native-image_1'})));
  try {
    await act(async()=>root.render(tree('first')));await flush();
    assert.deepEqual(renders,[{width:1600,height:1000}]);
    const view=dom.window.document.querySelector<HTMLElement>('.pdf-viewport-container')!,page=view.querySelector<HTMLElement>('[data-page-container]')!;
    for(const zoom of [1.5,3,.7,.18,2,.5]) {
      view.dataset.zoomGesture='true';await act(async()=>view.dispatchEvent(new dom.window.Event('pdf-zoom-start')));
      scale=zoom;await act(async()=>view.dispatchEvent(new dom.window.Event('pdf-zoom-frame')));await flush();
      page.style.setProperty('--pdf-layout-scale',String(scale));delete view.dataset.zoomGesture;
      await act(async()=>view.dispatchEvent(new dom.window.Event('pdf-zoom-end')));await flush();
      const displayed=[...page.querySelectorAll<HTMLCanvasElement>('canvas')].find(c=>c.style.visibility==='visible')!;
      assert.ok(Math.abs(displayed.width/(parseFloat(displayed.style.width.slice(5))*scale)-2)<1e-7);
    }
    viewWidth=600;await act(async()=>dom.window.dispatchEvent(new dom.window.Event('resize')));await flush();
    await act(async()=>root.render(tree('remounted')));await flush();
    assert.equal(renders.length,1,'Zoom beyond original resolution cannot request endless higher-quality rasters');
  } finally {
    await act(async()=>root.unmount());clearDocCanvasCache('native-image');dom.window.close();
    for(const [key,descriptor] of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];
  }
});

test('image exports retain native screenshot resolution and alpha compositing without changing ordinary PDF export scale',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'document');
  const {renderPageWithAnnotations}=await import('../src/utils/pageExporter');
  try {
    Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){}})})}});
    const base={width:595.28,height:595.28*4000/6000};
    const getPage=async()=>({getViewport:({scale}:{scale:number})=>({width:base.width*scale,height:base.height*scale}),render:()=>({promise:Promise.resolve()}),cleanup(){}});
    const pdf={getPage,getMetadata:async()=>({info:{Custom:{[IMAGE_PIXELS_METADATA]:'{"1":{"width":6000,"height":4000}}'}}})};
    const canvas=await renderPageWithAnnotations(pdf,1,3,false);
    assert.equal(canvas.width,6000);assert.equal(canvas.height,4000);
    const ordinary=await renderPageWithAnnotations({getPage},1,3,false);
    assert.equal(ordinary.width,Math.floor(base.width*3));assert.equal(ordinary.height,Math.floor(base.height*3));
    const huge=await renderPageWithAnnotations({getPage,getMetadata:async()=>({info:{Custom:{[IMAGE_PIXELS_METADATA]:'{"1":{"width":18000,"height":12000}}'}}})},1,3,false);
    assert.ok(huge.width*huge.height<32_020_000,'Large-image export allocations remain bounded');
  } finally {if(descriptor)Object.defineProperty(globalThis,'document',descriptor);else delete (globalThis as any).document;}
});

test('large image native crops align to source pixels and stay within the existing raster budget',async()=>{
  const {nativeImageTile}=await import('../src/utils/imagePdfResolution');
  const {pdfDetailTile}=await import('../src/utils/pdfDetailTile');
  const page={width:600,height:400},pixels={width:6000,height:4000};
  for(const scale of [1,2,3,5]) {
    const tile=pdfDetailTile(page,{left:310.123*scale,top:150.456*scale,right:Math.min(600*scale,310.123*scale+800),bottom:Math.min(400*scale,150.456*scale+600)},scale,2)!;
    const source=nativeImageTile(tile,scale,page,pixels);
    if(source) {
      assert.ok(source.pixelsWide*source.pixelsHigh<=12_000_000);
      assert.ok(Math.abs(source.x/scale*10-Math.round(source.x/scale*10))<1e-8);
      assert.equal(source.density,10);
      assert.ok(source.x<=tile.x+1e-8 && source.x+source.width>=Math.min(tile.x+tile.width,page.width*scale)-1e-8);
    } else assert.ok(tile.width/scale*10*tile.height/scale*10>11_990_000);
  }
  const full=pdfDetailTile(page,{left:0,top:0,right:600,bottom:400},1,2)!;
  assert.equal(nativeImageTile(full,1,page,pixels),null); // never allocate a 24MP full-page source in the viewer
});

test('older image documents recover intrinsic resolution from their embedded image without inspecting ordinary PDFs',async()=>{
  const {registerImageDocument}=await import('../src/utils/imagePdfResolution');
  let lists=0;
  const pdf={getMetadata:async()=>({info:{}}),getPage:async()=>({rotate:0,getOperatorList:async()=>{lists++;return {fnArray:[1,85,2],argsArray:[[],['image',1600,1000],[]]};}})};
  assert.equal(await importedImagePixels(pdf,1,size),null);assert.equal(lists,0);
  registerImageDocument(pdf,'previously-saved.png',{paintImageXObject:85,paintInlineImageXObject:86});
  for(let i=0;i<3;i++)assert.deepEqual(await importedImagePixels(pdf,1,size),{width:1600,height:1000});
  assert.equal(lists,1);assert.equal(await importedImagePixels(pdf,1,{width:100,height:100}),null);
});
