import { annotationZoom } from './annotationUi';
type Rect = {left:number;top:number;bottom:number;width:number};
export function pageLabelPosition(page:Rect,viewport:Rect,scroll:{left:number;top:number},zoom=1) {
  return {left:page.left-viewport.left+scroll.left+page.width/2,top:page.bottom-viewport.top+scroll.top-22*zoom};
}

// One read/write batch for all mounted labels in a viewport. Labels belong to
// the native scroll tree, but never to a PDF transform or page sizing subtree.
const registries=new WeakMap<HTMLElement,{add:(slot:HTMLElement,label:HTMLElement)=>()=>void}>();
export function registerPageLabel(viewport:HTMLElement,slot:HTMLElement,label:HTMLElement):()=>void {
  let registry=registries.get(viewport);
  if(!registry) {
    const entries=new Map<HTMLElement,HTMLElement>();
    let frame=0;
    const update=()=> {
      const bounds=viewport.getBoundingClientRect();
      const scroll={left:viewport.scrollLeft,top:viewport.scrollTop};
      const positions=[...entries].map(([element,tag])=> {
        const page=element.getBoundingClientRect();
        const userZoom=Number(element.closest<HTMLElement>('[data-user-zoom]')?.dataset.userZoom || 1);
        const zoom=annotationZoom(userZoom,page.width,parseFloat(element.style.getPropertyValue('--pdf-page-width')) || page.width);
        return {tag,zoom,...pageLabelPosition(page,bounds,scroll,zoom)};
      });
      for(const {tag,left,top,zoom} of positions) {
        tag.style.left=`${left}px`;tag.style.top=`${top}px`;
        const body=tag.firstElementChild as HTMLElement|null;
        if(body) body.style.zoom=String(zoom);
      }
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;update();});};
    const resize=new ResizeObserver(schedule);
    resize.observe(viewport);
    viewport.addEventListener('scroll',schedule,{passive:true});
    viewport.addEventListener('pdf-viewport-pan',update);
    viewport.addEventListener('pdf-zoom-end',update);
    window.addEventListener('resize',schedule);
    registry={add:(element,tag)=> {
      entries.set(element,tag);resize.observe(element);update();
      return()=> {
        entries.delete(element);resize.unobserve(element);
        if(entries.size) return;
        cancelAnimationFrame(frame);resize.disconnect();
        viewport.removeEventListener('scroll',schedule);
        viewport.removeEventListener('pdf-viewport-pan',update);
        viewport.removeEventListener('pdf-zoom-end',update);
        window.removeEventListener('resize',schedule);
        registries.delete(viewport);
      };
    }};
    registries.set(viewport,registry);
  }
  return registry.add(slot,label);
}
