import React,{useEffect,useLayoutEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {Copy} from 'lucide-react';
import type {ActiveTool,HistorySnapshot,WorkspaceDoc,DrawingStroke} from '../types';
import {useQuickShapes} from '../contexts/QuickShapesContext';
import {annotationEntries,annotationSnapshot,editAnnotations,transformAnnotations,type PageBounds,type SelectionBounds,type GroupTransform} from '../utils/annotationSelection';
import {AnnotationToolbar} from './AnnotationToolbar';
import {BoxToolbarControls} from './BoxToolbarControls';

type Props={docs:WorkspaceDoc[];activeId:string;activeTool:ActiveTool;disabled:boolean;
  onSelect:(docId:string,id:string,shift:boolean)=>void;
  onApply:(docId:string,snapshot:HistorySnapshot,ids:string[],historyBase?:HistorySnapshot)=>void;
  renderTextToolbar?:(copy:()=>void)=>React.ReactNode};
type Drag={docId:string;pointer:number;x:number;y:number;lastX:number;lastY:number;ids:string[];base:HistorySnapshot;
  pages:PageBounds;measured:Record<string,SelectionBounds>;bounds:SelectionBounds;clones?:Record<string,string>;corner?:number;moved:boolean};
const editable=(target:Element|null)=>!!target?.closest('input,textarea,select,[contenteditable="true"]');
const surface=(target:Element|null)=>target?.closest('[data-annotation-id]');
const ui=(target:Element|null)=>target?.closest('[data-quick-shape-ui],[data-note-size-controls],.annotation-group-ui,.ft-toolbar,.unified-group-toolbar,.floating-submenu,.box-floating-toolbar,.highlight-popup-toolbar,.highlight-note-preview,#bottom-toolbar-dock');

export function AnnotationSelectionController(props:Props) {
  const ctx=useQuickShapes()!;
  const latest=useRef({...props,ctx});latest.current={...props,ctx};
  const drag=useRef<Drag|null>(null),frame=useRef(0),blockedClick=useRef(false);
  const groupFrame=useRef<HTMLDivElement>(null);
  const copyToolbar=useRef<HTMLDivElement>(null);
  const active=props.docs.find(doc=>doc.id===props.activeId);
  const snapshot=(doc:WorkspaceDoc)=>({...annotationSnapshot(doc),drawings:[...doc.drawings,...latest.current.ctx.temporary.filter(s=>s.fileId===doc.fileId),...latest.current.ctx.previewShapes.filter(s=>s.fileId===doc.fileId)]});
  const elements=(id:string)=>Array.from(document.querySelectorAll<HTMLElement>(`[data-annotation-id="${CSS.escape(id)}"]`));
  const measure=(ids:string[])=>{
    const rects=ids.flatMap(id=>elements(id).map(el=>el.getBoundingClientRect())).filter(r=>r.width || r.height);
    if(!rects.length)return null;
    const left=Math.min(...rects.map(r=>r.left)),top=Math.min(...rects.map(r=>r.top));
    return {left,top,width:Math.max(...rects.map(r=>r.right))-left,height:Math.max(...rects.map(r=>r.bottom))-top};
  };
  const refresh=()=>{
    const {docs,activeId}=latest.current,doc=docs.find(d=>d.id===activeId);
    const frame=groupFrame.current;
    if(!frame)return;
    const bounds=doc && measure(doc.selectedIds);
    const toolbar=copyToolbar.current;
    frame.style.visibility=bounds?'visible':'hidden';
    if(toolbar)toolbar.style.visibility=bounds?'visible':'hidden';
    if(!bounds)return;
    // Read the transformed annotation bounds and move the frame before the
    // browser paints this zoom frame. A React state update can land a frame late.
    const {left,top,width,height}=bounds;
    Object.assign(frame.style,{left:`${left-1}px`,top:`${top-1}px`,width:`${Math.max(3,width+2)}px`,height:`${Math.max(3,height+2)}px`});
    if(toolbar) {
      const size=toolbar.getBoundingClientRect();
      const header=document.getElementById('app-header')?.getBoundingClientRect().bottom || 0;
      const y=top-size.height-8>=header?top-size.height-8:top+height+8;
      toolbar.style.left=`${Math.max(8,Math.min(window.innerWidth-size.width-8,left+(width-size.width)/2))}px`;
      toolbar.style.top=`${Math.max(header,Math.min(window.innerHeight-size.height-8,y))}px`;
      toolbar.style.visibility=top>window.innerHeight || top+height<header || left+width<0 || left>window.innerWidth?'hidden':'visible';
    }
  };
  useLayoutEffect(refresh,[props.disabled,active?.id,active?.selectedIds,active?.drawings,active?.boxes,active?.textNotes,active?.freeTexts,active?.highlights,ctx.temporary,ctx.previewShapes]);
  useLayoutEffect(()=>{
    if(!groupFrame.current || !active || typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(refresh);
    active.selectedIds.flatMap(elements).forEach(element=>observer.observe(element));
    return()=>observer.disconnect();
  },[active?.selectedIds,active?.id,props.disabled]);
  useEffect(()=>{
    if(!active || drag.current || !active.selectedIds.length)return;
    const available=new Set(annotationEntries(snapshot(active)).map(({item})=>item.id));
    const ids=active.selectedIds.filter(id=>available.has(id));
    if(ids.length!==active.selectedIds.length) {
      latest.current.onApply(active.id,annotationSnapshot(active),ids);
      if(!ids.length && props.activeTool==='select'){ctx.setSelection(null);ctx.setOpen(false);}
    }
  },[active?.selectedIds,active?.drawings,active?.boxes,active?.textNotes,active?.freeTexts,active?.highlights,ctx.temporary,ctx.previewShapes]);
  useEffect(()=>{
    const refreshSoon=()=>{if(!drag.current)refresh();};
    window.addEventListener('scroll',refreshSoon,true);window.addEventListener('resize',refreshSoon);
    window.addEventListener('pdf-zoom-frame',refreshSoon,true);window.addEventListener('pdf-zoom-end',refreshSoon,true);
    window.addEventListener('pdf-viewport-pan',refreshSoon,true);
    return()=>{window.removeEventListener('scroll',refreshSoon,true);window.removeEventListener('resize',refreshSoon);window.removeEventListener('pdf-zoom-frame',refreshSoon,true);window.removeEventListener('pdf-zoom-end',refreshSoon,true);window.removeEventListener('pdf-viewport-pan',refreshSoon,true);};
  },[]);
  const apply=(docId:string,next:HistorySnapshot,ids:string[],base?:HistorySnapshot,clones?:Record<string,string>)=>{
    const {ctx,docs,onApply}=latest.current,doc=docs.find(d=>d.id===docId);if(!doc)return;
    const temp=new Set(ctx.temporary.filter(s=>s.fileId===doc.fileId).map(s=>s.id));
    const tempCopies=new Set(Object.entries(clones || {}).filter(([id])=>temp.has(id)).map(([,copy])=>copy));
    const persistent={...next,drawings:next.drawings.filter(s=>!temp.has(s.id) && !tempCopies.has(s.id) && !('expiresAt' in s))};
    const persistentBase=base?{...base,drawings:base.drawings.filter(s=>!('expiresAt' in s))}:undefined;
    ctx.setPreviewShapes(base?[]:next.drawings.filter(shape=>tempCopies.has(shape.id)).map(shape=>({...shape,fileId:doc.fileId})));
    const changed=persistentBase && (Object.keys(persistent) as (keyof HistorySnapshot)[]).some(key=>persistent[key].length!==persistentBase[key].length ||
      persistent[key].some((item,index)=>item!==persistentBase[key][index] && JSON.stringify(item)!==JSON.stringify(persistentBase[key][index])));
    onApply(docId,persistent,ids,changed?persistentBase:undefined);
    for(const shape of next.drawings) {
      if(temp.has(shape.id))ctx.store.update(shape.id,shape);
      else if(base && tempCopies.has(shape.id))ctx.store.add(shape,doc.fileId);
    }
    for(const id of temp)if(!next.drawings.some(s=>s.id===id))ctx.store.remove(id);
  };
  const begin=(event:{clientX:number;clientY:number;pointerId:number;altKey:boolean},doc:WorkspaceDoc,ids:string[],corner?:number)=>{
    const base=snapshot(doc),pages:PageBounds={},measured:Record<string,SelectionBounds>={};
    for(const {item} of annotationEntries(base).filter(({item})=>ids.includes(item.id))) {
      const el=elements(item.id)[0],page=el?.closest<HTMLElement>('[data-page-container="true"]') ||
        document.querySelector<HTMLElement>(`[data-workspace-doc="${CSS.escape(doc.id)}"] [data-continuous-page="${item.pageNumber}"]`);
      if(page)pages[item.pageNumber]=page.getBoundingClientRect();
      const rect=measure([item.id]);if(rect)measured[item.id]=rect;
    }
    const box=measure(ids);if(!box)return;
    drag.current={docId:doc.id,pointer:event.pointerId,x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,ids,base,pages,measured,bounds:box,
      clones:event.altKey?Object.fromEntries(ids.map(id=>[id,`annotation_${crypto.randomUUID()}`])):undefined,corner,moved:false};
    blockedClick.current=true;
    latest.current.ctx.setSelection(null);latest.current.ctx.setOpen(false);window.getSelection()?.removeAllRanges();
  };
  const transformed=(own:Drag)=>{
    const {bounds:b,corner,pages,measured}=own;
    const transform:GroupTransform={dx:own.lastX-own.x,dy:own.lastY-own.y,scale:1,originX:0,originY:0};
    if(corner!==undefined) {
      const right=corner===1 || corner===2,bottom=corner>=2;
      const fixed={x:b.left+(right?0:b.width),y:b.top+(bottom?0:b.height)};
      const vx=(right?1:-1)*Math.max(1,b.width),vy=(bottom?1:-1)*Math.max(1,b.height);
      transform.scale=Math.max(.1,Math.min(20,1+(transform.dx*vx+transform.dy*vy)/(vx*vx+vy*vy)));
      transform.dx=0;transform.dy=0;transform.originX=fixed.x;transform.originY=fixed.y;
    } else {
      const entries=annotationEntries(own.base).filter(({item})=>own.ids.includes(item.id));
      const xMin=Math.max(...entries.map(({item})=>{const p=pages[item.pageNumber],r=measured[item.id];return p && r?p.left-r.left:-Infinity;}));
      const xMax=Math.min(...entries.map(({item})=>{const p=pages[item.pageNumber],r=measured[item.id];return p && r?p.left+p.width-r.left-r.width:Infinity;}));
      const yMin=Math.max(...entries.map(({item})=>{const p=pages[item.pageNumber],r=measured[item.id];return p && r?p.top-r.top:-Infinity;}));
      const yMax=Math.min(...entries.map(({item})=>{const p=pages[item.pageNumber],r=measured[item.id];return p && r?p.top+p.height-r.top-r.height:Infinity;}));
      transform.dx=Math.max(Math.min(0,xMin),Math.min(Math.max(0,xMax),transform.dx));
      transform.dy=Math.max(Math.min(0,yMin),Math.min(Math.max(0,yMax),transform.dy));
    }
    return transformAnnotations(own.base,own.ids,pages,transform,own.clones,measured);
  };
  const preview=()=>{frame.current=0;const own=drag.current;if(own?.moved)apply(own.docId,transformed(own),own.clones?Object.values(own.clones):own.ids,undefined,own.clones);};
  const finish=(cancel=false)=>{
    if(frame.current)cancelAnimationFrame(frame.current);frame.current=0;
    const own=drag.current;drag.current=null;if(!own)return;
    if(cancel)apply(own.docId,own.base,own.ids);
    else if(own.moved)apply(own.docId,transformed(own),own.clones?Object.values(own.clones):own.ids,own.base,own.clones);
    refresh();
  };
  useEffect(()=>{
    const down=(event:PointerEvent)=>{
      const {docs,activeTool,onSelect,ctx,disabled}=latest.current;
      if(disabled || event.button!==0 || drag.current)return;
      blockedClick.current=false;
      const target=event.target instanceof Element?event.target:null;
      if(ui(target))return;
      const id=surface(target)?.getAttribute('data-annotation-id');
      const doc=id?docs.find(d=>annotationEntries(snapshot(d)).some(({item})=>item.id===id)):undefined;
      if(!id || !doc) {
        const column=target?.closest<HTMLElement>('[data-workspace-doc]');
        if(column && target?.closest('[data-page-container="true"]')) {
          onSelect(column.dataset.workspaceDoc!,'',false);ctx.setSelection(null);
          if(activeTool==='select')ctx.setOpen(false);
        }
        return;
      }
      if(editable(target) && target?.closest('input,textarea,[contenteditable="true"]')?.contains(document.activeElement) && !event.altKey)return;
      if(!editable(target) || event.shiftKey || event.altKey)(document.activeElement as HTMLElement)?.blur?.();
      if(event.shiftKey) {
        event.preventDefault();event.stopImmediatePropagation();blockedClick.current=true;
        onSelect(doc.id,id,true);ctx.setSelection(null);ctx.setOpen(false);return;
      }
      const ids=doc.selectedIds.includes(id)?doc.selectedIds:[id];
      if(event.altKey || ids.length>1 || doc.highlights.some(h=>h.id===id)) {
        event.preventDefault();event.stopImmediatePropagation();
        if(ids.length===1)onSelect(doc.id,id,false);
        begin(event,doc,ids);return;
      }
      const stroke=snapshot(doc).drawings.find(s=>s.id===id);
      if(stroke && activeTool==='select') {onSelect(doc.id,id,false);ctx.select(stroke,doc.fileId);}
      else if(!stroke){ctx.setSelection(null);ctx.setOpen(false);}
    };
    const move=(event:PointerEvent)=>{
      const own=drag.current;if(!own || own.pointer!==event.pointerId)return;
      event.preventDefault();event.stopImmediatePropagation();own.lastX=event.clientX;own.lastY=event.clientY;
      own.moved=own.moved || Math.hypot(own.lastX-own.x,own.lastY-own.y)>2;
      if(!frame.current)frame.current=requestAnimationFrame(preview);
    };
    const up=(event:PointerEvent)=>{if(drag.current?.pointer===event.pointerId){move(event);finish(event.type==='pointercancel');}};
    const click=(event:MouseEvent)=>{if(blockedClick.current && surface(event.target instanceof Element?event.target:null)){blockedClick.current=false;event.preventDefault();event.stopImmediatePropagation();}};
    const updateShift=(event:KeyboardEvent)=>{
      const wasHeld=document.body.hasAttribute('data-annotation-shift');
      document.body.toggleAttribute('data-annotation-shift',event.shiftKey);
      if(!wasHeld || event.shiftKey || latest.current.activeTool!=='select')return;
      const {ctx,docs,activeId}=latest.current,doc=docs.find(item=>item.id===activeId);
      if(!doc?.selectedIds.length)return;
      const strokes=snapshot(doc).drawings.filter(stroke=>doc.selectedIds.includes(stroke.id));
      if(strokes.length!==doc.selectedIds.length)return;
      const first=strokes[0];
      if(strokes.every(stroke=>!!stroke.quickShape===!!first.quickShape && !!stroke.isHighlighter===!!first.isHighlighter))ctx.select(first,doc.fileId);
    };
    const key=(event:KeyboardEvent)=>{
      updateShift(event);
      if(editable(event.target instanceof Element?event.target:null) || editable(document.activeElement) || latest.current.disabled)return;
      if(event.key==='Escape'){finish(true);return;}
      if(event.key!=='Delete' && event.key!=='Backspace')return;
      const doc=latest.current.docs.find(d=>d.id===latest.current.activeId);
      if(!doc?.selectedIds.length)return;
      event.preventDefault();event.stopImmediatePropagation();
      const base=snapshot(doc);apply(doc.id,editAnnotations(base,doc.selectedIds,()=>null),[],base);latest.current.ctx.setSelection(null);latest.current.ctx.setOpen(false);
    };
    const blur=()=>{document.body.removeAttribute('data-annotation-shift');finish(true);};
    window.addEventListener('pointerdown',down,true);window.addEventListener('pointermove',move,true);window.addEventListener('pointerup',up,true);window.addEventListener('pointercancel',up,true);
    window.addEventListener('click',click,true);window.addEventListener('keydown',key,true);window.addEventListener('keyup',updateShift,true);window.addEventListener('blur',blur);
    return()=>{if(frame.current)cancelAnimationFrame(frame.current);document.body.removeAttribute('data-annotation-shift');window.removeEventListener('pointerdown',down,true);window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',up,true);window.removeEventListener('click',click,true);window.removeEventListener('keydown',key,true);window.removeEventListener('keyup',updateShift,true);window.removeEventListener('blur',blur);};
  },[]);
  // The reopened drawing panel edits its selected objects, not the next tool alone.
  const revisions=useRef([ctx.revision,ctx.highlightRevision]);
  useEffect(()=>{
    const normal=revisions.current[0]!==ctx.revision,highlight=revisions.current[1]!==ctx.highlightRevision;
    revisions.current=[ctx.revision,ctx.highlightRevision];
    if((!normal && !highlight) || !active?.selectedIds.length || !ctx.selection)return;
    const base=snapshot(active),ids=active.selectedIds;
    const next=editAnnotations(base,ids,(item,kind)=>kind==='drawings'?{...item as DrawingStroke,...(normal?{color:ctx.settings.color,dashStyle:ctx.settings.dashStyle}:{}),
      ...((item as DrawingStroke).isHighlighter?(highlight?{size:ctx.highlightSize}:{}):(normal?{size:ctx.settings.size}:{}))}:item);
    apply(active.id,next,ids,base);
  },[ctx.revision,ctx.highlightRevision]);
  if(!active || active.selectedIds.length<2 || props.disabled)return null;
  const ids=active.selectedIds;
  const selected=annotationEntries(snapshot(active)).filter(({item})=>ids.includes(item.id));
  const kinds=new Set(selected.map(({kind})=>kind));
  const pureText=kinds.size===1 && kinds.has('freeTexts');
  const boxes=kinds.size===1 && kinds.has('boxes')?active.boxes.filter(box=>ids.includes(box.id)):[];
  const mixedWithToolbar=kinds.size>1 && selected.some(({kind})=>kind!=='textNotes');
  const copy=()=>{
    const base=snapshot(active),pages:PageBounds={};
    for(const {item} of selected) {
      const page=elements(item.id)[0]?.closest('[data-page-container]');
      if(page)pages[item.pageNumber]=page.getBoundingClientRect();
    }
    const clones=Object.fromEntries(ids.map(id=>[id,`annotation_${crypto.randomUUID()}`]));
    apply(active.id,transformAnnotations(base,ids,pages,{dx:12,dy:12,scale:1,originX:0,originY:0},clones),Object.values(clones),base,clones);
  };
  return createPortal(<div className="annotation-group-ui noto-ui" data-quick-shape-ui>
    <div ref={groupFrame} data-annotation-group-frame style={{position:'fixed',zIndex:89000,visibility:'hidden',border:'1.5px solid #f5c41a',pointerEvents:'none'}}>
      {[0,1,2,3].map(side=><div key={side} aria-label="Di chuyển nhóm" style={{position:'absolute',pointerEvents:'auto',cursor:'move',...(side%2===0?{left:0,right:0,height:8,...(side===0?{top:-4}:{bottom:-4})}:{top:0,bottom:0,width:8,...(side===1?{right:-4}:{left:-4})})}}
        onPointerDown={e=>{e.preventDefault();e.stopPropagation();begin(e,active,ids);}}/>)}
      {[0,1,2,3].map(corner=><button key={corner} aria-label={`Đổi kích thước nhóm góc ${corner+1}`} style={{position:'absolute',width:8,height:8,background:'#fff',border:'1.5px solid #f5c41a',pointerEvents:'auto',left:corner===0 || corner===3?-5:undefined,right:corner===1 || corner===2?-5:undefined,top:corner<2?-5:undefined,bottom:corner>=2?-5:undefined,cursor:corner%2?'nesw-resize':'nwse-resize'}}
        onPointerDown={e=>{e.preventDefault();e.stopPropagation();begin(e,active,ids,corner);}}/>) }
    </div>
    {mixedWithToolbar && <div ref={copyToolbar} className="annotation-group-toolbar" style={{position:'fixed',zIndex:90000,visibility:'hidden'}}>
      <button aria-label="Sao chép nhóm" title="Sao chép nhóm" onClick={copy}><Copy size={16}/></button>
    </div>}
    {boxes.length>1 && <AnnotationToolbar anchorId={`box-${boxes[0].id}`} anchorIds={boxes.map(box=>`box-${box.id}`)}
      fitAnchorEdges scaleWithPage className="box-floating-toolbar noto-ui pointer-events-auto select-none">
      <BoxToolbarControls boxes={[boxes[0],...boxes.slice(1)]} onCopy={copy} onChange={edit=>{
        const base=snapshot(active);
        const boxes=base.boxes.map(box=>ids.includes(box.id)?{...box,...edit(box)}:box);
        apply(active.id,{...base,boxes},ids,base);
      }} onDelete={()=>{
        const base=snapshot(active);
        apply(active.id,editAnnotations(base,ids,()=>null),[],base);
      }}/>
    </AnnotationToolbar>}
    {pureText && props.renderTextToolbar?.(copy)}
  </div>,document.body);
}
