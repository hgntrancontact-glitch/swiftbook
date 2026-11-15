import React,{useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {registerPageLabel} from '../utils/pageLabels';

export function PageNumberLabel({pageNumber,slotRef}:{pageNumber:number;slotRef:React.RefObject<HTMLDivElement|null>}) {
  const labelRef=useRef<HTMLDivElement>(null);
  const [viewport,setViewport]=useState<HTMLElement|null>(null);
  useLayoutEffect(()=>{setViewport(slotRef.current?.closest<HTMLElement>('.pdf-viewport-container') || null);},[slotRef]);
  useLayoutEffect(()=> {
    if(viewport && slotRef.current && labelRef.current) return registerPageLabel(viewport,slotRef.current,labelRef.current);
  },[viewport,slotRef,pageNumber]);
  const label=<div ref={labelRef} data-page-label={pageNumber} aria-hidden="true"
    className="absolute z-[50000] bottom-1 left-1/2 -translate-x-1/2 select-none pointer-events-none"
    style={viewport?{bottom:'auto',width:'max-content'}:undefined}>
      <div data-page-label-body className="h-[18px] leading-[18px] min-w-6 text-center text-[10px] text-neutral-400 font-mono tabular-nums bg-white/80 px-1 rounded shadow-2xs">{pageNumber}</div>
    </div>;
  // The inline first mount is replaced in a layout effect, before first paint.
  return viewport?createPortal(label,viewport):label;
}
