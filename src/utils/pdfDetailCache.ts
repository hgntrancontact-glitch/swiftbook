import type {DetailTile} from './pdfDetailTile';

export type RetainedDetail={canvas:HTMLCanvasElement;tile:DetailTile;scale:number;final:boolean;layoutKey?:string};
const entries=new Map<string,{doc:unknown;detail:RetainedDetail}>();
const budget=12_000_000;
const revisions=new Map<string,number>();
const documentKey=(key:string)=>key.slice(0,key.lastIndexOf('_'));
export const detailCacheRevision=(key:string)=>revisions.get(documentKey(key)) || 0;
const free=(detail:RetainedDetail)=>{detail.canvas.width=detail.canvas.height=1;};

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
  const old=entries.get(key);
  if(old)free(old.detail);
  entries.delete(key);
  if(!detail.final || detail.canvas.width*detail.canvas.height>budget){free(detail);return;}
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
}
