export interface RasterTarget {doc:unknown;page:number;scale:number;epoch:string|undefined}

export function sameRasterScale(a:number,b:number):boolean {return Math.abs(a-b)<1e-6;}

/** A completed image belongs to one layout/gesture, even if a later gesture
 * happens to end at the same zoom. Check again when presenting, not just when
 * the asynchronous PDF task finishes. */
export function canPresentRaster(completed:RasterTarget,current:RasterTarget,zooming:boolean):boolean {
  return !zooming && completed.doc===current.doc && completed.page===current.page && completed.epoch===current.epoch && sameRasterScale(completed.scale,current.scale);
}

export function canReplaceRaster(incoming:number,current:number,final:boolean):boolean {
  return final || incoming>=current;
}
