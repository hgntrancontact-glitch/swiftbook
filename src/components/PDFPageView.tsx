import {importedImagePixels,nativeImageTile} from '../utils/imagePdfResolution';
import {takePageDetail,retainPageDetail,takePageDetailPreview,retainPageDetailPreview,clearPageDetails,detailCacheRevision} from '../utils/pdfDetailCache';
import {QuickShapesLayer} from './QuickShapesLayer';
import {detailRasterOwnership} from '../utils/pdfRasterOwnership';
import { presentDetailSample,positionDetailCanvas,hasPaintedContent } from '../utils/pdfDetailSurface';
import { rasterSampleRect, settledDetailSample, needsFinalDetailRender, alignDetailTile, detailPixelAligned, detailIntersects, sourceCoversDensity, oversampleDetail, scaledDetailCovers, reuseDetailSurface, nativeDetailPresentation, type PreparedDetail } from '../utils/pdfRasterSampling';
import { canPresentRaster, canReplaceRaster, sameRasterScale } from '../utils/rasterPresentation';
import { PageNumberLabel } from './PageNumberLabel';
import { PdfRenderQueue } from '../utils/pdfRenderQueue';
import { pdfDetailTile, detailViewportTransform, type DetailTile } from '../utils/pdfDetailTile';
import { canvasViewportTransform } from '../utils/pageCoordinates';
import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import {
  HighlightAnnotation,
  TextNoteAnnotation,
  DrawingStroke,
  BoxAnnotation,
  BoxConfig,
  FreeTextAnnotation,
  ActiveTool,
  NormalizedRect,
  HighlightColor,
} from '../types';
import { HighlightOverlay } from './HighlightOverlay';
import { SimulatedSelectionLayer } from './SimulatedSelectionLayer';
import { StickyNotesLayer } from './StickyNotesLayer';
import { BoxAnnotationsLayer } from './BoxAnnotationsLayer';
import { FreeTextLayer } from './FreeTextLayer';
import { DrawingCanvas } from './DrawingCanvas';
import { AlertCircle, RefreshCw } from 'lucide-react';

import { getPageRaster, rememberPageRaster, clearPageRasters, rasterDensity, getRasterCacheUsage } from '../utils/pdfRasterCache';

interface PDFPageViewProps {
  fileId: string;
  pdfDoc: any;
  visualViewportScale?: number;
  pageNumber: number;
  scale: number;
  activeTool: ActiveTool;
  penColor: string;
  penSize: number;
  penOpacity?: number;
  eraserSize?: number;
  highlightColorHex?: string;
  highlightColor?: HighlightColor;
  boxColor?: string;
  boxConfig?: BoxConfig;
  onUpdateBoxConfig?: (updates: Partial<BoxConfig>) => void;
  highlights: HighlightAnnotation[];
  textNotes: TextNoteAnnotation[];
  drawings: DrawingStroke[];
  boxes: BoxAnnotation[];
  freeTexts: FreeTextAnnotation[];
  onTextSelected: (
    pageNumber: number,
    text: string,
    rects: NormalizedRect[],
    clientPos: { x: number; y: number }
  ) => void;
  onAddHighlight?: (highlight: HighlightAnnotation) => void;
  onAddNote: (note: Omit<TextNoteAnnotation, 'id' | 'createdAt'>) => void;
  onUpdateNote: (id: string, updates: Partial<TextNoteAnnotation>, skipHistory?: boolean) => void;
  onDeleteNote: (id: string) => void;
  onAddBox: (box: Omit<BoxAnnotation, 'id' | 'createdAt'>) => void;
  onUpdateBox: (id: string, updates: Partial<BoxAnnotation>, skipHistory?: boolean) => void;
  onDeleteBox: (id: string) => void;
  onAddFreeText: (text: Omit<FreeTextAnnotation, 'id' | 'createdAt'>) => void;
  onUpdateFreeText: (id: string, updates: Partial<FreeTextAnnotation>, skipHistory?: boolean) => void;
  onDeleteFreeText: (id: string) => void;
  onDeleteHighlight: (id: string) => void;
  onUpdateHighlight?: (id: string, updates: Partial<HighlightAnnotation>, skipHistory?: boolean) => void;
  onUpdateHighlightNote?: (id: string, note: string) => void;
  onUpdateHighlightColor?: (id: string, color: any) => void;
  onAddStroke: (stroke: Omit<DrawingStroke, 'id' | 'createdAt'>) => string | void;
  onUpdateStroke?: (strokeId: string, updates: Partial<DrawingStroke>, skipHistory?: boolean) => void;
  onDeleteStroke: (strokeId: string) => void;
  onActiveToolChange?: (tool: ActiveTool) => void;
  isBookMode?: boolean;
  bookPageSide?: 'left' | 'right' | 'single';
  selectedIds?: string[];
  onSelect?: (id: string, isShift: boolean) => void;
  totalPages?: number;
}

export const pageDimensionCache = new Map<string, { width: number; height: number }>();
const pagePreviews = new Map<string, { pdfDoc: any; canvas: HTMLCanvasElement; density:number }>();
const PREVIEW_PIXEL_BUDGET = 12_000_000;

function rememberPagePreview(key: string, pdfDoc: any, source: HTMLCanvasElement, density:number, detail?:{tile:DetailTile;scale:number;size:{width:number;height:number}}) {
  const sourceWidth=detail?detail.size.width*density:source.width,sourceHeight=detail?detail.size.height*density:source.height;
  const ratio = Math.min(1, 1200 / Math.max(sourceWidth, sourceHeight));
  const preview = document.createElement('canvas');
  preview.width = Math.max(1, Math.round(sourceWidth * ratio));
  preview.height = Math.max(1, Math.round(sourceHeight * ratio));
  const context=preview.getContext('2d', { alpha: false });
  if(context) {
    context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
    context.fillStyle='#fff';context.fillRect(0,0,preview.width,preview.height);
    if(detail) {
      const {tile,scale,size}=detail;
      context.drawImage(source,0,0,source.width,source.height,tile.x/scale/size.width*preview.width,tile.y/scale/size.height*preview.height,
        tile.width/scale/size.width*preview.width,tile.height/scale/size.height*preview.height);
    } else context.drawImage(source, 0, 0, preview.width, preview.height);
  }
  const previous = pagePreviews.get(key);
  if (previous) { previous.canvas.width = 0; previous.canvas.height = 0; }
  pagePreviews.delete(key);
  pagePreviews.set(key, { pdfDoc, canvas: preview, density:density*ratio });
  let pixels = [...pagePreviews.values()].reduce((sum, entry) => sum + entry.canvas.width * entry.canvas.height, 0);
  for (const [oldKey, entry] of pagePreviews) {
    if (pixels <= PREVIEW_PIXEL_BUDGET) break;
    pixels -= entry.canvas.width * entry.canvas.height;
    entry.canvas.width = 0;
    entry.canvas.height = 0;
    pagePreviews.delete(oldKey);
  }
}

// Function to clean up all cached dimension data when a document is closed
export function clearDocCanvasCache(docId: string) {
  clearPageRasters(docId);
  clearPageDetails(docId);
  for (const [key, entry] of pagePreviews) {
    if (key.startsWith(`${docId}_`)) {
      entry.canvas.width = 0;
      entry.canvas.height = 0;
      pagePreviews.delete(key);
    }
  }
  for (const key of pageDimensionCache.keys()) {
    if (key.startsWith(`${docId}_`)) {
      pageDimensionCache.delete(key);
    }
  }
}

// Prepare adjacent spreads in a preemptible slot while the current page is
// idle. Their first paint can use actual PDF pixels across view modes.
export function prepareAdjacentPages(pdfDoc:any,docId:string,numbers:number[],scale:number) {
  let cancelled=false;
  let task:any=null;
  let slot:ReturnType<typeof requestPdfRenderSlot>|null=null;
  const stop=()=>{cancelled=true;slot?.cancel();task?.cancel();};
  void (async()=>{
    for(const number of numbers) {
      if(cancelled)return;
      let canvas:HTMLCanvasElement|null=null,release:(()=>void)|null=null;
      try {
        const page=await pdfDoc.getPage(number);
        if(cancelled)return;
        const size=page.getViewport({scale:1});
        const density=Math.min(rasterDensity(size,scale),Math.sqrt(4_000_000/(size.width*size.height)));
        const key=docId+'_'+number;
        const cached=getPageRaster(key,pdfDoc);
        if(cached && cached.density>=density-.002)continue;
        slot=requestPdfRenderSlot(10,stop);
        release=await slot.promise;
        if(!release || cancelled)return;
        const viewport=page.getViewport({scale:density});
        canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(viewport.width));
        canvas.height=Math.max(1,Math.round(viewport.height));
        const context=canvas.getContext('2d',{alpha:false});
        if(!context)return;
        context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
        task=page.render({canvasContext:context,viewport,background:'#fff',transform:canvasViewportTransform(viewport,canvas)});
        await task.promise;
        if(cancelled)return;
        pageDimensionCache.set(key,{width:size.width,height:size.height});
        rememberPagePreview(key,pdfDoc,canvas,density);
        rememberPageRaster(key,pdfDoc,canvas,density,size,false);
      } catch(error:any) {
        if(!cancelled && error?.name!=='RenderingCancelledException')console.warn('Adjacent page preparation failed',error);
      } finally {
        if(canvas)canvas.width=canvas.height=1;
        release?.();slot=null;task=null;
      }
    }
  })();
  return stop;
}

type RenderSample = { page: number; doc: string; scale: number; queueMs: number; renderMs: number; outcome: string; active: number };
const renderSamples: RenderSample[] = [];
const detailSamples:{page:number;scale:number;sampleMs:number;kind:'sample'|'native'|'progress';zooming:boolean}[]=[];
const renderQueue = new PdfRenderQueue(callback => requestAnimationFrame(callback), 2);
let rasterCacheHits = 0;
export function getPdfRenderDiagnostics(reset = false) {
  const result = { active: renderQueue.active, queued: renderQueue.queued, peak: renderQueue.peak, cacheHits: rasterCacheHits, rasterCache: getRasterCacheUsage(), samples: [...renderSamples], detailSamples:[...detailSamples] };
  if (reset) { renderSamples.length = 0; detailSamples.length=0; renderQueue.peak = renderQueue.active; rasterCacheHits = 0; }
  return result;
}
function requestPdfRenderSlot(priority:number, preempt?:()=>void) {
  return renderQueue.request(priority,preempt);
}

// The effect owns these two surfaces; React never resizes/swaps them mid-pinch.
export function PDFDetailTile({ pdfDoc, pageNumber, size, near, cacheKey, onReady, onMeasure }: {pdfDoc:any;pageNumber:number;size:{width:number;height:number};near:boolean;cacheKey:string;onReady?:()=>void;onMeasure?:(size:{width:number;height:number})=>void}) {
  const nativeHostRef=useRef<HTMLSpanElement>(null);
  const canvasRefs=useRef<[HTMLCanvasElement|null,HTMLCanvasElement|null]>([null,null]);
  const readyRef=useRef(onReady);readyRef.current=onReady;
  const measureRef=useRef(onMeasure);measureRef.current=onMeasure;
  useLayoutEffect(()=> {
    const canvases=canvasRefs.current;
    const page=canvases[0]?.closest<HTMLElement>('[data-page-container="true"]');
    const view=page?.closest<HTMLElement>('.pdf-viewport-container');
    if(!page || !view || !canvases[0] || !canvases[1]) return;
    const surfaces=[canvases[0],canvases[1]];
    let front=-1,frame=0,panEndFrame=0,key='',disposed=false,rendering=false,refreshAfterRender=false,generation=0;
    let lastSource:CanvasImageSource|null=null;
    let nativeSourceOnSurface=false;
    let settlePixelGrid=true;
    let presented:PreparedDetail|null=null;
    let runningTarget:{scale:number;final:boolean;tile:DetailTile;epoch:string|undefined}|null=null;
    const owner={};let failed=false,owned=false;
    const releaseOwnership=(notify=false)=>{
      const wasOwned=owned;owned=false;detailRasterOwnership.release(page,owner);
      if(notify && wasOwned)page.dispatchEvent(new Event('pdf-detail-fallback'));
    };
    let imagePixels:{width:number;height:number}|null=null;
    let detailSource:{canvas:HTMLCanvasElement;tile:DetailTile;scale:number;final:boolean;layoutKey?:string}|null=null;
    let cancelCurrent=()=>{};
    const nativeHost=nativeHostRef.current!;
    // During a pinch the completed raster is immutable. Mount it directly:
    // copying an entire multi-megapixel canvas blocks the first zoom frame.
    const present=(source:CanvasImageSource,crop:{x:number;y:number;width:number;height:number},tile:DetailTile,scale:number,native:boolean)=>{
      if(native && source===detailSource?.canvas) {
        const canvas=detailSource.canvas;
        canvas.className='absolute pointer-events-none';
        canvas.dataset.pdfDetailTile='true';
        positionDetailCanvas(canvas,tile,scale);
        if(canvas.parentNode!==nativeHost) nativeHost.replaceChildren(canvas);
        if(front>=0) surfaces[front].style.visibility='hidden';
        return front;
      }
      const next=presentDetailSample(surfaces,front,source,crop,tile,scale);
      nativeHost.replaceChildren();
      return next;
    };
    const hide=(notify=false)=>{nativeHost.replaceChildren();for(const canvas of surfaces) canvas.style.display='none';front=-1;key='';presented=null;nativeSourceOnSurface=false;releaseOwnership(notify);};
    if(!near) {hide();return;}
    const cacheRevision=detailCacheRevision(cacheKey);
    detailSource=takePageDetail(cacheKey,pdfDoc);
    let previewSource=takePageDetailPreview(cacheKey,pdfDoc);
    if(detailSource && previewSource) {previewSource.canvas.width=previewSource.canvas.height=1;previewSource=null;}
    const input=()=> {
      const r=page.getBoundingClientRect(),v=view.getBoundingClientRect();
      const zooming=view.dataset.zoomGesture==='true';
      // DOM rects are rounded to layout subpixels. Use the committed PDF scale
      // at rest so the final bitmap is not fractionally resized by CSS again.
      const liveScale=zooming?r.width/size.width:(parseFloat(page.style.getPropertyValue('--pdf-layout-scale')) || r.width/size.width);
      const visible={left:Math.max(0,v.left-r.left,-r.left),top:Math.max(0,v.top-r.top,-r.top),
        right:Math.min(size.width*liveScale,v.right-r.left,window.innerWidth-r.left),bottom:Math.min(size.height*liveScale,v.bottom-r.top,window.innerHeight-r.top)};
      const crop=pdfDetailTile(size,visible,liveScale,window.devicePixelRatio||1);
      const tile=crop && !zooming ? alignDetailTile(crop,r.left,r.top,liveScale) : crop;
      return {liveScale,visible,tile,zooming,pageRect:r,
        requiredDensity:Math.min(tile?.density || 0,imagePixels ? imagePixels.width/size.width : Infinity),
        layoutKey:`${v.width}:${v.height}:${window.devicePixelRatio || 1}`};
    };
    const measure=()=> {
      if(frame) cancelAnimationFrame(frame);frame=0;
      if(disposed) return;
      const started=performance.now(),{liveScale,visible,tile,zooming,pageRect,layoutKey,requiredDensity}=input();
      if(view.dataset.renderVisible==='false' || !tile) {cancelCurrent();hide(true);return;}
      const original=imagePixels && nativeImageTile(tile,liveScale,size,imagePixels);
      const hasOriginal=!!(imagePixels && detailSource && sameRasterScale(detailSource.tile.density,imagePixels.width/size.width) &&
        scaledDetailCovers(detailSource.tile,detailSource.scale,liveScale,visible,0));
      const needsOriginal=!!original && !hasOriginal;
      // The live PDF surface already maps immutable page pixels to PDF
      // coordinates. Keep it through release if it covers this viewport at
      // device resolution. A second filtered copy would change the glyph
      // edges even though the source and the final zoom are identical.
      if (!zooming && !imagePixels && nativeSourceOnSurface && detailSource &&
          detailSource.layoutKey === layoutKey && detailSource.tile.density <= requiredDensity * 3 &&
          scaledDetailCovers(detailSource.tile, detailSource.scale, liveScale, visible, requiredDensity)) {
        owned = true;
        detailRasterOwnership.claim(page, owner, liveScale, view.dataset.zoomEpoch);
        presented = {tile: nativeDetailPresentation(detailSource, liveScale), scale: liveScale, final: true};
        settlePixelGrid = false;
        if (rendering) cancelCurrent();
        return;
      }
      // A screen-sized resting buffer has already been filtered. Start each
      // pinch from the retained PDF/image source, then reuse those pixels for
      // subsequent ticks instead of magnifying the reduced display buffer.
      const needsPinchOriginal=zooming && !nativeSourceOnSurface && !!detailSource &&
        scaledDetailCovers(detailSource.tile,detailSource.scale,liveScale,visible,0) &&
        (hasOriginal || lastSource===detailSource.canvas);
      if(!needsOriginal && !zooming && !settlePixelGrid && presented?.final && sameRasterScale(presented.scale,liveScale) &&
        scaledDetailCovers(presented.tile,presented.scale,liveScale,visible,requiredDensity)) {
        if(rendering && runningTarget && !runningTarget.final)cancelCurrent();
        return;
      }
      if(!needsOriginal && !needsPinchOriginal && reuseDetailSurface(presented,liveScale,visible,requiredDensity,zooming)) {
        // Reversing a gesture can restore an already sharp full surface. A
        // pending narrow crop then adds nothing and should not occupy a slot.
        if(rendering && runningTarget && !scaledDetailCovers(runningTarget.tile,runningTarget.scale,liveScale,visible,requiredDensity)) cancelCurrent();
        return;
      }
      const cached=getPageRaster(cacheKey,pdfDoc);
      const fallback=[...page.querySelectorAll<HTMLCanvasElement>('canvas[data-raster-density]')].find(canvas=>getComputedStyle(canvas).visibility!=='hidden' && canvas.width>1);
      if(!zooming && !failed) {owned=true;detailRasterOwnership.claim(page,owner,liveScale,view.dataset.zoomEpoch);}
      let sampleTile=tile;
      let sourceDensity=0;
      let source:CanvasImageSource|null=null,crop:{x:number;y:number;width:number;height:number}|null=null;
      const full=cached && (!fallback || cached.bitmap.width*cached.bitmap.height>=fallback.width*fallback.height)?cached.bitmap:fallback;
      const fullIsNative=!!full && (full===cached?.bitmap || (full===fallback && fallback?.dataset.rasterPreview!=='true'));
      const fullDensity=full?Math.min(full.width/size.width,full.height/size.height):0;
      const prepared=detailSource || previewSource;
      if(prepared && scaledDetailCovers(prepared.tile,prepared.scale,liveScale,visible,0) && (hasOriginal || prepared.tile.density>=fullDensity)) {
        source=prepared.canvas;sourceDensity=prepared.tile.density;
        const sample=zooming?{tile:nativeDetailPresentation(prepared,liveScale),crop:{x:0,y:0,width:prepared.canvas.width,height:prepared.canvas.height}}:
          settledDetailSample(prepared.canvas,prepared,tile,liveScale,pageRect.left,pageRect.top);
        sampleTile=sample.tile;crop=sample.crop;
      } else {
        if(full) {
          source=full;sourceDensity=fullDensity;
          // Retain available density headroom in the visible crop. This avoids
          // repeated downsample/reallocation during the next pinch frames.
          if(zooming) {
            const headroom=oversampleDetail(tile);
            if(sourceCoversDensity(full,size,headroom.density)) sampleTile=headroom;
          }
          crop=rasterSampleRect(full,size,sampleTile,liveScale);
        }
      }
      const nativeFull=!zooming && fallback && fallback.dataset.rasterPreview!=='true' && sameRasterScale(Number(fallback.dataset.renderedScale),liveScale) &&
        Math.abs(Number(fallback.dataset.rasterDensity)-tile.density)<.0001 &&
        Math.abs(fallback.width-pageRect.width*tile.density/liveScale)<1e-6 &&
        Math.abs(fallback.height-pageRect.height*tile.density/liveScale)<1e-6 &&
        detailPixelAligned({...tile,x:0,y:0},pageRect.left,pageRect.top,liveScale);
      if(nativeFull && !needsOriginal) {cancelCurrent();hide();settlePixelGrid=false;readyRef.current?.();return;}
      const needsFinal=!failed && !zooming && (needsOriginal ||
        (needsFinalDetailRender(detailSource,liveScale,visible,requiredDensity,false) && !(source===full && fullIsNative && sourceDensity>=requiredDensity-.002)));
      const needsPreview=zooming && (needsOriginal || sourceDensity<requiredDensity-.002);
      if(source && crop) {
        const signature=[sampleTile.x,sampleTile.y,sampleTile.width,sampleTile.height,sampleTile.density].join(':');
        const improvesQuality=!!presented && Math.min(sampleTile.density,sourceDensity)>presented.tile.density+.002;
        if((key!==signature || lastSource!==source || needsPinchOriginal) &&
          (needsPinchOriginal || improvesQuality || !reuseDetailSurface(presented,liveScale,visible,0,zooming))) {
          const previous=front;
          front=present(source,crop,sampleTile,liveScale,zooming);
          nativeSourceOnSurface=zooming && source===detailSource?.canvas;
          // The native source is retained separately. Keeping a second hidden
          // viewport-sized backing buffer only increases GPU/memory pressure.
          if(previous>=0 && previous!==front) surfaces[previous].width=surfaces[previous].height=1;
          // Enlarging a fallback buffer does not create more PDF detail.
          presented={tile:{...sampleTile,density:Math.min(sampleTile.density,sourceDensity)},scale:liveScale,final:!zooming && !needsFinal};
          key=signature;lastSource=source;readyRef.current?.();
          detailSamples.push({page:pageNumber,scale:liveScale,sampleMs:performance.now()-started,kind:'sample',zooming});
          if(detailSamples.length>200) detailSamples.shift();
        }
        if(!needsFinal && !needsPreview) {
          // A sharp fallback can replace a narrow in-flight pinch crop after
          // zooming back out. Cancel that now-useless work here too, not only
          // in the early surface-reuse branch, so it cannot occupy a slot.
          if(rendering && runningTarget && !runningTarget.final && (!zooming ||
            !scaledDetailCovers(runningTarget.tile,runningTarget.scale,liveScale,visible,requiredDensity))) cancelCurrent();
          if(!zooming) {
            settlePixelGrid=false;
          }
          return;
        }
      }
      if(failed) return;
      if(rendering) {
        refreshAfterRender=true;
        // Scroll/resize can change the pixel phase while this PDF is decoding.
        // Publish useful pixels, then refine at the new origin. Cancelling on
        // every fractional movement starves heavy pages indefinitely.
        if(runningTarget && (runningTarget.epoch!==view.dataset.zoomEpoch ||
          !detailIntersects(runningTarget.tile,runningTarget.scale,liveScale,visible))) cancelCurrent();
        return;
      }
      const final=!zooming;
      // A page entering the continuous view competes with the next page.
      // Paint new pixels at the display's DPR first. Speculative zoom
      // headroom costs 2.25x the pixels at a time when the reader is scrolling.
      const firstScrollPaint = final && !detailSource && !!page.closest('[data-continuous-page]');
      const targetForView = (crop: DetailTile) => firstScrollPaint ? crop : oversampleDetail(crop);
      let target=targetForView(tile),targetLayoutKey=layoutKey;
      const epoch=view.dataset.zoomEpoch,own=++generation;
      rendering=true;refreshAfterRender=false;runningTarget={scale:liveScale,final,tile:target,epoch};
      let cancelled=false,task:any=null,handle:ReturnType<typeof requestPdfRenderSlot>|null=null,progressFrame=0;
      cancelCurrent=()=>{cancelled=true;cancelAnimationFrame(progressFrame);progressFrame=0;handle?.cancel();task?.cancel();};
      void (async()=> {
        let release:(()=>void)|null=null,canvas:HTMLCanvasElement|null=null,probe:HTMLCanvasElement|null=null,retained=false;
        const stale=()=>disposed || cancelled || own!==generation || !page.isConnected || view.dataset.zoomEpoch!==epoch || view.dataset.renderVisible==='false';
        try {
          const proxy=await pdfDoc.getPage(pageNumber);
          if(stale()) return;
          const actual=proxy.getViewport({scale:1});
          if(Number.isFinite(actual.width) && Number.isFinite(actual.height)) {
            measureRef.current?.({width:actual.width,height:actual.height});
            if(measureRef.current && (Math.abs(actual.width-size.width)>.001 || Math.abs(actual.height-size.height)>.001)) return;
          }
          handle=requestPdfRenderSlot(page.closest('[data-workspace-doc]')?.getAttribute('data-active')==='true'?-1:0,cancelCurrent);
          release=await handle.promise;if(!release || stale()) return;
          const queued=input();
          if(!queued.tile || (final?(queued.zooming || !sameRasterScale(liveScale,queued.liveScale)):
            !detailIntersects(target,liveScale,queued.liveScale,queued.visible))) {
            refreshAfterRender=true;return;
          }
          // Work waiting for a slot has not drawn anything yet. Retarget it in
          // place instead of cancelling and rejoining the queue after a resize.
          if(final) {target=targetForView(queued.tile);targetLayoutKey=queued.layoutKey;runningTarget!.tile=target;}
          else {
            target=nativeDetailPresentation({tile:queued.zooming?oversampleDetail(queued.tile):queued.tile,scale:queued.liveScale,final:false},liveScale);
            runningTarget!.tile=target;
          }
          // Keep imported images at their original pixel grid. Rendering
          // it first at screen resolution and later sampling that preview on
          // zoom-out filters small screenshot text twice. Never upscale this
          // canonical source; large images use bounded native crops when possible.
          const original=imagePixels && nativeImageTile(target,liveScale,size,imagePixels);
          if(original) {target=original;runningTarget!.tile=target;}
          detailRasterOwnership.preparingPreview(page,owner,target.x<=0 && target.y<=0 &&
            (target.x+target.width)/liveScale>=size.width-1e-6 && (target.y+target.height)/liveScale>=size.height-1e-6);
          canvas=document.createElement('canvas');canvas.width=target.pixelsWide;canvas.height=target.pixelsHigh;
          const context=canvas.getContext('2d',{alpha:false});
          if(!context)throw new Error('Could not create detail canvas context');
          context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
          task=proxy.render({canvasContext:context,viewport:proxy.getViewport({scale:liveScale}),background:'#fff',transform:detailViewportTransform(target)});
          // A first-time heavy page may execute several PDF chunks before its
          // images/fonts finish. Publish one real intermediate raster instead
          // of keeping already drawn text hidden until the entire task ends.
          // Existing pages keep their previous complete pixels throughout.
          task.onContinue=(resume:()=>void)=>{
            if(front<0 && !nativeHost.firstChild && !progressFrame && !stale()) {
              progressFrame=requestAnimationFrame(()=>{
                progressFrame=0;
                const latest=input();
                if(stale() || front>=0 || nativeHost.firstChild || !canvas || latest.zooming || !latest.tile || !sameRasterScale(liveScale,latest.liveScale) ||
                  !scaledDetailCovers(target,liveScale,latest.liveScale,latest.visible,latest.requiredDensity))return;
                probe ||= document.createElement('canvas');
                if(!hasPaintedContent(canvas,probe))return;
                front=presentDetailSample(surfaces,front,canvas,{x:0,y:0,width:canvas.width,height:canvas.height},target,liveScale);
                presented={tile:target,scale:liveScale,final:false};readyRef.current?.();
                detailSamples.push({page:pageNumber,scale:liveScale,sampleMs:performance.now()-started,kind:'progress',zooming:false});
                if(detailSamples.length>200)detailSamples.shift();
              });
            }
            resume();
          };
          await task.promise;
          if(stale()) return;
          const latest=input();
          if(!latest.tile || !detailIntersects(target,liveScale,latest.liveScale,latest.visible)) {refreshAfterRender=true;return;}
          // Keep the completed PDF render as the canonical source. Only the
          // display buffer is resampled; it never becomes a future source.
          const previousSource=detailSource;
          if(previewSource) {previewSource.canvas.width=previewSource.canvas.height=1;previewSource=null;}
          detailSource={canvas,tile:target,scale:liveScale,final,layoutKey:targetLayoutKey};retained=true;
          // A crop can still contain useful visible text after a large scroll.
          // Show it immediately, even if another crop must fill the new edge.
          const native = latest.zooming || (firstScrollPaint && !imagePixels &&
            sameRasterScale(liveScale,latest.liveScale) && detailPixelAligned(target,latest.pageRect.left,latest.pageRect.top,liveScale));
          const previous=front,sample=native?{tile:nativeDetailPresentation(detailSource,latest.liveScale),crop:{x:0,y:0,width:canvas.width,height:canvas.height}}:
            settledDetailSample(canvas,detailSource,latest.tile,latest.liveScale,latest.pageRect.left,latest.pageRect.top),display=sample.tile;
          front=present(canvas,sample.crop,display,latest.liveScale,native);
          nativeSourceOnSurface=native;
          if(previousSource)previousSource.canvas.width=previousSource.canvas.height=1;
          if(previous>=0 && previous!==front)surfaces[previous].width=surfaces[previous].height=1;
          presented={tile:display,scale:latest.liveScale,final:!latest.zooming && !needsFinalDetailRender(detailSource,latest.liveScale,latest.visible,latest.requiredDensity,false)};
          if(presented.final)settlePixelGrid=false;
          lastSource=canvas;key=[display.x,display.y,display.width,display.height,display.density].join(':');
          // A finished crop covering the page already contains the fallback
          // pixels. Derive the thumbnail once instead of replaying the whole
          // PDF in a second background render just to create that thumbnail.
          if(target.x<=0 && target.y<=0 &&
            (target.x+target.width)/liveScale>=size.width-1e-6 && (target.y+target.height)/liveScale>=size.height-1e-6) {
            if(pagePreviews.get(cacheKey)?.pdfDoc!==pdfDoc)
              rememberPagePreview(cacheKey,pdfDoc,canvas,target.density,{tile:target,scale:liveScale,size});
            // Preserve the full page before a later zoom replaces this source
            // with a small crop. Normalize its pixel-aligned overscan once.
            const known=getPageRaster(cacheKey,pdfDoc);
            if(typeof createImageBitmap==='function' && (!known || known.density<target.density-.002)) {
              const full=document.createElement('canvas');
              full.width=Math.max(1,Math.round(size.width*target.density));
              full.height=Math.max(1,Math.round(size.height*target.density));
              const context=full.getContext('2d',{alpha:false});
              if(context) {
                context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
                context.fillStyle='#fff';context.fillRect(0,0,full.width,full.height);
                context.drawImage(canvas,0,0,canvas.width,canvas.height,
                  target.x/liveScale/size.width*full.width,target.y/liveScale/size.height*full.height,
                  target.width/liveScale/size.width*full.width,target.height/liveScale/size.height*full.height);
                rememberPageRaster(cacheKey,pdfDoc,full,target.density,size,false);
              }
              full.width=full.height=1;
            }
          }
          readyRef.current?.();
          refreshAfterRender=true;
          detailSamples.push({page:pageNumber,scale:liveScale,sampleMs:performance.now()-started,kind:'native',zooming:view.dataset.zoomGesture==='true'});
          if(detailSamples.length>200) detailSamples.shift();
        } catch(error:any) {
          if(!stale() && error?.name!=='RenderingCancelledException') {
            failed=true;releaseOwnership();
            page.dispatchEvent(new Event('pdf-detail-fallback'));
            console.warn('Detail tile failed',error);
          }
        } finally {
          detailRasterOwnership.preparingPreview(page,owner,false);
          cancelAnimationFrame(progressFrame);progressFrame=0;
          if(probe)probe.width=probe.height=1;
          if(canvas && !retained) canvas.width=canvas.height=1;
          release?.();rendering=false;runningTarget=null;
          if(!disposed && refreshAfterRender && page.isConnected) schedule();
        }
      })();
    };
    const schedule=()=>{if(!disposed && !frame)frame=requestAnimationFrame(measure);};
    // Reuse prepared sources across gestures; only asynchronous obsolete work
    // is invalidated. Ending a gesture is not a reason to discard sharp pixels.
    const start=()=>{generation++;cancelCurrent();failed=false;releaseOwnership();};
    view.addEventListener('scroll',schedule,{passive:true});
    view.addEventListener('pdf-viewport-visibility',measure);view.addEventListener('pdf-zoom-frame',measure);
    view.addEventListener('pdf-raster-ready',schedule);
    view.addEventListener('pdf-zoom-start',start);view.addEventListener('pdf-zoom-end',measure);
    const resized=()=>{settlePixelGrid=true;schedule();};
    // Translated pan beyond native scroll bounds has no browser scrollend.
    // Refine when its geometry stays unchanged across paints; continuous input
    // cancels this check without cancelling the useful PDF render itself.
    const pan=()=>{
      schedule();cancelAnimationFrame(panEndFrame);
      panEndFrame=requestAnimationFrame(()=>{
        const before=page.getBoundingClientRect();
        panEndFrame=requestAnimationFrame(()=>{
          panEndFrame=0;const after=page.getBoundingClientRect();
          if(view.dataset.zoomGesture!=='true' && before.left===after.left && before.top===after.top)resized();
        });
      });
    };
    view.addEventListener('pdf-viewport-pan',pan);
    // Native scrolling can end on a fractional device pixel even at unchanged
    // zoom. Refine once at its final origin, not at every momentum tick.
    view.addEventListener('scrollend',resized);
    const resize=new ResizeObserver(resized);resize.observe(view);resize.observe(page);
    window.addEventListener('resize',resized);
    // Moving Chrome between displays or changing browser zoom can change DPR
    // without changing this element's CSS dimensions.
    let resolution:MediaQueryList|undefined;
    const resolutionChanged=()=>{resized();watchResolution();};
    const watchResolution=()=>{
      resolution?.removeEventListener('change',resolutionChanged);
      resolution=window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      resolution?.addEventListener('change',resolutionChanged);
    };
    watchResolution();
    void importedImagePixels(pdfDoc,pageNumber,size).then(pixels=>{
      if(!disposed && pixels) {imagePixels=pixels;settlePixelGrid=true;schedule();}
    });
    // Restore before paint, including a mode change at another scale. Keep the
    // old pixels until this viewport's exact native result is ready.
    const restored=detailSource || previewSource;
    if(restored) {
      const {liveScale,visible,tile,zooming,pageRect}=input();
      const sample=!zooming && tile?settledDetailSample(restored.canvas,restored,tile,liveScale,pageRect.left,pageRect.top):
        {tile:nativeDetailPresentation(restored,liveScale),crop:{x:0,y:0,width:restored.canvas.width,height:restored.canvas.height}};
      front=present(restored.canvas,sample.crop,sample.tile,liveScale,zooming);
      nativeSourceOnSurface=zooming && !!detailSource;
      presented={tile:{...sample.tile,density:Math.min(sample.tile.density,restored.tile.density)},scale:liveScale,final:false};
      lastSource=restored.canvas;key=[sample.tile.x,sample.tile.y,sample.tile.width,sample.tile.height,sample.tile.density].join(':');
      if(scaledDetailCovers(restored.tile,restored.scale,liveScale,visible,0))readyRef.current?.();
    }
    measure();
    return()=>{disposed=true;generation++;cancelCurrent();cancelAnimationFrame(frame);cancelAnimationFrame(panEndFrame);resize.disconnect();releaseOwnership();
      window.removeEventListener('resize',resized);resolution?.removeEventListener('change',resolutionChanged);
      view.removeEventListener('scrollend',resized);
      nativeHost.replaceChildren();
      if(detailSource) retainPageDetail(cacheKey,pdfDoc,detailSource,cacheRevision);
      else if(previewSource) retainPageDetailPreview(cacheKey,pdfDoc,previewSource,cacheRevision);
      for(const canvas of surfaces) {canvas.style.display='none';canvas.width=canvas.height=1;}
      view.removeEventListener('scroll',schedule);view.removeEventListener('pdf-viewport-pan',pan);
      view.removeEventListener('pdf-viewport-visibility',measure);view.removeEventListener('pdf-zoom-frame',measure);
      view.removeEventListener('pdf-raster-ready',schedule);
      view.removeEventListener('pdf-zoom-start',start);view.removeEventListener('pdf-zoom-end',measure);};
  },[pdfDoc,pageNumber,size.width,size.height,near,cacheKey]);
  return <>{([0,1] as const).map(index=><canvas key={index} ref={node=>{canvasRefs.current[index]=node;}}
    aria-hidden="true" data-pdf-detail-tile="true" className="absolute pointer-events-none"
    style={{display:'none'}} />)}<span ref={nativeHostRef} aria-hidden="true" style={{display:'contents'}} /></>;
}

const PDFPageViewComponent: React.FC<PDFPageViewProps> = ({
  pdfDoc,
  visualViewportScale = 1,
  pageNumber,
  scale,
  activeTool,
  penColor,
  penSize,
  penOpacity,
  eraserSize,
  highlightColorHex,
  highlightColor,
  boxColor = '#ef4444',
  boxConfig,
  onUpdateBoxConfig,
  highlights,
  textNotes,
  drawings,
  boxes,
  freeTexts,
  onTextSelected,
  onAddHighlight,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onAddBox,
  onUpdateBox,
  onDeleteBox,
  onAddFreeText,
  onUpdateFreeText,
  onDeleteFreeText,
  onDeleteHighlight,
  onUpdateHighlight,
  onUpdateHighlightNote,
  onUpdateHighlightColor,
  onAddStroke,
  onUpdateStroke,
  onDeleteStroke,
  onActiveToolChange,
  isBookMode = false,
  bookPageSide = 'single',
  selectedIds,
  onSelect,
  fileId,
}) => {
  const canvasRefs = useRef<[HTMLCanvasElement | null, HTMLCanvasElement | null]>([null, null]);
  const frontCanvasIndexRef = useRef(0);
  const [frontCanvasIndex, setFrontCanvasIndex] = useState(0);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const pageSlotRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);

  const docId = fileId;
  const cachedDimension =
    pageDimensionCache.get(`${docId}_${pageNumber}`) ||
    pageDimensionCache.get(`${docId}_default`);

  const [baseDimension, setBaseDimension] = useState<{ width: number; height: number }>(() => {
    if (cachedDimension) {
      return { width: cachedDimension.width, height: cachedDimension.height };
    }
    return { width: 595, height: 842 };
  });

  // Calculate layout dimensions for CSS container
  const activeBaseDim = cachedDimension || baseDimension;
  const effectiveWidth = Math.max(1, activeBaseDim.width * scale);
  const effectiveHeight = Math.max(1, activeBaseDim.height * scale);

  const hasRenderedOnceRef = useRef<boolean>(false);
  const lastRenderedScaleRef = useRef<number>(0);
  const frontDensityRef = useRef(0);
  const updatePriorityRef = useRef<() => void>(() => {});
  const documentVisibleRef = useRef(true);
  const [isNearViewport, setIsNearViewport] = useState(true);
  const renderPriorityRef = useRef(1);
  const [rasterScale, setRasterScale] = useState(scale);
  const desiredScaleRef = useRef(rasterScale);
  const activeRenderRef = useRef(false);
  const renderCompletionRef = useRef<Promise<void>>(Promise.resolve());
  const rasterRequestRef = useRef<{ pdfDoc: any; page: number; scale: number; epoch: string|undefined; cancelled: boolean; done: boolean; background:boolean; cancel: () => void } | null>(null);
  const mountedRef = useRef(true);
  desiredScaleRef.current = scale;
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [renderCount, setRenderCount] = useState(0);
  const renderTaskRef = useRef<any>(null);
  const pinchActiveRef = useRef(false);
  const renderSlotHandleRef = useRef<ReturnType<typeof requestPdfRenderSlot> | null>(null);
  const renderSlotReleaseRef = useRef<(() => void) | null>(null);
  const [isSelectingText, setIsSelectingText] = useState(false);
  const [completedRaster, setCompletedRaster] = useState<{ canvas: HTMLCanvasElement; density: number; scale: number; doc: any; page: number; epoch:string|undefined; dpr:number; final:boolean } | null>(null);
  useLayoutEffect(() => {
    if (!completedRaster) return;
    const { canvas, density, scale: target } = completedRaster;
    if (!canPresentRaster(completedRaster,{doc:pdfDoc,page:pageNumber,scale:desiredScaleRef.current,
      epoch:pageContainerRef.current?.closest<HTMLElement>('.pdf-viewport-container')?.dataset.zoomEpoch,dpr:window.devicePixelRatio||1},pinchActiveRef.current)) {
      canvas.width=canvas.height=1;setCompletedRaster(null);
      if(!pinchActiveRef.current && documentVisibleRef.current) setRenderCount(count=>count+1);
      return;
    }
    if(!canReplaceRaster(density,frontDensityRef.current,completedRaster.final)) {
      canvas.width=canvas.height=1;setCompletedRaster(null);
      if(renderPriorityRef.current<10) setRenderCount(count=>count+1);
      return;
    }
    // Only this layout commit may touch the hidden DOM buffer. A renderer never
    // writes into a canvas that React may still be presenting as the front.
    const index = frontCanvasIndexRef.current === 0 ? 1 : 0;
    const back = canvasRefs.current[index];
    if (!back) return;
    back.width = canvas.width; back.height = canvas.height;
    back.getContext('2d', { alpha: false })!.drawImage(canvas, 0, 0);
    canvas.width=canvas.height=1;
    back.dataset.renderedScale = String(target); back.dataset.rasterDensity = String(density);
    delete back.dataset.rasterPreview;
    frontDensityRef.current = density; lastRenderedScaleRef.current = target;
    frontCanvasIndexRef.current = index; hasRenderedOnceRef.current = true;
    setFrontCanvasIndex(index); setIsLoading(false); setHasError(false); setCompletedRaster(null);
    pageContainerRef.current?.closest('.pdf-viewport-container')?.dispatchEvent(new Event('pdf-raster-ready'));
    if (renderPriorityRef.current < 10 && density < rasterDensity(activeBaseDim,desiredScaleRef.current)-.0001) setRenderCount(count=>count+1);
  }, [completedRaster, pdfDoc, pageNumber]);
  const renderInputRef = useRef({ pdfDoc, pageNumber, docId });
  renderInputRef.current = { pdfDoc, pageNumber, docId };

  // Mode changes remount page components. Restore a bounded preview immediately
  // rather than discarding an already decoded page and showing a blank surface.
  const restorePagePreview=useCallback(() => {
    const full = getPageRaster(`${docId}_${pageNumber}`, pdfDoc);
    const cached = pagePreviews.get(`${docId}_${pageNumber}`);
    const front = canvasRefs.current[frontCanvasIndexRef.current];
    if (!front) return;
    const bitmap = full?.bitmap || (cached?.pdfDoc === pdfDoc ? cached.canvas : null);
    if (!bitmap) return;
    front.width = bitmap.width;
    front.height = bitmap.height;
    front.getContext('2d', { alpha: false })?.drawImage(bitmap, 0, 0);
    frontDensityRef.current = full?.density || (cached?.pdfDoc===pdfDoc?cached.density:0);
    front.dataset.rasterDensity = String(frontDensityRef.current);
    front.dataset.rasterPreview = String(!full);
    front.dataset.renderedScale = String(scale);
    const sharpEnough = full && full.density>=rasterDensity(full.size,scale)-.0001;
    hasRenderedOnceRef.current = true;
    lastRenderedScaleRef.current = sharpEnough ? scale : 0;
    if (sharpEnough) { front.dataset.renderedScale = String(scale); rasterCacheHits++; }
    setIsLoading(false);
  }, [pdfDoc, docId, pageNumber,scale]);
  useLayoutEffect(()=>{
    frontDensityRef.current=0;lastRenderedScaleRef.current=0;
    restorePagePreview();
  },[pdfDoc,docId,pageNumber]);

  useEffect(() => {
    const container = pageContainerRef.current?.closest<HTMLElement>('.pdf-viewport-container');
    if (!container) return;
    pinchActiveRef.current = container.dataset.zoomGesture === 'true';
    const start = () => {
      pinchActiveRef.current = true;
      rasterRequestRef.current?.cancel();
      renderSlotHandleRef.current?.cancel();
      renderTaskRef.current?.cancel();
    };
    const end = () => {
      pinchActiveRef.current = false;
      setRenderCount((count) => count + 1);
    };
    const visibility = () => {
      documentVisibleRef.current = container.dataset.renderVisible !== 'false';
      if (documentVisibleRef.current) {
        setRenderCount((count) => count + 1);
      } else { rasterRequestRef.current?.cancel(); renderSlotHandleRef.current?.cancel(); renderTaskRef.current?.cancel(); }
    };
    const detailFallback=()=>setRenderCount(count=>count+1);
    const page=pageContainerRef.current;
    page?.addEventListener('pdf-detail-fallback',detailFallback);
    container.addEventListener('pdf-viewport-visibility', visibility);
    container.addEventListener('pdf-zoom-start', start);
    container.addEventListener('pdf-zoom-end', end);
    return () => {
      container.removeEventListener('pdf-viewport-visibility', visibility);
      container.removeEventListener('pdf-zoom-start', start);
      container.removeEventListener('pdf-zoom-end', end);
      page?.removeEventListener('pdf-detail-fallback',detailFallback);
    };
  }, []);

  const handlePageMeasure=useCallback((size:{width:number;height:number})=>{
    pageDimensionCache.set(`${docId}_${pageNumber}`,size);
    if(!pageDimensionCache.has(`${docId}_default`))pageDimensionCache.set(`${docId}_default`,size);
    setBaseDimension(previous=>previous.width===size.width && previous.height===size.height?previous:size);
  },[docId,pageNumber]);
  const handleDetailReady=useCallback(()=>{
    const first=!hasRenderedOnceRef.current;
    if(frontDensityRef.current===0)restorePagePreview();
    hasRenderedOnceRef.current=true;setIsLoading(false);setHasError(false);
    if(first)setRenderCount(count=>count+1);
  },[restorePagePreview]);

  // Keep only the current front bitmap per visited page. The hidden buffer is
  // released after each atomic swap instead of doubling memory across a long PDF.
  useLayoutEffect(() => {
    const staleCanvas = canvasRefs.current[frontCanvasIndex === 0 ? 1 : 0];
    if (staleCanvas && !activeRenderRef.current) {
      staleCanvas.width = 1;
      staleCanvas.height = 1;
    }
  }, [frontCanvasIndex]);

  // Keep layout zoom immediate, but rasterize once the trackpad gesture settles.
  // This avoids repeatedly cancelling a costly render for every pinch event.
  useEffect(() => {
    if (!isNearViewport && hasRenderedOnceRef.current) return;
    if (pinchActiveRef.current) {
      const frame = requestAnimationFrame(() => setRasterScale(scale));
      return () => cancelAnimationFrame(frame);
    } else {
      setRasterScale(scale);
    }
  }, [scale, isNearViewport]);

  // Keep previously rendered pages visible when scrolling back, but defer their
  // expensive high-resolution rerasterization until they approach the viewport.
  useEffect(() => {
    const pageElement = pageContainerRef.current;
    if (!pageElement) return;
    const scrollRoot = pageElement.closest<HTMLElement>('.pdf-viewport-container');
    if (typeof IntersectionObserver === 'undefined') return;

    const updatePriority = (notify = true) => {
        const pageRect = pageElement.getBoundingClientRect();
        const rootRect = scrollRoot?.getBoundingClientRect();
        const rootTop = Math.max(0, rootRect?.top ?? 0);
        const rootBottom = Math.min(window.innerHeight, rootRect?.bottom ?? window.innerHeight);
        const rootLeft = Math.max(0, rootRect?.left ?? 0);
        const rootRight = Math.min(window.innerWidth, rootRect?.right ?? window.innerWidth);
        const isVisible =
          pageRect.bottom > rootTop &&
          pageRect.top < rootBottom &&
          pageRect.right > rootLeft &&
          pageRect.left < rootRight;
        const verticalDistance = pageRect.bottom < rootTop
          ? rootTop - pageRect.bottom
          : pageRect.top > rootBottom ? pageRect.top - rootBottom : 0;
        documentVisibleRef.current = rootRight > rootLeft && rootBottom > rootTop;
        const activeDocument = scrollRoot?.closest('[data-workspace-doc]')?.getAttribute('data-active') === 'true';
        const priority = isVisible
          ? activeDocument ? 0 : 1
          : 10 + verticalDistance / Math.max(1, rootBottom - rootTop);
        const wasVisible = renderPriorityRef.current <= 1;
        renderPriorityRef.current = priority;
        renderSlotHandleRef.current?.setPriority(rasterRequestRef.current?.background?Math.max(10,priority):priority);
        if (notify && isVisible && !wasVisible && !activeRenderRef.current) {
          setRenderCount((count) => count + 1);
        }
    };
    updatePriorityRef.current = () => updatePriority(false);
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsNearViewport(entry.isIntersecting);
        updatePriority();
      },
      { root: scrollRoot, rootMargin: '1000px 0px', threshold: 0 }
    );
    const visibleObserver = new IntersectionObserver(() => updatePriority(), { root: scrollRoot, threshold: 0 });
    observer.observe(pageElement);
    visibleObserver.observe(pageElement);
    return () => { observer.disconnect(); visibleObserver.disconnect(); };
  }, [pageNumber, fileId]);

  // Cancel render work when the page component itself is removed.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      rasterRequestRef.current?.cancel();
      renderSlotHandleRef.current?.cancel();
      try {
        renderTaskRef.current?.cancel();
      } catch {}
    };
  }, []);

  // Global mouseup listener to reset text selection cursor back to default arrow
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsSelectingText(false);
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  // Signals can repeat for the same target (visibility, zoom-end, near-page IO).
  // Keep one request per page/scale instead of cancelling valid work on each
  // signal. Only a changed target, gesture, hidden page or unmount cancels it.
  useEffect(() => {
    if (!isNearViewport || pinchActiveRef.current || !pdfDoc || !sameRasterScale(rasterScale,desiredScaleRef.current)) {
      rasterRequestRef.current?.cancel();
      return;
    }
    const detailOwns=detailRasterOwnership.owns(pageContainerRef.current,rasterScale,
      pageContainerRef.current?.closest<HTMLElement>('.pdf-viewport-container')?.dataset.zoomEpoch);
    // Keep a lightweight whole-page fallback for fast pans and scan selection.
    // It is prepared after first paint in a preemptible background slot, never
    // as a prerequisite for the visible native crop.
    const backgroundPreview=detailOwns && hasRenderedOnceRef.current && frontDensityRef.current===0;
    if(detailOwns && (!backgroundPreview || detailRasterOwnership.previewPending(pageContainerRef.current))) {
      rasterRequestRef.current?.cancel();
      return;
    }
    if (hasRenderedOnceRef.current && sameRasterScale(lastRenderedScaleRef.current, rasterScale) && (frontDensityRef.current>=rasterDensity(activeBaseDim,rasterScale)-.0001)) {
      rasterRequestRef.current?.cancel();
      lastRenderedScaleRef.current = rasterScale;
      const front = canvasRefs.current[frontCanvasIndexRef.current];
      if (front) {
        front.dataset.renderedScale = String(rasterScale);
        front.dataset.rasterDensity = String(frontDensityRef.current);
      }
      rasterCacheHits++;
      return;
    }
    const epoch=pageContainerRef.current?.closest<HTMLElement>('.pdf-viewport-container')?.dataset.zoomEpoch;
    const running = rasterRequestRef.current;
    if (running && !running.done && !running.cancelled && running.pdfDoc === pdfDoc && running.page === pageNumber && running.epoch===epoch && sameRasterScale(running.scale,rasterScale)) return;
    running?.cancel();
    let cancelled = false;
    let task: any = null;
    let back:HTMLCanvasElement|null=null;
    let handle: ReturnType<typeof requestPdfRenderSlot> | null = null;
    let release: (() => void) | null = null;
    let queuedAt = 0;
    let startedAt = 0;
    let outcome = 'cancelled';
    const request = { pdfDoc, page: pageNumber, scale: rasterScale, epoch, cancelled: false, done: false, background:backgroundPreview,
      cancel: () => { cancelled = true; request.cancelled = true; handle?.cancel(); task?.cancel(); } };
    rasterRequestRef.current = request;
    const finishRequest = () => {
      request.done = true;
      if (rasterRequestRef.current === request) rasterRequestRef.current = null;
    };
    const obsolete = () => cancelled || !mountedRef.current || pinchActiveRef.current || !documentVisibleRef.current ||
      epoch!==pageContainerRef.current?.closest<HTMLElement>('.pdf-viewport-container')?.dataset.zoomEpoch ||
      renderInputRef.current.pdfDoc !== pdfDoc || renderInputRef.current.pageNumber !== pageNumber ||
      !sameRasterScale(desiredScaleRef.current,rasterScale);
    const work = async () => {
      // Detached canvases let cancelled requests finish without blocking the latest target.
      updatePriorityRef.current();
      if (obsolete()) { finishRequest(); return; }
      activeRenderRef.current = true;
      try {
        if (!hasRenderedOnceRef.current) setIsLoading(true);
        setHasError(false);
        // Page loading has no canvas side effects; do not occupy a scarce
        // raster slot while waiting for a cancelled/slow page request.
        const page = await pdfDoc.getPage(pageNumber);
        if (obsolete()) return;
        queuedAt = performance.now();
        handle = requestPdfRenderSlot(backgroundPreview?Math.max(10,renderPriorityRef.current):renderPriorityRef.current, request.cancel);
        renderSlotHandleRef.current = handle;
        release = await handle.promise;
        if (!release || obsolete()) return;
        renderSlotReleaseRef.current = release;
        startedAt = performance.now();
        const base = page.getViewport({ scale: 1 });
        const size = { width: base.width, height: base.height };
        setBaseDimension(size);
        pageDimensionCache.set(`${docId}_${pageNumber}`, size);
        if (!pageDimensionCache.has(`${docId}_default`)) pageDimensionCache.set(`${docId}_default`, size);
        const dpr=window.devicePixelRatio||1;
        const targetDensity = rasterDensity(size, rasterScale);
        // First paint uses the actual device resolution. Preparing a 2×
        // source here multiplied image decoding/compositing before any content
        // could appear; live detail crops already own gesture headroom.
        const density = backgroundPreview ? Math.min(targetDensity,1200/Math.max(size.width,size.height))
          : renderPriorityRef.current >= 10 ? Math.min(targetDensity,Math.sqrt(4_000_000/(size.width*size.height))) : targetDensity;
        const viewport = page.getViewport({ scale: density });
        back = document.createElement('canvas');
        back.width = Math.max(1, Math.round(viewport.width));
        back.height = Math.max(1, Math.round(viewport.height));
        const context = back.getContext('2d', { alpha: false });
        if (!context) throw new Error('Could not create PDF canvas context');
        context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
        context.fillStyle = '#fff';
        context.fillRect(0, 0, back.width, back.height);
        task = page.render({ canvasContext: context, viewport, transform: canvasViewportTransform(viewport, back) });
        renderTaskRef.current = task;
        await task.promise;
        if (obsolete()) return;
        rememberPagePreview(`${docId}_${pageNumber}`, pdfDoc, back,density);
        rememberPageRaster(`${docId}_${pageNumber}`,pdfDoc,back,density,size,density>=targetDensity-.0001);
        outcome = 'committed';
        setCompletedRaster({ canvas: back, density, scale: rasterScale, doc: pdfDoc, page: pageNumber, epoch, dpr, final:density>=targetDensity-.0001 });
      } catch (error: any) {
        if (!obsolete() && error?.name !== 'RenderingCancelledException') {
          console.error(`Error rendering page ${pageNumber}:`, error);
          setHasError(true);
          setErrorMessage(error.message || String(error));
          setIsLoading(false);
        }
      } finally {
        if(back && outcome!=='committed') back.width=back.height=1;
        if (queuedAt) {
          renderSamples.push({ page: pageNumber, doc: docId, scale: rasterScale,
            queueMs: (startedAt || performance.now()) - queuedAt,
            renderMs: startedAt ? performance.now() - startedAt : 0, outcome, active: renderQueue.active });
          if (renderSamples.length > 200) renderSamples.shift();
        }
        if (rasterRequestRef.current === request) activeRenderRef.current = false;
        if (renderTaskRef.current === task) renderTaskRef.current = null;
        if (renderSlotHandleRef.current === handle) renderSlotHandleRef.current = null;
        if (renderSlotReleaseRef.current === release) renderSlotReleaseRef.current = null;
        release?.();
        const retry = rasterRequestRef.current === request && (cancelled || epoch!==pageContainerRef.current?.closest<HTMLElement>('.pdf-viewport-container')?.dataset.zoomEpoch) && mountedRef.current && !pinchActiveRef.current
          && documentVisibleRef.current && renderPriorityRef.current < 10 && sameRasterScale(desiredScaleRef.current,rasterScale);
        finishRequest();
        if (retry) setRenderCount(count => count+1);
      }
    };
    renderCompletionRef.current = work();
  }, [pdfDoc, pageNumber, rasterScale, renderCount, visualViewportScale, isNearViewport]);

  const lastRightClickRef = useRef<{ time: number; x: number; y: number } | null>(null);

  // Helper to extract text selection bounds on current PDF page with 1:1 line precision
  const getPageSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return null;

    const text = selection.toString().trim();
    if (!text) return null;

    if (selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);

    const pageContainer = pageContainerRef.current;
    if (!pageContainer) return null;

    // Verify if selection belongs to this page container
    if (
      !pageContainer.contains(range.commonAncestorContainer) &&
      !pageContainer.contains(range.startContainer) &&
      !pageContainer.contains(range.endContainer)
    ) {
      return null;
    }

    const pageRect = pageContainer.getBoundingClientRect();
    const rawClientRects = Array.from(range.getClientRects());

    // 1. Filter out invalid rects or rects outside pageRect bounds
    const validClientRects = rawClientRects.filter((r) => {
      if (r.width <= 1 || r.height <= 1) return false;
      const intersects =
        r.right > pageRect.left &&
        r.left < pageRect.right &&
        r.bottom > pageRect.top &&
        r.top < pageRect.bottom;
      return intersects;
    });

    if (validClientRects.length === 0) return null;

    // 2. Convert to percentage rects constrained strictly to page bounds [0, 100]
    const rawNormalized: NormalizedRect[] = validClientRects
      .map((r) => {
        const leftRel = Math.max(0, r.left - pageRect.left);
        const topRel = Math.max(0, r.top - pageRect.top);
        const rightRel = Math.min(pageRect.width, r.right - pageRect.left);
        const bottomRel = Math.min(pageRect.height, r.bottom - pageRect.top);

        const width = Math.max(0, rightRel - leftRel);
        const height = Math.max(0, bottomRel - topRel);

        return {
          x: (leftRel / pageRect.width) * 100,
          y: (topRel / pageRect.height) * 100,
          width: (width / pageRect.width) * 100,
          height: (height / pageRect.height) * 100,
        };
      })
      .filter((r) => r.width > 0.05 && r.height > 0.05);

    if (rawNormalized.length === 0) return null;

    // 3. Group rects into lines to form tight 1:1 line bounding boxes (Smart Highlight precision)
    const lines: NormalizedRect[][] = [];
    const sorted = [...rawNormalized].sort((a, b) => a.y - b.y || a.x - b.x);

    for (const rect of sorted) {
      let addedToLine = false;
      for (const line of lines) {
        const lineY = line[0].y;
        const lineH = line[0].height;
        if (Math.abs(rect.y - lineY) < Math.max(0.8, lineH * 0.4)) {
          line.push(rect);
          addedToLine = true;
          break;
        }
      }
      if (!addedToLine) {
        lines.push([rect]);
      }
    }

    // 4. Consolidate each line cluster into a single line rectangle
    const rawLineRects: NormalizedRect[] = lines.map((line) => {
      const minX = Math.min(...line.map((r) => r.x));
      const minY = Math.min(...line.map((r) => r.y));
      const maxRight = Math.max(...line.map((r) => r.x + r.width));
      const maxBottom = Math.max(...line.map((r) => r.y + r.height));

      const lineW = maxRight - minX;
      const lineH = maxBottom - minY;

      return {
        x: minX,
        y: minY,
        width: Math.min(100 - minX, lineW),
        height: Math.min(100 - minY, lineH),
      };
    });

    // Merge vertically contiguous rectangles to eliminate horizontal seam lines
    const finalRects: NormalizedRect[] = [];
    const sortedLineRects = [...rawLineRects].sort((a, b) => a.y - b.y);

    if (sortedLineRects.length > 0) {
      let current = { ...sortedLineRects[0] };
      for (let i = 1; i < sortedLineRects.length; i++) {
        const next = sortedLineRects[i];
        const currentBottom = current.y + current.height;
        const currentRight = current.x + current.width;
        const nextRight = next.x + next.width;

        const touchesVertically = next.y <= currentBottom + 1.2;
        const similarX = Math.abs(current.x - next.x) < 8;
        const similarRight = Math.abs(currentRight - nextRight) < 8;
        const horizontallyOverlaps = Math.max(current.x, next.x) < Math.min(currentRight, nextRight);

        if (touchesVertically && (similarX || similarRight || horizontallyOverlaps)) {
          const newX = Math.min(current.x, next.x);
          const newY = Math.min(current.y, next.y);
          const newR = Math.max(currentRight, nextRight);
          const newB = Math.max(currentBottom, next.y + next.height);
          current = {
            x: newX,
            y: newY,
            width: newR - newX,
            height: newB - newY,
          };
        } else {
          finalRects.push(current);
          current = { ...next };
        }
      }
      finalRects.push(current);
    }

    return { text, rects: finalRects, range, selection };
  }, [pageNumber]);

  // Double Right-Click Quick Highlight Handler
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      let selInfo = getPageSelection();
      const clickX = e.clientX;
      const clickY = e.clientY;

      if (!selInfo) {
        // If no text selection, check if right clicked on a text node in the document to allow double-right-click on words
        let range: Range | null = null;
        const docAny = document as any;
        if (docAny.caretRangeFromPoint) {
          range = docAny.caretRangeFromPoint(clickX, clickY);
        } else if (docAny.caretPositionFromPoint) {
          const pos = docAny.caretPositionFromPoint(clickX, clickY);
          if (pos?.offsetNode) {
            range = document.createRange();
            range.setStart(pos.offsetNode, pos.offset);
            range.setEnd(pos.offsetNode, pos.offset);
          }
        }

        if (range && range.startContainer && pageContainerRef.current?.contains(range.startContainer)) {
          const textContent = range.startContainer.textContent;
          if (textContent && textContent.trim()) {
            e.preventDefault();
            e.stopPropagation();
            const now = Date.now();
            const prev = lastRightClickRef.current;
            const isDouble =
              prev &&
              now - prev.time < 600 &&
              Math.abs(clickX - prev.x) < 60 &&
              Math.abs(clickY - prev.y) < 60;
            lastRightClickRef.current = { time: now, x: clickX, y: clickY };

            if (isDouble) {
              const sel = window.getSelection();
              if (sel) {
                sel.removeAllRanges();
                sel.addRange(range);
                try {
                  (sel as any).modify?.('move', 'backward', 'word');
                  (sel as any).modify?.('extend', 'forward', 'word');
                } catch {
                  // ignore
                }
                selInfo = getPageSelection();
              }
            }
          }
        }
      }

      if (!selInfo) {
        // No text selected on this page -> allow default browser context menu
        return;
      }

      // Check if mouse click position is on or near the selected text
      const rangeRects = Array.from(selInfo.range.getClientRects());
      const isInsideSelection = rangeRects.some(
        (r: DOMRect) =>
          clickX >= r.left - 40 &&
          clickX <= r.right + 40 &&
          clickY >= r.top - 25 &&
          clickY <= r.bottom + 25
      );

      if (!isInsideSelection && rangeRects.length > 0) {
        return;
      }

      // Prevent default browser context menu on selected text completely
      e.preventDefault();
      e.stopPropagation();

      const now = Date.now();
      const prev = lastRightClickRef.current;

      // Double Right-Click detection (2 contextmenu events within 600ms)
      const isDoubleRightClick =
        prev &&
        now - prev.time < 600 &&
        Math.abs(clickX - prev.x) < 60 &&
        Math.abs(clickY - prev.y) < 60;

      lastRightClickRef.current = { time: now, x: clickX, y: clickY };

      if (isDoubleRightClick) {
        // Trigger Highlight immediately using remembered color or default yellow
        const colorToUse: HighlightColor = highlightColor || 'yellow';

        const newHighlight: HighlightAnnotation = {
          id: `hl_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          pageNumber,
          text: selInfo.text,
          color: colorToUse,
          rects: selInfo.rects,
          createdAt: Date.now(),
        };

        if (onAddHighlight) {
          onAddHighlight(newHighlight);
        }

        // Remove temporary text selection highlight immediately
        selInfo.selection.removeAllRanges();
        lastRightClickRef.current = null;
      }
    },
    [getPageSelection, highlightColor, highlightColorHex, pageNumber, onAddHighlight]
  );

  // Left-Click Mouse Up for Text Selection Toolbar
  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return; // Only trigger for left click

      setTimeout(() => {
        const selInfo = getPageSelection();
        if (selInfo && onTextSelected) {
          const rect = selInfo.range.getBoundingClientRect();
          onTextSelected(
            pageNumber,
            selInfo.text,
            selInfo.rects,
            { x: rect.left + rect.width / 2, y: rect.top }
          );
        }
      }, 20);
    },
    [getPageSelection, onTextSelected, pageNumber]
  );

  // Book spine styles
  const bookSpineClass =
    isBookMode && bookPageSide === 'left'
      ? 'paper-stack-left rounded-none'
      : isBookMode && bookPageSide === 'right'
      ? 'paper-stack-right rounded-none'
      : 'paper-stack-single rounded-none';

  return (
    <div
      className={`relative shrink-0 [&:has([data-highlight-note-open=true])]:z-[60000] p-0 bg-white border-0 rounded-none ${bookSpineClass} overflow-visible [&:has(.cursor-grabbing)]:z-50 [&:has([class*='z-[500]'])]:z-50 [&:has([class*='z-[8000]'])]:z-50 [&:has([class*='z-[9999]'])]:z-50 [&:has([class*='z-[20000]'])]:z-50 [&:has([class*='z-[30000]'])]:z-50 [&:has([class*='z-[35000]'])]:z-50`}
      data-pdf-page-slot="true"
      ref={pageSlotRef}
      style={{
        '--pdf-page-width': `${effectiveWidth}px`,
        '--pdf-page-height': `${effectiveHeight}px`,
        width: 'calc(var(--pdf-page-width) * var(--pdf-live-zoom, 1))',
        height: 'calc(var(--pdf-page-height) * var(--pdf-live-zoom, 1))',
      } as React.CSSProperties}
    >
      <div
        ref={pageContainerRef}
        id={fileId ? `page-container-${fileId}-${pageNumber}` : `page-container-${pageNumber}`}
        data-page-container="true"
        data-doc-id={fileId || ''}
        data-page-number={pageNumber}
        onContextMenu={handleContextMenu}
        onMouseUp={handleMouseUp}
        onClick={(e) => {
          if (e.button === 0 && !e.shiftKey && onSelect) {
            const el = e.target instanceof Element ? e.target : (e.target as Node | null)?.parentElement;
            const isAnnotation = Boolean(
              el?.closest?.(
                '.free-text-item-container, .box-floating-toolbar, [id^="box-"], .sticky-note-paper, [id^="sticky-"], [id^="hl-"], #smart-shape-handles, .stroke-vector-group, button, input, textarea, .ft-toolbar, .ft-link-card-popover, .unified-group-toolbar, .floating-submenu'
              )
            );
            if (!isAnnotation) {
              onSelect('', false);
            }
          }
        }}
        className={`relative bg-white cursor-default overflow-visible`}
        style={{
          width: `${effectiveWidth}px`,
          height: `${effectiveHeight}px`,
          '--pdf-layout-scale': scale,
          zoom: 'var(--pdf-live-zoom, 1)',
        } as React.CSSProperties}
      >
        {/* Loading Skeleton only on very first load before initial render */}
        {isLoading && !hasRenderedOnceRef.current && (
          <div className="absolute inset-0 bg-neutral-100/90 backdrop-blur-2xs flex flex-col items-center justify-center text-neutral-600 gap-2 z-10">
            <div className="w-8 h-8 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-semibold">Đang tải trang {pageNumber}...</span>
          </div>
        )}

      {/* Error state with retry button */}
      {hasError && !isLoading && (
        <div className="absolute inset-0 bg-neutral-50 flex flex-col items-center justify-center text-neutral-700 gap-2 z-10 p-4 text-center">
          <AlertCircle size={28} className="text-red-500 mb-1" />
          <p className="text-xs font-semibold">Không thể tải trang {pageNumber}</p>
          {errorMessage && <p className="text-[10px] text-neutral-500 max-w-[80%] break-words">{errorMessage}</p>}
          <button
            onClick={() => setRenderCount((c) => c + 1)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 text-white rounded text-xs hover:bg-black transition-colors"
          >
            <RefreshCw size={12} />
            <span>Thử tải lại trang</span>
          </button>
        </div>
      )}

      {/* PDF Rendering Canvas */}
      {[0, 1].map((bufferIndex) => (
        <canvas
          key={`pdf-canvas-buffer-${bufferIndex}`}
          ref={(element) => { canvasRefs.current[bufferIndex as 0 | 1] = element; }}
          aria-hidden="true"
          className="absolute inset-0 block w-full h-full"
          style={{
            visibility: frontCanvasIndex === bufferIndex ? 'visible' : 'hidden',
            pointerEvents: 'none',
          }}
        />
      ))}

      <PDFDetailTile pdfDoc={pdfDoc} pageNumber={pageNumber} size={activeBaseDim} near={isNearViewport} cacheKey={`${docId}_${pageNumber}`} onReady={handleDetailReady} onMeasure={handlePageMeasure} />
      {/* Interactive Text Layer for Highlighting & Selection */}
      <div
        ref={textLayerRef}
        onMouseDown={() => setIsSelectingText(true)}
        className={`pdf-text-layer pointer-events-none`}
        style={{
          width: `${effectiveWidth}px`,
          height: `${effectiveHeight}px`,
        }}
      />

      {/* Simulated Selection Layer */}
      <SimulatedSelectionLayer
        pdfDoc={pdfDoc}
        isNearViewport={isNearViewport && !isLoading && frontDensityRef.current>0 && (frontDensityRef.current >= rasterDensity(activeBaseDim, scale) - 0.0001 ||
          detailRasterOwnership.owns(pageContainerRef.current,scale,pageContainerRef.current?.closest<HTMLElement>('.pdf-viewport-container')?.dataset.zoomEpoch))}
        pageNumber={pageNumber}
        scale={scale}
        isActive={activeTool === 'select'}
        highlightColor={highlightColor || 'yellow'}
        onAddHighlight={(hl) => onAddHighlight && onAddHighlight(hl)}
      />

      {/* Highlight Overlay */}
      <HighlightOverlay
        pageNumber={pageNumber}
        highlights={highlights}
        onDeleteHighlight={onDeleteHighlight}
        onUpdateHighlight={onUpdateHighlight}
        onUpdateHighlightNote={onUpdateHighlightNote}
        onUpdateHighlightColor={onUpdateHighlightColor}
        selectedIds={selectedIds}
        onSelect={onSelect}
        onAddHighlight={onAddHighlight}
        elevatedContainerId={fileId ? `elevated-annotation-container-${fileId}-${pageNumber}` : `elevated-annotation-container-${pageNumber}`}
      />

      <QuickShapesLayer fileId={fileId} pageNumber={pageNumber} width={effectiveWidth} height={effectiveHeight}
        scale={scale} eraserSize={eraserSize} activeTool={activeTool} drawings={drawings} onAddStroke={onAddStroke}
        onUpdateStroke={onUpdateStroke} onDeleteStroke={onDeleteStroke} onClearSelection={()=>onSelect?.('',false)} selectedIds={selectedIds} onSelect={onSelect}/>
      {/* Freehand & Smart Drawing Overlay */}
      <DrawingCanvas
        scale={scale}
        fileId={fileId}
        pageNumber={pageNumber}
        width={effectiveWidth}
        height={effectiveHeight}
        isDrawingMode={
          activeTool === 'pen' ||
          activeTool === 'highlighter' ||
          activeTool === 'smart_pen' ||
          activeTool === 'smart_highlighter'
        }
        isHighlighter={activeTool === 'highlighter' || activeTool === 'smart_highlighter'}
        isSmartPen={activeTool === 'smart_pen'}
        isSmartHighlighter={activeTool === 'smart_highlighter'}
        isEraserMode={activeTool === 'eraser'}
        penColor={penColor}
        penSize={penSize}
        penOpacity={penOpacity}
        eraserSize={eraserSize}
        strokes={drawings}
        onAddStroke={onAddStroke}
        onUpdateStroke={onUpdateStroke}
        onDeleteStroke={onDeleteStroke}
        selectedIds={selectedIds}
        onSelect={onSelect}
        elevatedContainerId={fileId ? `elevated-annotation-container-${fileId}-${pageNumber}` : `elevated-annotation-container-${pageNumber}`}
      />

      {/* Box / Rectangle Annotations Layer (Khoanh ô vuông kéo giãn/thu gọn) */}
      <BoxAnnotationsLayer
        fileId={fileId}
        pageNumber={pageNumber}
        totalPages={pdfDoc?.numPages}
        scale={scale}
        boxes={boxes}
        isBoxToolActive={activeTool === 'box'}
        activeColor={boxColor}
        boxConfig={boxConfig}
        onUpdateBoxConfig={onUpdateBoxConfig}
        onAddBox={onAddBox}
        onUpdateBox={onUpdateBox}
        onDeleteBox={onDeleteBox}
        selectedIds={selectedIds}
        onSelect={onSelect}
      />

      {/* Free Text Direct Insertion Layer (Nhập text trực tiếp lên sách) */}
      <FreeTextLayer
        fileId={fileId}
        pageNumber={pageNumber}
        totalPages={pdfDoc?.numPages}
        freeTexts={freeTexts}
        isTextToolActive={activeTool === 'text'}
        onAddText={onAddFreeText}
        onUpdateText={onUpdateFreeText}
        onDeleteText={onDeleteFreeText}
        onDeactivateTextTool={() => onActiveToolChange?.('select')}
        scale={scale}
        selectedIds={selectedIds}
        onSelect={onSelect}
      />

      {/* Sticky Notes Paper Layer (Giấy note nhỏ di động kéo thả tự do) */}
      <StickyNotesLayer
        fileId={fileId}
        pageNumber={pageNumber}
        totalPages={pdfDoc?.numPages}
        notes={textNotes}
        isStickyToolActive={activeTool === 'sticky'}
        onAddNote={onAddNote}
        onUpdateNote={onUpdateNote}
        onDeleteNote={onDeleteNote}
        onDeactivateStickyTool={() => onActiveToolChange?.('select')}
        scale={scale}
        selectedIds={selectedIds}
        onSelect={onSelect}
      />

      {/* Elevated Annotation Overlay Container: Sits directly above StickyNotesLayer (z-[25000]) for isolated elevation of selected Pen/Highlight */}
      <div
        id={fileId ? `elevated-annotation-container-${fileId}-${pageNumber}` : `elevated-annotation-container-${pageNumber}`}
        className="absolute inset-0 select-none overflow-visible z-[25000] pointer-events-none"
      />

      </div>
      <PageNumberLabel pageNumber={pageNumber} />
    </div>
  );
};

function pdfjsLibUtilTransform(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function areEqual(prevProps: PDFPageViewProps, nextProps: PDFPageViewProps) {
  if (
    prevProps.fileId !== nextProps.fileId ||
    prevProps.pageNumber !== nextProps.pageNumber ||
    prevProps.scale !== nextProps.scale ||
    prevProps.activeTool !== nextProps.activeTool ||
    prevProps.penColor !== nextProps.penColor ||
    prevProps.penSize !== nextProps.penSize ||
    prevProps.penOpacity !== nextProps.penOpacity ||
    prevProps.eraserSize !== nextProps.eraserSize ||
    prevProps.highlightColorHex !== nextProps.highlightColorHex ||
    prevProps.boxColor !== nextProps.boxColor ||
    prevProps.isBookMode !== nextProps.isBookMode ||
    prevProps.bookPageSide !== nextProps.bookPageSide ||
    prevProps.visualViewportScale !== nextProps.visualViewportScale ||
    prevProps.pdfDoc !== nextProps.pdfDoc
  ) {
    return false;
  }

  // Fast boxConfig check
  if (prevProps.boxConfig !== nextProps.boxConfig) {
    if (
      prevProps.boxConfig?.color !== nextProps.boxConfig?.color ||
      prevProps.boxConfig?.borderWidth !== nextProps.boxConfig?.borderWidth ||
      prevProps.boxConfig?.borderStyle !== nextProps.boxConfig?.borderStyle ||
      prevProps.boxConfig?.hasBackground !== nextProps.boxConfig?.hasBackground
    ) {
      return false;
    }
  }

  // Fast selectedIds check
  if (prevProps.selectedIds !== nextProps.selectedIds) {
    const prevLen = prevProps.selectedIds?.length || 0;
    const nextLen = nextProps.selectedIds?.length || 0;
    if (prevLen !== nextLen) return false;
    if (prevLen > 0) {
      for (let i = 0; i < prevLen; i++) {
        if (prevProps.selectedIds![i] !== nextProps.selectedIds![i]) return false;
      }
    }
  }

  const p = prevProps.pageNumber;

  // Annotation updates are immutable. Comparing only a few fields (or point
  // counts) skipped coordinate, opacity and size changes, leaving hit targets
  // and displayed geometry at the previous position after a drag.
  for (const key of ['highlights', 'textNotes', 'drawings', 'boxes', 'freeTexts'] as const) {
    if (prevProps[key] === nextProps[key]) continue;
    const before = prevProps[key].filter(item => item.pageNumber === p);
    const after = nextProps[key].filter(item => item.pageNumber === p);
    if (before.length !== after.length || before.some((item, i) => item !== after[i])) return false;
  }

  return true;
}

export const PDFPageView = React.memo(PDFPageViewComponent, areEqual);
