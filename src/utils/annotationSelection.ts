import type {HistorySnapshot,DrawingStroke,BoxAnnotation,TextNoteAnnotation,FreeTextAnnotation,HighlightAnnotation,HighlightColor} from '../types';
import {STICKY_NOTE_DESIGN} from './stickyNoteDesign';

export const annotationKeys=['boxes','textNotes','freeTexts','drawings','highlights'] as const;
export type AnnotationKind=typeof annotationKeys[number];
export type Annotation=BoxAnnotation|TextNoteAnnotation|FreeTextAnnotation|DrawingStroke|HighlightAnnotation;
export type SelectionBounds={left:number;top:number;width:number;height:number};
export type PageBounds=Record<number,SelectionBounds>;
export type GroupTransform={dx:number;dy:number;scale:number;originX:number;originY:number};
export function annotationEntries(snapshot:HistorySnapshot) {
  return annotationKeys.flatMap(kind=>(snapshot[kind] as Annotation[]).map(item=>({kind,item})));
}
export function annotationSnapshot(doc:HistorySnapshot):HistorySnapshot {
  return {boxes:doc.boxes,textNotes:doc.textNotes,freeTexts:doc.freeTexts,drawings:doc.drawings,highlights:doc.highlights};
}
export function editAnnotations(snapshot:HistorySnapshot,ids:string[],edit:(item:Annotation,kind:AnnotationKind)=>Annotation|null,clones?:Record<string,string>):HistorySnapshot {
  const selected=new Set(ids),result={...snapshot};
  for(const kind of annotationKeys) {
    const items=snapshot[kind] as Annotation[];
    result[kind]=items.flatMap(item=>{
      if(!selected.has(item.id))return [item];
      const edited=edit(item,kind);
      return clones?[item,...(edited?[{...edited,id:clones[item.id],createdAt:Date.now()}]:[])]:edited?[edited]:[];
    }) as never;
  }
  return result;
}
export function transformAnnotations(snapshot:HistorySnapshot,ids:string[],pages:PageBounds,transform:GroupTransform,clones?:Record<string,string>,measured:Record<string,SelectionBounds>={}):HistorySnapshot {
  const {dx,dy,scale:s,originX,originY}=transform;
  return editAnnotations(snapshot,ids,(item,kind)=>{
    const page=pages[item.pageNumber];if(!page || ('isLocked' in item && item.isLocked))return item;
    const point=(x:number,y:number)=>({x:((page.left+x/100*page.width-originX)*s+originX+dx-page.left)/page.width*100,
      y:((page.top+y/100*page.height-originY)*s+originY+dy-page.top)/page.height*100});
    if(kind==='drawings') {const stroke=item as DrawingStroke;return {...stroke,points:stroke.points.map(p=>point(p.x,p.y)),size:stroke.size*s};}
    if(kind==='highlights') {const hl=item as HighlightAnnotation;return {...hl,rects:hl.rects.map(r=>({...r,...point(r.x,r.y),width:r.width*s,height:r.height*s,...(r.rise!==undefined?{rise:r.rise*s}:{})}))};}
    const anchored=item as BoxAnnotation|TextNoteAnnotation|FreeTextAnnotation;
    const position=point(anchored.x,anchored.y);
    if(kind==='boxes') {const box=item as BoxAnnotation;return {...box,...position,width:box.width*s,height:box.height*s,borderWidth:box.borderWidth*s};}
    if(kind==='textNotes') {const note=item as TextNoteAnnotation;return {...note,...position,...(s!==1?{width:(note.width || STICKY_NOTE_DESIGN.width)*s,height:(note.height || STICKY_NOTE_DESIGN.height)*s}:{})};}
    const text=item as FreeTextAnnotation;
    return {...text,...position,...(s!==1?{fontSize:text.fontSize*s,width:(text.width || (measured[text.id]?.width || 0)/page.width*100)*s || undefined,
      text:text.text.replace(/(font-size:\s*)([\d.]+)(px)/gi,(_,a,n,b)=>a+Number(n)*s+b).replace(/(data-size=["'])([\d.]+)/g,(_,a,n)=>a+Number(n)*s)}:{})};
  },clones);
}
export type GroupStyle={color?:HighlightColor;size?:number;dashStyle?:'solid'|'dashed';fill?:boolean};
const colors:Record<HighlightColor,{ink:string;paper:string}>={yellow:{ink:'#eab308',paper:'#ffde59'},green:{ink:'#22c55e',paper:'#98d08a'},pink:{ink:'#ec4899',paper:'#f6a6a1'},red:{ink:'#ef4444',paper:'#f6a6a1'},gray:{ink:'#6b7280',paper:'#ffffff'}};
export function styleAnnotations(snapshot:HistorySnapshot,ids:string[],style:GroupStyle) {
  return editAnnotations(snapshot,ids,(item,kind)=>{
    const color=style.color?colors[style.color]:null;
    if(kind==='drawings')return {...item as DrawingStroke,...(color?{color:color.ink}:{}),...(style.size?{size:style.size}:{}),...(style.dashStyle?{dashStyle:style.dashStyle}:{})};
    if(kind==='boxes')return {...item as BoxAnnotation,...(color?{color:color.ink,...((item as BoxAnnotation).fillColor && (item as BoxAnnotation).fillColor!=='transparent'?{fillColor:color.ink+'25'}:{})}:{}),...(style.size?{borderWidth:style.size}:{}),...(style.dashStyle?{borderStyle:style.dashStyle}:{}),
      ...(style.fill!==undefined?{fillColor:style.fill?(color?.ink || item.color)+'25':'transparent'}:{})};
    if(!color)return item;
    if(kind==='highlights')return {...item as HighlightAnnotation,color:style.color!};
    if(kind==='textNotes')return {...item as TextNoteAnnotation,color:color.paper};
    const text=item as FreeTextAnnotation;
    return {...text,color:color.ink,text:text.text.replace(/(?<![-\w])(color\s*:\s*)[^;"']+/gi,(_,prefix)=>prefix+color.ink)
      .replace(/(<font\b[^>]*\bcolor=["'])[^"']+/gi,(_,prefix)=>prefix+color.ink)};
  });
}
