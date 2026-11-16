import {isPointTouchingStrokeHelper} from './DrawingCanvas';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import type {ActiveTool,DrawingPoint,DrawingStroke} from '../types';
import {useQuickShapes} from '../contexts/QuickShapesContext';
import {annotationCreationScale} from '../utils/annotationCreation';
import {hitQuickShape,isQuickShapeTool,moveQuickHandle,quickGeometry,quickHandles,quickPoints,quickToolKind,translateQuickPoints} from '../utils/quickShapes';

type Props={fileId:string;pageNumber:number;width:number;height:number;scale:number;eraserSize?:number;activeTool:ActiveTool;drawings:DrawingStroke[];
  onAddStroke:(shape:Omit<DrawingStroke,'id'|'createdAt'>)=>string|void;
  onUpdateStroke?:(id:string,updates:Partial<DrawingStroke>,skipHistory?:boolean)=>void;onDeleteStroke:(id:string)=>void;onClearSelection?:()=>void;
  selectedIds?:string[];onSelect?:(id:string,shift:boolean)=>void};
export function QuickShapeVisual({shape,width,height,scale}:{shape:DrawingStroke;width:number;height:number;scale:number}) {
  const g=quickGeometry(shape,width,height,scale);
  return <g fill="none" stroke={shape.color} strokeWidth={g.lineWidth} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none">
    <path d={g.shaft} strokeDasharray={shape.dashStyle==='dashed'?`${6*g.unit} ${4*g.unit}`:undefined} />
    {g.head && <path d={g.head} />}
  </g>;
}
export function QuickShapesLayer(props:Props) {
  const state=useQuickShapes();return state?<QuickShapePage {...props} state={state}/>:null;
}
type Interaction={mode:'create'|'move'|'handle'|'erase';pointer:number;start:DrawingPoint;last:DrawingPoint;shape?:DrawingStroke;handle?:number;temporary?:boolean;dirty:boolean};
function QuickShapePage({fileId,pageNumber,width,height,scale,eraserSize=20,activeTool,drawings,onAddStroke,onUpdateStroke,onDeleteStroke,onClearSelection,selectedIds,onSelect,state}:Props & {state:NonNullable<ReturnType<typeof useQuickShapes>>}) {
  const svg=useRef<SVGSVGElement>(null),interaction=useRef<Interaction|null>(null);
  const [draft,updateDraft]=useState<DrawingStroke|null>(null);
  const draftRef=useRef<DrawingStroke|null>(null);
  const setDraft=(value:DrawingStroke|null)=>{draftRef.current=value;updateDraft(value);};
  const items=useMemo(()=>[...drawings.filter(s=>s.quickShape && s.pageNumber===pageNumber),
    ...state.temporary.filter(s=>s.fileId===fileId && s.pageNumber===pageNumber),
    ...state.previewShapes.filter(s=>s.fileId===fileId && s.pageNumber===pageNumber)], [drawings,state.temporary,state.previewShapes,fileId,pageNumber]);
  const selectedId=state.selection?.fileId===fileId && state.selection.pageNumber===pageNumber?state.selection.id:null;
  const selected=items.find(s=>s.id===selectedId);
  const erasing=activeTool==='eraser' || activeTool==='quick_eraser';
  const active=isQuickShapeTool(activeTool) || erasing,interactive=active || activeTool==='select';
  const settingsRevision=useRef(state.revision);
  const temporary=(id:string)=>state.temporary.some(s=>s.id===id);
  const update=(id:string,patch:Partial<DrawingStroke>)=>temporary(id)?state.store.update(id,patch):onUpdateStroke?.(id,patch);
  const remove=(id:string)=>{if(temporary(id))state.store.remove(id);else onDeleteStroke(id);state.setSelection(null);};
  // Only deliberate toolbar edits change existing shapes. An undo/reload must
  // not be overwritten by a settings effect when the drawings array changes.
  useEffect(()=>{
    if(settingsRevision.current===state.revision)return;settingsRevision.current=state.revision;
    if(selected && !selectedIds)update(selected.id,{color:state.settings.color,size:state.settings.size,dashStyle:state.settings.dashStyle});
  },[state.revision]);
  useEffect(()=>{if(selectedId && state.selection?.kind==='quick' && !selected)state.setSelection(null);},[selectedId,selected]);
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if((event.target as Element)?.closest?.('input,textarea,[contenteditable="true"]'))return;
      if(event.key==='Shift') {
        const own=interaction.current;
        if(own?.mode==='create' && own.shape) setDraft({...own.shape,points:quickPoints(own.shape.quickShape!,own.start,own.last,event.type==='keydown')});
      }
      if(event.type!=='keydown')return;
      if(event.key==='Escape') {const pointer=interaction.current?.pointer;interaction.current=null;setDraft(null);if(pointer!==undefined && svg.current?.hasPointerCapture(pointer))svg.current.releasePointerCapture(pointer);if(selectedId)state.setSelection(null);}
      if(selected && (event.key==='Delete' || event.key==='Backspace')) {event.preventDefault();remove(selected.id);}
    };
    window.addEventListener('keydown',key);window.addEventListener('keyup',key);
    return()=>{window.removeEventListener('keydown',key);window.removeEventListener('keyup',key);};
  },[selected,selectedId,state.temporary,onDeleteStroke]);
  useEffect(()=>{
    if(interaction.current && svg.current?.hasPointerCapture(interaction.current.pointer)) svg.current.releasePointerCapture(interaction.current.pointer);
    interaction.current=null;setDraft(null);
  },[activeTool]);
  const point=(event:React.PointerEvent)=>{
    const rect=svg.current!.getBoundingClientRect();
    return {x:Math.max(0,Math.min(100,(event.clientX-rect.left)/Math.max(1,rect.width)*100)),y:Math.max(0,Math.min(100,(event.clientY-rect.top)/Math.max(1,rect.height)*100))};
  };
  const capture=(event:React.PointerEvent)=>{event.preventDefault();event.stopPropagation();svg.current?.setPointerCapture(event.pointerId);};
  const erase=(p:DrawingPoint)=>{
    for(const shape of drawings.filter(s=>!s.quickShape && s.pageNumber===pageNumber)) {
      if(isPointTouchingStrokeHelper(p,shape,width,height,eraserSize/2))onDeleteStroke(shape.id);
    }
    for(const shape of items) if(hitQuickShape(shape,p,width,height,scale,eraserSize/2)) {
      if(temporary(shape.id))state.store.remove(shape.id);else onDeleteStroke(shape.id);
    }
  };
  const start=(event:React.PointerEvent,shape?:DrawingStroke,handle?:number)=>{
    if(interaction.current || event.button!==0 || !interactive || svg.current?.closest<HTMLElement>('.pdf-viewport-container')?.dataset.zoomGesture==='true')return;
    if(!shape && !active)return;
    capture(event);if(!shape)onClearSelection?.();window.getSelection()?.removeAllRanges();const p=point(event);
    if(erasing) {interaction.current={mode:'erase',pointer:event.pointerId,start:p,last:p,dirty:false};erase(p);return;}
    if(shape) {
      state.select(shape,fileId);
      onSelect?.(shape.id,event.shiftKey);
      interaction.current={mode:handle===undefined?'move':'handle',pointer:event.pointerId,start:p,last:p,shape,handle,temporary:temporary(shape.id),dirty:false};
      setDraft(shape);return;
    }
    if(!isQuickShapeTool(activeTool))return;
    const zoom=Number(svg.current?.closest<HTMLElement>('[data-user-zoom]')?.dataset.userZoom || 1);
    const kind=quickToolKind(activeTool);
    const created:DrawingStroke={id:crypto.randomUUID(),createdAt:Date.now(),pageNumber,quickShape:kind,
      points:quickPoints(kind,p,p,event.shiftKey),color:state.settings.color,size:state.settings.size,dashStyle:state.settings.dashStyle,
      opacity:1,referenceScale:annotationCreationScale(scale,zoom)};
    state.setSelection(null);
    interaction.current={mode:'create',pointer:event.pointerId,start:p,last:p,shape:created,temporary:activeTool.endsWith('_temporary'),dirty:false};
    setDraft(created);
  };
  const move=(event:React.PointerEvent)=>{
    const own=interaction.current;if(!own || own.pointer!==event.pointerId)return;
    const p=point(event);own.last=p;own.dirty=own.dirty || Math.hypot((p.x-own.start.x)*width/100,(p.y-own.start.y)*height/100)>1;
    if(own.mode==='erase'){erase(p);return;}
    const shape=own.shape!;
    const handle=own.mode==='handle'?quickHandles(shape)[own.handle!]:null;
    const points=own.mode==='create'?quickPoints(shape.quickShape!,own.start,p,event.shiftKey):
      handle?moveQuickHandle(shape,own.handle!,{x:Math.max(0,Math.min(100,handle.x+p.x-own.start.x)),y:Math.max(0,Math.min(100,handle.y+p.y-own.start.y))}):translateQuickPoints(shape.points,p.x-own.start.x,p.y-own.start.y);
    setDraft({...shape,points});
  };
  const finish=(event:React.PointerEvent,cancel=false)=>{
    const own=interaction.current;if(!own || own.pointer!==event.pointerId)return;
    if(!cancel && own.mode!=='erase')move(event);
    const draft=draftRef.current;
    interaction.current=null;
    if(svg.current?.hasPointerCapture(event.pointerId))svg.current.releasePointerCapture(event.pointerId);
    if(!cancel && draft && own.dirty && own.mode!=='erase') {
      if(own.mode==='create') {
        const end=draft.points.at(-1)!,start=draft.points[0];
        const valid=draft.quickShape==='rectangle'
          ? Math.abs(end.x-start.x)*width/100>=2 && Math.abs(end.y-start.y)*height/100>=2
          : Math.hypot((end.x-start.x)*width/100,(end.y-start.y)*height/100)>=4;
        if(valid) {
          if(own.temporary){state.store.add(draft,fileId);state.select(draft,fileId);onSelect?.(draft.id,false);}
          else {const {id,createdAt,...payload}=draft;const savedId=onAddStroke(payload);if(savedId){state.select({...draft,id:savedId},fileId);onSelect?.(savedId,false);}}
        }
      } else if(own.temporary)state.store.update(draft.id,{points:draft.points});
      else onUpdateStroke?.(draft.id,{points:draft.points});
    }
    setDraft(null);
  };
  const display=items.map(s=>draft?.id===s.id?draft:s);
  if(draft && interaction.current?.mode==='create')display.push(draft);
  return <svg ref={svg} data-quick-shape-layer viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"
    className="absolute inset-0 w-full h-full overflow-hidden z-[26000] select-none"
    style={{pointerEvents:active?'auto':'none',touchAction:active?'none':undefined,cursor:erasing?'crosshair':active?'crosshair':undefined}}
    onPointerDown={e=>start(e)} onPointerMove={move} onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)}>
    {active && <rect data-quick-shape-canvas width="100%" height="100%" fill="transparent" pointerEvents="all"/>}
    {display.map(shape=>{
      const g=quickGeometry(shape,width,height,scale),chosen=shape.id===selectedId && interaction.current?.mode!=='create' && (!selectedIds || selectedIds.length<2);
      return <g key={shape.id} data-quick-shape-hit={shape.id} data-annotation-id={shape.id}>
        <QuickShapeVisual shape={shape} width={width} height={height} scale={scale}/>
        <path d={g.path} fill="none" stroke="transparent" strokeWidth={Math.max(18,g.lineWidth+12)}
          style={{pointerEvents:interactive?'stroke':'none',cursor:erasing?'crosshair':'move',touchAction:'none'}} onPointerDown={e=>start(e,shape)}/>
        {chosen && interactive && !erasing && quickHandles(shape).map((p,index)=><g key={index}>
          {shape.quickShape!=='rectangle' && <rect data-quick-handle-hit={index} x={p.x/100*width-11} y={p.y/100*height-11} width={22} height={22}
            fill="transparent" style={{pointerEvents:'all',cursor:index===1?'grab':'move',touchAction:'none'}}
            onPointerDown={e=>{
              const position=point(e),rect=svg.current!.getBoundingClientRect();
              const handles=quickHandles(shape);
              // Prefer the nearest dot if the generous target areas overlap.
              const nearest=handles.reduce((best,p,i)=>Math.hypot((p.x-position.x)*rect.width,(p.y-position.y)*rect.height)<
                Math.hypot((handles[best].x-position.x)*rect.width,(handles[best].y-position.y)*rect.height)?i:best,0);
              start(e,shape,nearest);
            }}/>}
          <circle cx={p.x/100*width} cy={p.y/100*height} r={4}
            fill="white" stroke="#f5c41a" strokeWidth={1.5} style={{pointerEvents:'all',cursor:shape.quickShape!=='rectangle' && index!==1?'move':'grab',touchAction:'none'}}
            onPointerDown={e=>start(e,shape,index)}/>
        </g>)}
      </g>;
    })}
  </svg>;
}
