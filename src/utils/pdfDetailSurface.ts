import type {DetailTile} from './pdfDetailTile';

type Crop = {x:number;y:number;width:number;height:number};

/** Write only the hidden buffer, then switch surfaces in the same JS frame.
 * Geometry is stored in PDF points; inherited layout/live zoom keeps the exact
 * same screen rectangle when React commits the final zoom. */
export function presentDetailSample(canvases:readonly HTMLCanvasElement[],front:number,source:CanvasImageSource,crop:Crop,tile:DetailTile,scale:number):number {
  const index=front===0?1:0,canvas=canvases[index];
  if(canvas.width!==tile.pixelsWide) canvas.width=tile.pixelsWide;
  if(canvas.height!==tile.pixelsHigh) canvas.height=tile.pixelsHigh;
  const context=canvas.getContext('2d',{alpha:false});
  if(!context) return front;
  context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
  // Pixel-grid alignment may extend the crop less than one pixel beyond the
  // page. Keep that uncovered sliver white rather than an opaque black buffer.
  context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
  context.drawImage(source,crop.x,crop.y,crop.width,crop.height,0,0,canvas.width,canvas.height);
  for(const [key,value] of Object.entries({left:tile.x,top:tile.y,width:tile.width,height:tile.height})) {
    canvas.style.setProperty(key,`calc(${value/scale}px * var(--pdf-layout-scale))`);
  }
  canvas.style.display='block';canvas.style.visibility='visible';
  if(front>=0) canvases[front].style.visibility='hidden';
  return index;
}
