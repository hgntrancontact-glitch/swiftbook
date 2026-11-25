import React, {useRef} from 'react';
import type {DrawingStroke} from '../types';
import {hasStrokeEndpoints} from '../utils/strokeEndpoints';

export function StrokeEndpointHandles({stroke,onUpdate}:{
  stroke:DrawingStroke;
  onUpdate:(id:string,updates:Partial<DrawingStroke>,skipHistory?:boolean)=>void;
}) {
  const drag=useRef<{pointer:number;index:number;original:DrawingStroke['points'];changed:boolean}|null>(null);
  if(!hasStrokeEndpoints(stroke))return null;
  const move=(event:React.PointerEvent<HTMLButtonElement>)=>{
    const current=drag.current;
    const page=event.currentTarget.closest('[data-page-container]')?.getBoundingClientRect();
    if(!current || current.pointer!==event.pointerId || !page)return;
    event.stopPropagation();
    const point={x:Math.max(0,Math.min(100,(event.clientX-page.left)/page.width*100)),
      y:Math.max(0,Math.min(100,(event.clientY-page.top)/page.height*100))};
    const points=current.original.map((original,index)=>index===current.index?point:original);
    onUpdate(stroke.id,{points},current.changed);
    current.changed=true;
  };
  return <div data-quick-shape-ui className="absolute inset-0 pointer-events-none z-[35000]">
    {[0,stroke.points.length-1].map(index=><button key={index} type="button"
      data-stroke-endpoint={index===0?'start':'end'}
      aria-label={index===0?'Kéo đầu nét':'Kéo cuối nét'}
      className="absolute -translate-x-1/2 -translate-y-1/2 w-[10px] h-[10px] rounded-full bg-[#f5c41a] border-2 border-white shadow pointer-events-auto cursor-move before:content-[''] before:absolute before:-inset-2 before:rounded-full"
      style={{left:`${stroke.points[index].x}%`,top:`${stroke.points[index].y}%`,touchAction:'none'}}
      onClick={event=>event.stopPropagation()}
      onMouseDown={event=>event.stopPropagation()}
      onPointerDown={event=>{
        if(event.button!==0)return;
        event.preventDefault();event.stopPropagation();
        drag.current={pointer:event.pointerId,index,original:stroke.points.map(point=>({...point})),changed:false};
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={move}
      onPointerUp={event=>{
        if(drag.current?.pointer!==event.pointerId)return;
        move(event);drag.current=null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={event=>{
        const current=drag.current;
        if(current?.changed)onUpdate(stroke.id,{points:current.original},true);
        drag.current=null;event.stopPropagation();
      }}
    />)}
  </div>;
}
