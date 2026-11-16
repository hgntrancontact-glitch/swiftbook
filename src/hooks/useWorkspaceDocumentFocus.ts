import {useCallback,useLayoutEffect,useRef,useState,type RefObject} from 'react';

/** Fulfil explicit open/tab requests after React commits the visible columns. */
export function useWorkspaceDocumentFocus(containerRef:RefObject<HTMLDivElement|null>,pairIndexRef:RefObject<number>,visibleIds:string[]) {
  const [request,setRequest]=useState<{id:string}|null>(null);
  const handled=useRef<typeof request>(null);
  const focus=useCallback((id:string)=>setRequest({id}),[]);
  useLayoutEffect(()=>{
    if(!request || handled.current===request)return;
    const container=containerRef.current;if(!container)return;
    const columns=Array.from(container.querySelectorAll<HTMLElement>(':scope > [data-workspace-doc]'))
      .filter(column=>column.style.display!=='none');
    const index=columns.findIndex(column=>column.dataset.workspaceDoc===request.id);
    if(index<0 || container.clientWidth<=0)return;
    const pair=Math.max(0,Math.min(columns.length-2,index===0?0:index-1));
    pairIndexRef.current=pair;
    // Cancel old smooth movement/snap before placing the newly committed pair.
    container.style.scrollSnapType='none';
    container.scrollTo({left:pair*(container.clientWidth/2),behavior:'instant'});
    container.style.scrollSnapType=columns.length>1?'x mandatory':'none';
    handled.current=request;
  },[request,visibleIds.join('|'),containerRef,pairIndexRef]);
  return focus;
}
