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
  return tile.density>=density-.002 && tile.x*ratio<=visible.left && tile.y*ratio<=visible.top &&
    (tile.x+tile.width)*ratio>=visible.right && (tile.y+tile.height)*ratio>=visible.bottom;
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

export type PreparedDetail={tile:DetailTile;scale:number;final:boolean};
/** A high-density preview is not a final raster: text has already been sampled
 * at another scale. At rest require PDF operators rendered at the final scale. */
export function needsFinalDetailRender(prepared:PreparedDetail|null,scale:number,visible:{left:number;top:number;right:number;bottom:number},density:number,zooming:boolean):boolean {
  return !zooming && !(prepared?.final && Math.abs(prepared.scale-scale)<1e-6 &&
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
