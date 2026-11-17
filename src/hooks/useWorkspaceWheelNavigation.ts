import {useEffect,type RefObject} from 'react';
import type {WorkspaceWheelRouter} from '../utils/wheelGesture';

/** A completed left click is the explicit exit from PDF pan mode. Observe
 * pointer events in capture without consuming them: selection/drawing still
 * receive their normal events, and drags never count as navigation clicks. */
export function useWorkspaceWheelNavigation(workspace:RefObject<HTMLElement|null>,router:WorkspaceWheelRouter<HTMLElement|'workspace'>) {
  useEffect(()=>{
    let down:{pointer:number;x:number;y:number}|null=null;
    const controls='button,input,textarea,select,a,[contenteditable="true"],[role="button"],.annotation-group-ui,.floating-submenu,.box-floating-toolbar,.highlight-popup-toolbar,.highlight-note-preview,.ft-toolbar,#bottom-toolbar-dock';
    const eligible=(target:EventTarget|null)=>target instanceof Element && workspace.current?.contains(target) && !target.closest(controls);
    const start=(event:PointerEvent)=>{
      down=event.button===0 && (!event.pointerType || event.pointerType==='mouse') && eligible(event.target)?{pointer:event.pointerId,x:event.clientX,y:event.clientY}:null;
    };
    const move=(event:PointerEvent)=>{
      if(down && event.pointerId===down.pointer && Math.hypot(event.clientX-down.x,event.clientY-down.y)>4) down=null;
    };
    const cancel=()=>{down=null;};
    const end=(event:PointerEvent)=>{
      const click=down;move(event);const valid=down!==null;down=null;
      if(!click || !valid || event.pointerId!==click.pointer || event.button!==0 || !eligible(event.target)) return;
      // Finish any still-open pinch first. Its commit can select the PDF as
      // pan owner, so the user's navigation choice must be written afterwards.
      workspace.current?.querySelectorAll('.pdf-viewport-container').forEach(view=>view.dispatchEvent(new Event('pdf-interaction-stop')));
      router.setHorizontalOwner('workspace');
    };
    window.addEventListener('pointerdown',start,true);window.addEventListener('pointermove',move,true);window.addEventListener('pointerup',end,true);
    window.addEventListener('pointercancel',cancel,true);window.addEventListener('wheel',cancel,true);window.addEventListener('blur',cancel);
    return()=>{
      window.removeEventListener('pointerdown',start,true);window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',end,true);
      window.removeEventListener('pointercancel',cancel,true);window.removeEventListener('wheel',cancel,true);window.removeEventListener('blur',cancel);
    };
  },[workspace,router]);
}
