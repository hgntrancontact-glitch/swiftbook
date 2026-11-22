import type {DetailTile} from './pdfDetailTile';

export type RetainedDetail={canvas:HTMLCanvasElement;tile:DetailTile;scale:number;final:boolean;layoutKey?:string};
const entries=new Map<string,{doc:unknown;detail:RetainedDetail}>();
// A small crop preview survives eviction of the expensive original. It is a
// display fallback only, never a canonical source for future zoom sampling.
const previews=new Map<string,{doc:unknown;detail:RetainedDetail}>();
const previewBudget=2_000_000;
// Share the existing 36MP cache allowance in favour of finished native crops:
// 24MP here + 12MP whole-page fallbacks. A mode change should not evict the
// previous sharp page just to keep many redundant background page bitmaps.
const budget=24_000_000;
const revisions=new Map<string,number>();
const documentKey=(key:string)=>key.slice(0,key.lastIndexOf('_'));
export const detailCacheRevision=(key:string)=>revisions.get(documentKey(key)) || 0;
const free=(detail:RetainedDetail)=>{detail.canvas.width=detail.canvas.height=1;};

export function takePageDetailPreview(key:string,doc:unknown):RetainedDetail|null {
  const entry=previews.get(key);if(!entry)return null;
  previews.delete(key);
  if(entry.doc!==doc){free(entry.detail);return null;}
  return entry.detail;
}
function rememberPreview(key:string,doc:unknown,detail:RetainedDetail) {
  if(typeof document==='undefined' || typeof detail.canvas.getContext!=='function')return;
  const factor=Math.min(1,900/Math.max(detail.canvas.width,detail.canvas.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(detail.canvas.width*factor));
  canvas.height=Math.max(1,Math.round(detail.canvas.height*factor));
  const context=canvas.getContext('2d',{alpha:false});if(!context)return;
  context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
  context.drawImage(detail.canvas,0,0,canvas.width,canvas.height);
  const density=Math.min(canvas.width/(detail.tile.width/detail.scale),canvas.height/(detail.tile.height/detail.scale));
  retainPageDetailPreview(key,doc,{canvas,scale:detail.scale,final:false,
    tile:{...detail.tile,density,pixelsWide:canvas.width,pixelsHigh:canvas.height}});
}
export function retainPageDetailPreview(key:string,doc:unknown,detail:RetainedDetail,revision=detailCacheRevision(key)) {
  if(revision!==detailCacheRevision(key)){free(detail);return;}
  const old=previews.get(key);if(old && old.detail.canvas!==detail.canvas)free(old.detail);
  previews.delete(key);previews.set(key,{doc,detail});
  let pixels=[...previews.values()].reduce((sum,item)=>sum+item.detail.canvas.width*item.detail.canvas.height,0);
  for(const [oldKey,item] of previews) {
    if(pixels<=previewBudget)break;
    pixels-=item.detail.canvas.width*item.detail.canvas.height;free(item.detail);previews.delete(oldKey);
  }
}

/** Transfer, rather than copy, a native crop across page/mode remounts. A live
 * component exclusively owns its source; eviction can never clear that source. */
export function takePageDetail(key:string,doc:unknown):RetainedDetail|null {
  const entry=entries.get(key);
  if(!entry)return null;
  entries.delete(key);
  if(entry.doc!==doc){free(entry.detail);return null;}
  return entry.detail;
}
export function retainPageDetail(key:string,doc:unknown,detail:RetainedDetail,revision=detailCacheRevision(key)) {
  if(revision!==detailCacheRevision(key)){free(detail);return;}
  rememberPreview(key,doc,detail);
  const old=entries.get(key);
  if(old)free(old.detail);
  entries.delete(key);
  // Every entry is an original, completed PDF render, including gesture
  // headroom. A display sample/progress frame must never enter this cache.
  if(detail.canvas.width*detail.canvas.height>budget){free(detail);return;}
  entries.set(key,{doc,detail});
  let pixels=[...entries.values()].reduce((sum,item)=>sum+item.detail.canvas.width*item.detail.canvas.height,0);
  for(const [key,item] of entries) {
    if(pixels<=budget)break;
    pixels-=item.detail.canvas.width*item.detail.canvas.height;
    free(item.detail);entries.delete(key);
  }
}
export function clearPageDetails(docId:string) {
  revisions.set(docId,(revisions.get(docId) || 0)+1);
  for(const [key,item] of entries)if(key.startsWith(`${docId}_`)){free(item.detail);entries.delete(key);}
  for(const [key,item] of previews)if(key.startsWith(`${docId}_`)){free(item.detail);previews.delete(key);}
}
