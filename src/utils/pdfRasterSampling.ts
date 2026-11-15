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
