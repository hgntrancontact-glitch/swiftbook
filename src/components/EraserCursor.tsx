import React, {useEffect, useRef} from 'react';

/** Follow the same pointer stream as drawing, including captured drags. */
export function EraserCursor({active,size}:{active:boolean;size:number}) {
  const cursor=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!active)return;
    const follow=(event:PointerEvent)=>{
      const el=cursor.current;if(!el)return;
      el.style.left=`${event.clientX}px`;
      el.style.top=`${event.clientY}px`;
      el.style.visibility='visible';
    };
    // Capture also covers pointerdown handlers that stop propagation and
    // prevent the compatibility mouse events while erasing.
    window.addEventListener('pointermove',follow,true);
    window.addEventListener('pointerdown',follow,true);
    return()=>{
      window.removeEventListener('pointermove',follow,true);
      window.removeEventListener('pointerdown',follow,true);
    };
  },[active]);
  return active?<div ref={cursor} data-eraser-cursor aria-hidden="true"
    className="pointer-events-none fixed rounded-full border-2 border-red-500 bg-red-400/25 -translate-x-1/2 -translate-y-1/2 z-[999999] shadow-xs"
    style={{visibility:'hidden',width:size,height:size}}/>:null;
}
