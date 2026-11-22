import {sameRasterScale} from './rasterPresentation';
import type {DetailTile} from './pdfDetailTile';

/** Sample PDF coordinates from a retained full-page image. Integer source
 * dimensions are authoritative, so rounding never moves the text baseline. */
export function rasterSampleRect(source:{width:number;height:number},page:{width:number;height:number},tile:DetailTile,scale:number) {
  return {x:tile.x/scale/page.width*source.width,y:tile.y/scale/page.height*source.height,
    width:tile.width/scale/page.width*source.width,height:tile.height/scale/page.height*source.height};
}
export function sourceCoversDensity(source:{width:number;height:number},page:{width:number;height:number},density:number):boolean {
  return Math.min(source.width/page.width,source.height/page.height)>=density-.002;
}
export function oversampleDetail(tile:DetailTile):DetailTile {
  const factor=Math.min(1.5,Math.sqrt(12_000_000/(tile.pixelsWide*tile.pixelsHigh)));
  return {...tile,density:tile.density*factor,pixelsWide:Math.max(1,Math.floor(tile.pixelsWide*factor)),pixelsHigh:Math.max(1,Math.floor(tile.pixelsHigh*factor))};
}
export function scaledDetailCovers(tile:DetailTile,preparedScale:number,scale:number,visible:{left:number;top:number;right:number;bottom:number},density:number):boolean {
  const ratio=scale/preparedScale;
  return tile.density>=density-.002 && tile.x*ratio<=visible.left+1e-6 && tile.y*ratio<=visible.top+1e-6 &&
    (tile.x+tile.width)*ratio>=visible.right-1e-6 && (tile.y+tile.height)*ratio>=visible.bottom-1e-6;
}

/** A moving viewport does not invalidate PDF pixels already being rendered.
 * Keep useful work until it finishes; only a crop entirely left behind is stale. */
export function detailIntersects(tile:DetailTile,preparedScale:number,scale:number,visible:{left:number;top:number;right:number;bottom:number}):boolean {
  const ratio=scale/preparedScale;
  return tile.x*ratio<visible.right && tile.y*ratio<visible.bottom &&
    (tile.x+tile.width)*ratio>visible.left && (tile.y+tile.height)*ratio>visible.top;
}

/** A retained detail crop uses its PDF-space origin, not the current CSS origin. */
export function detailSampleRect(source:{width:number;height:number},prepared:DetailTile,preparedScale:number,tile:DetailTile,scale:number) {
  const x=source.width/(prepared.width/preparedScale),y=source.height/(prepared.height/preparedScale);
  return {x:(tile.x/scale-prepared.x/preparedScale)*x,y:(tile.y/scale-prepared.y/preparedScale)*y,
    width:tile.width/scale*x,height:tile.height/scale*y};
}

// Overscan is optional. Reuse a native crop while it covers the viewport even
// if the next 128px overscan boundary would fall outside the prepared source.
export function clipDetailTile(tile:DetailTile,prepared:DetailTile,preparedScale:number,scale:number):DetailTile {
  const ratio=scale/preparedScale;
  const x=Math.max(tile.x,prepared.x*ratio),y=Math.max(tile.y,prepared.y*ratio);
  const width=Math.min(tile.x+tile.width,(prepared.x+prepared.width)*ratio)-x;
  const height=Math.min(tile.y+tile.height,(prepared.y+prepared.height)*ratio)-y;
  return {...tile,x,y,width,height,pixelsWide:Math.max(1,Math.round(width*tile.density/scale)),pixelsHigh:Math.max(1,Math.round(height*tile.density/scale))};
}

export type PreparedDetail={tile:DetailTile;scale:number;final:boolean;layoutKey?:string};

/** A resize can move the same-scale page by half a device pixel. Coverage and
 * density alone cannot tell whether a retained native raster is still sharp. */
export function detailPixelAligned(tile:DetailTile,pageLeft:number,pageTop:number,scale:number):boolean {
  const pixels=tile.density/scale;
  return [pageLeft+tile.x,pageTop+tile.y].every(value=>Math.abs(value*pixels-Math.round(value*pixels))<1e-6);
}
/** A displayed crop already has page-local geometry. Reuse those pixels until
 * coverage or density actually runs out, rather than allocating/resampling a
 * viewport-sized canvas for every fractional pinch tick. */
export function reuseDetailSurface(prepared:PreparedDetail|null,scale:number,visible:{left:number;top:number;right:number;bottom:number},density:number,zooming:boolean):boolean {
  return zooming && !!prepared && scaledDetailCovers(prepared.tile,prepared.scale,scale,visible,density);
}

/** Present native pixels 1:1 while zooming; their CSS extent follows PDF points. */
export function nativeDetailPresentation(prepared:PreparedDetail,scale:number):DetailTile {
  const ratio=scale/prepared.scale;
  return {...prepared.tile,x:prepared.tile.x*ratio,y:prepared.tile.y*ratio,
    width:prepared.tile.width*ratio,height:prepared.tile.height*ratio};
}
/** A high-density preview is not a final raster: text has already been sampled
 * at another scale. At rest require PDF operators rendered at the final scale. */
export function needsFinalDetailRender(prepared:PreparedDetail|null,scale:number,visible:{left:number;top:number;right:number;bottom:number},density:number,zooming:boolean):boolean {
  return !zooming && !(prepared?.final && sameRasterScale(prepared.scale,scale) &&
    scaledDetailCovers(prepared.tile,prepared.scale,scale,visible,density));
}

/** Align the canvas to the screen pixel grid while keeping PDF ink in exactly
 * the same page coordinates. The fractional offset is rendered into pixels,
 * rather than applied later by the compositor to the whole text bitmap. */
export function alignDetailTile(tile:DetailTile,pageLeft:number,pageTop:number,scale:number):DetailTile {
  const pixelsPerCss=tile.density/scale;
  const left=Math.floor((pageLeft+tile.x)*pixelsPerCss),top=Math.floor((pageTop+tile.y)*pixelsPerCss);
  const right=Math.ceil((pageLeft+tile.x+tile.width)*pixelsPerCss),bottom=Math.ceil((pageTop+tile.y+tile.height)*pixelsPerCss);
  return {...tile,x:left/pixelsPerCss-pageLeft,y:top/pixelsPerCss-pageTop,
    width:(right-left)/pixelsPerCss,height:(bottom-top)/pixelsPerCss,pixelsWide:right-left,pixelsHigh:bottom-top};
}

/** A native final tile must be copied 1:1. Re-clipping a pixel-aligned raster
 * onto the current overscan grid resamples the text a second time. */
export function preparedDetailSample(source:{width:number;height:number},prepared:PreparedDetail,tile:DetailTile,scale:number) {
  if(prepared.final && sameRasterScale(prepared.scale,scale)) {
    return {tile:prepared.tile,crop:{x:0,y:0,width:source.width,height:source.height}};
  }
  const clipped=clipDetailTile(tile,prepared.tile,prepared.scale,scale);
  return {tile:clipped,crop:detailSampleRect(source,prepared.tile,prepared.scale,clipped,scale)};
}
