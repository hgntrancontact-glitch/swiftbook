import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {PDFDetailTile,clearDocCanvasCache} from '../src/components/PDFPageView';
import {getPageRaster} from '../src/utils/pdfRasterCache';
import {retainPageDetail} from '../src/utils/pdfDetailCache';
import {IMAGE_PIXELS_METADATA} from '../src/utils/imagePdfResolution';

async function environment() {
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map<string,PropertyDescriptor|undefined>(),frames=new Map<number,FrameRequestCallback>();
  let serial=0,scale=1;
  const globals={window:dom.window,document:dom.window.document,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,
    getComputedStyle:dom.window.getComputedStyle,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}},
    requestAnimationFrame:(fn:FrameRequestCallback)=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:(id:number)=>frames.delete(id)};
  for(const [key,value] of Object.entries(globals)){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
  Object.defineProperty(dom.window,'innerWidth',{value:1200});Object.defineProperty(dom.window,'innerHeight',{value:900});Object.defineProperty(dom.window,'devicePixelRatio',{value:2});
  dom.window.HTMLElement.prototype.getBoundingClientRect=function(){const page=this.hasAttribute('data-page-container'),width=page?595*scale:1200,height=page?842*scale:900;return {left:0,top:0,width,height,right:width,bottom:height,x:0,y:0,toJSON(){}};};
  const copies:HTMLCanvasElement[]=[];
  dom.window.HTMLCanvasElement.prototype.getContext=function(){return {fillRect(){},drawImage:(source:HTMLCanvasElement)=>copies.push(source)} as any;};
  const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')!);
  return {dom,root,copies,setScale:(value:number)=>{scale=value;},flush:async()=>{for(let i=0;i<20;i++)await act(async()=>{await Promise.resolve();const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn(0));});},
    close:async()=>{await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor] of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}};
}
const pageSize={width:595,height:842};
const tree=(pdfDoc:any,key:string,zooming:boolean,fallback=false,preview=false,scale=1)=>React.createElement('div',{className:'pdf-viewport-container','data-zoom-gesture':zooming?'true':undefined,'data-zoom-epoch':'1'},
  React.createElement('div',{'data-page-container':true,style:{'--pdf-layout-scale':scale} as any},fallback && React.createElement('canvas',{'data-raster-density':preview?3:1,'data-raster-preview':preview?'true':undefined,width:preview?1785:595,height:preview?2526:842}),
    React.createElement(PDFDetailTile,{pdfDoc,pageNumber:1,size:pageSize,near:true,cacheKey:key+'_1'})));

test('a sharper PDF raster arriving during pinch replaces a covered blurry surface before release',async()=>{
  const h=await environment();let cancelled=0,resolve=()=>{};
  const pdfDoc={getPage:async()=>({getViewport:({scale}:{scale:number})=>({width:595*scale,height:842*scale}),
    render:({canvasContext}:any)=>{assert.equal(canvasContext.imageSmoothingQuality,'high');return {promise:new Promise<void>(done=>{resolve=done;}),cancel(){cancelled++;resolve();}};}})};
  try {
    await act(async()=>h.root.render(tree(pdfDoc,'progress-display',true,true)));await h.flush();
    const view=document.querySelector<HTMLElement>('.pdf-viewport-container')!,fallback=document.querySelector<HTMLCanvasElement>('[data-raster-density]')!;
    const before=h.copies.length;
    fallback.width=1785;fallback.height=2526;fallback.dataset.rasterDensity='3';
    await act(async()=>view.dispatchEvent(new h.dom.window.Event('pdf-raster-ready')));await h.flush();
    assert.ok(h.copies.length>before,'The older surface covering the viewport must not block an actual quality upgrade');
    const displayed=[...view.querySelectorAll<HTMLCanvasElement>('[data-pdf-detail-tile]')].find(c=>c.style.visibility==='visible')!;
    assert.equal(displayed.width,1785);
    const sharp=h.copies.length;for(let i=0;i<80;i++){h.setScale(1+.01*Math.sin(i));view.dispatchEvent(new h.dom.window.Event('pdf-zoom-frame'));}
    assert.equal(h.copies.length,sharp,'A useful upgrade does not add per-tick allocation');
    h.setScale(1);delete view.dataset.zoomGesture;
    await act(async()=>view.dispatchEvent(new h.dom.window.Event('pdf-zoom-end')));await h.flush();
    assert.equal(cancelled,1,'The prepared whole page also releases the obsolete crop job on settlement');
  } finally {await h.close();clearDocCanvasCache('progress-display');}
});

test('PDF pinch starts from retained native pixels rather than a reduced resting sample',async()=>{
  const h=await environment(),source=document.createElement('canvas');source.width=1785;source.height=2526;let renders=0;
  const pdfDoc={getPage:async()=>({getViewport:({scale}:{scale:number})=>({width:595*scale,height:842*scale}),render:()=>{renders++;return {promise:Promise.resolve(),cancel(){}};}})};
  try {
    retainPageDetail('native-display_1',pdfDoc,{canvas:source,scale:1,final:true,tile:{x:0,y:0,width:595,height:842,density:3,pixelsWide:1785,pixelsHigh:2526}});
    await act(async()=>h.root.render(tree(pdfDoc,'native-display',false)));await h.flush();
    const view=document.querySelector<HTMLElement>('.pdf-viewport-container')!,active=()=>[...view.querySelectorAll<HTMLCanvasElement>('[data-pdf-detail-tile]')].find(c=>c.style.visibility==='visible')!;
    assert.equal(active().width,1190);assert.equal(h.copies.length,2); // preview snapshot, then one native screen sample on remount
    view.dataset.zoomGesture='true';await act(async()=>view.dispatchEvent(new h.dom.window.Event('pdf-zoom-start')));h.setScale(.6);
    await act(async()=>view.dispatchEvent(new h.dom.window.Event('pdf-zoom-frame')));await h.flush();
    assert.equal(active(),source,'Pinch presents the actual retained raster');assert.equal(h.copies.length,2,'No full-canvas copy on the first zoom frame');assert.equal(renders,0);
  } finally {await h.close();clearDocCanvasCache('native-display');}
});


async function checkNativeRelease(importedImage: boolean) {
  const h = await environment();
  const source = document.createElement('canvas');
  source.width = 1785;
  source.height = 2526;
  let renders = 0;
  let finish = () => {};
  const pdfDoc = {
    getMetadata: async () => ({
      info: {Custom: importedImage ? {
        [IMAGE_PIXELS_METADATA]: JSON.stringify({1: {width: source.width, height: source.height}}),
      } : {}},
    }),
    async getPage() {
      return {
        getViewport: ({scale}: {scale: number}) => ({width: 595 * scale, height: 842 * scale}),
        render: () => {
          renders++;
          return {promise: new Promise<void>(resolve => { finish = resolve; }), cancel: () => finish()};
        },
      };
    },
  };
  const key = 'release-native';
  try {
    retainPageDetail(key + '_1', pdfDoc, {
      canvas: source, scale: 1, final: true, layoutKey: '1200:900:2',
      tile: {x: 0, y: 0, width: 595, height: 842, density: 3, pixelsWide: source.width, pixelsHigh: source.height},
    });
    await act(async () => h.root.render(tree(pdfDoc, key, true)));
    h.setScale(1.4);
    const view = document.querySelector<HTMLElement>('.pdf-viewport-container')!;
    view.dispatchEvent(new h.dom.window.Event('pdf-zoom-frame'));
    await h.flush();
    const copies = h.copies.length;
    delete view.dataset.zoomGesture;
    view.querySelector<HTMLElement>('[data-page-container]')!.style.setProperty('--pdf-layout-scale', '1.4');
    view.dispatchEvent(new h.dom.window.Event('pdf-zoom-end'));
    await h.flush();
    assert.ok(source.isConnected);
    assert.equal(source.style.visibility, 'visible');
    assert.equal(h.copies.length, copies);
    assert.equal(renders, importedImage ? 0 : 1);
    if (!importedImage) {
      await act(async () => finish());
      await h.flush();
      assert.equal(source.isConnected, false);
      const visible = [...view.querySelectorAll<HTMLCanvasElement>('[data-pdf-detail-tile]')]
        .filter(canvas => canvas.style.visibility === 'visible' && canvas.style.display !== 'none');
      assert.equal(visible.length, 1);
      assert.equal(renders, 1);
    }
  } finally {
    await h.close();
    clearDocCanvasCache(key);
  }
}

test('release keeps displayed PDF pixels until the render at the committed scale is ready', () => checkNativeRelease(false));
test('release keeps an imported image at its original pixel density', () => checkNativeRelease(true));

test('a resized page preview cannot permanently satisfy final PDF sharpness just because it has enough pixels',async()=>{
  const h=await environment();let renders=0,resolve=()=>{};
  const pdfDoc={getPage:async()=>({getViewport:({scale}:{scale:number})=>({width:595*scale,height:842*scale}),
    render:()=>{renders++;return {promise:new Promise<void>(done=>{resolve=done;}),cancel(){resolve();}};}})};
  try {
    await act(async()=>h.root.render(tree(pdfDoc,'preview-quality',false,true,true)));await h.flush();
    assert.equal(renders,1,'A derived thumbnail needs one native final render, unlike an original PDF raster');
    await act(async()=>resolve());await h.flush();
    assert.equal(renders,1,'The completed native result must not create a refinement loop');
  } finally {await h.close();clearDocCanvasCache('preview-quality');}
});

test('releasing a long pinch preserves useful in-flight pixels even when a later refinement needs more resolution',async()=>{
  const h=await environment();let cancelled=0;
  const jobs:{resolve:()=>void}[]=[];
  const pdfDoc={getPage:async()=>({getViewport:({scale}:{scale:number})=>({width:595*scale,height:842*scale}),
    render:()=>{let resolve=()=>{};const promise=new Promise<void>(done=>resolve=done);jobs.push({resolve});return {promise,cancel(){cancelled++;resolve();}};}})};
  try {
    await act(async()=>h.root.render(tree(pdfDoc,'long-pinch',true,true)));await h.flush();
    const view=document.querySelector<HTMLElement>('.pdf-viewport-container')!;
    h.setScale(2.1);await act(async()=>view.dispatchEvent(new h.dom.window.Event('pdf-zoom-frame')));await h.flush();
    delete view.dataset.zoomGesture;
    view.querySelector<HTMLElement>('[data-page-container]')!.style.setProperty('--pdf-layout-scale','2.1');
    await act(async()=>view.dispatchEvent(new h.dom.window.Event('pdf-zoom-end')));await h.flush();
    assert.equal(cancelled,0,'Release keeps the useful pending raster');
    assert.equal(jobs.length,1);
    const before=h.copies.length;await act(async()=>jobs[0].resolve());await h.flush();
    assert.ok(h.copies.length>before,'Completed pixels are displayed before higher-resolution refinement');
    assert.equal(jobs.length,2,'Only the still-missing final density starts another render');
    await act(async()=>jobs[1].resolve());await h.flush();
    assert.equal(jobs.length,2);
  } finally {await h.close();clearDocCanvasCache('long-pinch');}
});

test('a complete native page survives a later crop and restores a smaller mode without replaying PDF work',async()=>{
  const h=await environment(),saved=Object.getOwnPropertyDescriptor(globalThis,'createImageBitmap');let renders=0;
  Object.defineProperty(globalThis,'createImageBitmap',{configurable:true,value:async(source:HTMLCanvasElement)=>({width:source.width,height:source.height,close(){}})});
  const pdfDoc={getPage:async()=>({getViewport:({scale}:{scale:number})=>({width:595*scale,height:842*scale}),render:()=>{renders++;return {promise:Promise.resolve(),cancel(){}};}})};
  try {
    await act(async()=>h.root.render(tree(pdfDoc,'full-return',false)));await h.flush();
    assert.ok(getPageRaster('full-return_1',pdfDoc)?.density!>=3);
    const view=document.querySelector<HTMLElement>('.pdf-viewport-container')!;
    h.setScale(3);view.querySelector<HTMLElement>('[data-page-container]')!.style.setProperty('--pdf-layout-scale','3');
    await act(async()=>view.dispatchEvent(new h.dom.window.Event('pdf-zoom-end')));await h.flush();
    const count=renders;assert.ok(count>=2);
    await act(async()=>h.root.render(null));h.setScale(.5);
    await act(async()=>h.root.render(tree(pdfDoc,'full-return',false,false,false,.5)));await h.flush();
    assert.equal(renders,count,'The whole-page cache covers areas outside the last zoom crop');
    assert.ok([...document.querySelectorAll<HTMLCanvasElement>('[data-pdf-detail-tile]')].some(c=>c.style.visibility==='visible' && c.width>1));
  } finally {await h.close();clearDocCanvasCache('full-return');if(saved)Object.defineProperty(globalThis,'createImageBitmap',saved);else delete (globalThis as any).createImageBitmap;}
});
