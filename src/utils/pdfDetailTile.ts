export interface DetailTile { x: number; y: number; width: number; height: number; density: number; pixelsWide: number; pixelsHigh: number }

/** CSS page coordinates; only the visible crop is allocated at retina density. */
export function pdfDetailTile(page: {width:number;height:number}, visible: {left:number;top:number;right:number;bottom:number}, scale: number, dpr: number): DetailTile | null {
  if (Math.min(page.width*scale,visible.right)<=Math.max(0,visible.left) || Math.min(page.height*scale,visible.bottom)<=Math.max(0,visible.top)) return null;
  const x=Math.max(0,visible.left-24),y=Math.max(0,visible.top-24);
  const width=Math.min(page.width*scale,visible.right+24)-x;
  const height=Math.min(page.height*scale,visible.bottom+24)-y;
  if(width<=0 || height<=0) return null;
  const pixelsPerCss=Math.min(Math.max(1,dpr),2.5,Math.sqrt(6_000_000/(width*height)));
  return {x,y,width,height,density:scale*pixelsPerCss,pixelsWide:Math.max(1,Math.floor(width*pixelsPerCss)),pixelsHigh:Math.max(1,Math.floor(height*pixelsPerCss))};
}
