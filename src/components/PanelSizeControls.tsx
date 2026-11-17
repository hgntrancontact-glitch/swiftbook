import React, {useState} from 'react';

/** Disclosure changes the controls only; the panel's size belongs to its owner. */
export function PanelSizeControls({value=1,onChange,label,canShrink=value>.5,canGrow=value<3}: {
  value?:number;onChange:(value:number)=>void;label:string;canShrink?:boolean;canGrow?:boolean;
}) {
  const [open,setOpen]=useState(false);
  return <span data-panel-size-controls className="inline-flex items-center shrink-0" style={{gap:6,fontSize:14,lineHeight:1}}
    onMouseDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()}>
    {open && ([-1,1] as const).map(direction=><button type="button" key={direction}
      aria-label={`${direction<0?'Thu nhỏ':'Phóng lớn'} ${label}`} title={`${direction<0?'Thu nhỏ':'Phóng lớn'} ${label}`}
      disabled={direction<0?!canShrink:!canGrow}
      className="border-0 bg-transparent p-0 cursor-pointer disabled:opacity-40 disabled:cursor-default"
      style={{color:'inherit',width:12,height:16,lineHeight:1,fontSize:16}}
      onClick={()=>onChange(Math.max(.5,Math.min(3,Math.round((value+direction*.1)*10)/10)))}>{direction<0?'−':'+'}</button>)}
    <button type="button" aria-label={`${open?'Ẩn':'Hiện'} chỉnh kích thước ${label}`} aria-expanded={open}
      className="border-0 bg-transparent p-0 cursor-pointer" style={{color:'inherit',width:10,height:16}}
      onClick={()=>setOpen(previous=>!previous)}>
      <svg width="8" height="14" viewBox="0 0 8 14" fill="none" aria-hidden="true">
        <path d={open?'M1 1 L7 7 L1 13':'M7 1 L1 7 L7 13'} stroke="currentColor" strokeWidth="1"/>
      </svg>
    </button>
  </span>;
}
