export interface DetailTile { x: number; y: number; width: number; height: number; density: number; pixelsWide: number; pixelsHigh: number }

/** CSS page coordinates; only the visible crop is allocated at retina density. */
export function pdfDetailTile(page: {width:number;height:number}, visible: {left:number;top:number;right:number;bottom:number}, scale: number, dpr: number): DetailTile | null {
  if (Math.min(page.width*scale,visible.right)<=Math.max(0,visible.left) || Math.min(page.height*scale,visible.bottom)<=Math.max(0,visible.top)) return null;
  const x=Math.max(0,Math.floor((visible.left-64)/128)*128),y=Math.max(0,Math.floor((visible.top-64)/128)*128);
  const width=Math.min(page.width*scale,Math.ceil((visible.right+64)/128)*128)-x;
  const height=Math.min(page.height*scale,Math.ceil((visible.bottom+64)/128)*128)-y;
  if(width<=0 || height<=0) return null;
  const pixelsPerCss=Math.min(Math.max(1,dpr),2.5,Math.sqrt(12_000_000/(width*height)));
  return {x,y,width,height,density:scale*pixelsPerCss,pixelsWide:Math.max(1,Math.floor(width*pixelsPerCss)),pixelsHigh:Math.max(1,Math.floor(height*pixelsPerCss))};
}

// Reuse a sharp crop while a small scroll/pan remains inside its overscan.
export function detailCovers(tile:DetailTile,visible:{left:number;top:number;right:number;bottom:number}):boolean {
  return tile.x<=visible.left && tile.y<=visible.top && tile.x+tile.width>=visible.right && tile.y+tile.height>=visible.bottom;
}
