import type {DetailTile} from './pdfDetailTile';

type Crop = {x:number;y:number;width:number;height:number};

/** Inspect only a tiny thumbnail, and only before first paint. A PDF may yield
 * while its background is still white; that is not a useful progress frame. */
export function hasPaintedContent(source:HTMLCanvasElement,probe:HTMLCanvasElement):boolean {
  if(probe.width!==32)probe.width=32;
  if(probe.height!==32)probe.height=32;
  const context=probe.getContext('2d',{willReadFrequently:true});
  if(!context)return false;
  try {
    context.fillStyle='#fff';context.fillRect(0,0,32,32);
    context.drawImage(source,0,0,32,32);
    const pixels=context.getImageData(0,0,32,32).data;
    for(let index=0;index<pixels.length;index+=4) {
      if(pixels[index]<250 || pixels[index+1]<250 || pixels[index+2]<250)return true;
    }
  } catch {}
  return false;
}

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
  positionDetailCanvas(canvas,tile,scale);
  if(front>=0) canvases[front].style.visibility='hidden';
  return index;
}

export function positionDetailCanvas(canvas:HTMLCanvasElement,tile:DetailTile,scale:number) {
  for(const [key,value] of Object.entries({left:tile.x,top:tile.y,width:tile.width,height:tile.height})) {
    canvas.style.setProperty(key,`calc(${value/scale}px * var(--pdf-layout-scale))`);
  }
  canvas.style.display='block';canvas.style.visibility='visible';
}
