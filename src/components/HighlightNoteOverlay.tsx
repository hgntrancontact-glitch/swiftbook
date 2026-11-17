import { snapUiPixel } from '../utils/annotationSharpness';
import { initialNoteSide, pageNoteGeometry, type PagePoint } from '../utils/pageNoteGeometry';
import { routeAnnotationWheel } from '../utils/annotationWheel';
import { HIGHLIGHT_NOTE_SIZE, HIGHLIGHT_NOTE_ICON_SIZE, HIGHLIGHT_NOTE_GLYPH_SIZE } from '../utils/annotationUi';
import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare } from 'lucide-react';

interface Props {
  anchorId: string;
  bottomAnchorId: string;
  side?: 'above'|'below';
  popupScale?: number;
  onSideChange: (side:'above'|'below')=>void;
  scopeId: string;
  owner: string;
  highlightId: string;
  mode: 'auto' | 'pinned' | 'transparent';
  showPopup: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onEdit: () => void;
  children: React.ReactNode;
}

// Page-relative dimensions, calibrated at document zoom 100%.
const ICON_SIZE = HIGHLIGHT_NOTE_ICON_SIZE;
const ICON_GLYPH_SIZE = HIGHLIGHT_NOTE_GLYPH_SIZE;
const POPUP_WIDTH = 236;
const POPUP_GAP = 6;
const ARROW_WIDTH = 12;

// Page-local overlays scroll natively; dimensions follow document zoom.
export function HighlightNoteOverlay({ anchorId, bottomAnchorId, side, popupScale=1, onSideChange, scopeId, owner, highlightId, mode, showPopup, onEnter, onLeave, onEdit, children }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLButtonElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLButtonElement>(null);
  const sideRef=useRef({side,onSideChange});
  sideRef.current={side,onSideChange};
  const [chosenSide,setChosenSide]=useState(side || 'above');
  const popupRef = useRef<HTMLDivElement>(null);
  const popupHeightRef = useRef<number | null>(null);
  const positionRef = useRef<(() => void) | null>(null);
  const bridgeRef = useRef<HTMLDivElement>(null);
  const directionRef = useRef<'above' | 'below'>('above');
  const placementRef = useRef<{direction:'above'|'below';offsetX:number} | null>(null);
  const [portalTarget,setPortalTarget]=useState<HTMLElement|null>(null);
  useLayoutEffect(()=> {
    const scope=document.getElementById(scopeId)?.closest('[data-page-container="true"]') || document;
    const anchor=scope.querySelector<HTMLElement>(`#${CSS.escape(anchorId)}`);
    setPortalTarget(anchor?.closest<HTMLElement>('[data-pdf-page-slot="true"]') || null);
  },[anchorId,scopeId]);
  useLayoutEffect(() => {
    const scope = document.getElementById(scopeId)?.closest('[data-page-container="true"]') || document;
    const anchor = scope.querySelector<HTMLElement>(`#${CSS.escape(anchorId)}`);
    const bottomAnchor=scope.querySelector<HTMLElement>(`#${CSS.escape(bottomAnchorId)}`) || anchor;
    const icon = iconRef.current;
    if (!anchor || !icon || !portalTarget) return;
    let frame=0;
    const position = () => {
      if(frame) cancelAnimationFrame(frame);frame=0;
      const wrapper=anchor.closest<HTMLElement>('[data-user-zoom]');
      const factor=Number(wrapper?.dataset.userZoom || 1);
      const firstRect=anchor.getBoundingClientRect();
      const lastRect=bottomAnchor!.getBoundingClientRect();
      const slot=portalTarget.getBoundingClientRect();
      const layoutWidth=parseFloat(portalTarget.style.getPropertyValue('--pdf-page-width')) || slot.width;
      const live=slot.width/Math.max(1,layoutWidth);
      const dpr=window.devicePixelRatio || 1;
      const sized=(pixels:number)=>`${pixels*live}px`;
      const aligned=(point:PagePoint)=>({
        left:`${snapUiPixel(slot.left+slot.width*point.x/100+point.dx*live,dpr)-slot.left}px`,
        top:`${snapUiPixel(slot.top+slot.height*point.y/100+point.dy*live,dpr)-slot.top}px`,
      });
      const iconSize=ICON_SIZE*factor;
      if(rootRef.current) rootRef.current.dataset.highlightNoteScale=String(factor*live);
      icon.style.width=icon.style.height=icon.style.minWidth=icon.style.maxWidth=sized(iconSize);
      icon.style.borderWidth=sized(2*factor);
      icon.style.boxShadow=`0 ${sized(2*factor)} ${sized(4*factor)} rgba(0,0,0,.16)`;
      const badge=badgeRef.current;
      if(badge) {
        badge.style.width=sized(iconSize+ARROW_WIDTH*factor);badge.style.height=sized(iconSize);
        badge.style.gap='0px';
      }
      const glyph=icon.querySelector('svg');
      if(glyph) glyph.style.width=glyph.style.height=sized(ICON_GLYPH_SIZE*factor);
      const viewport=anchor.closest('.pdf-viewport-container')?.getBoundingClientRect();
      const popup = popupRef.current;
      if (!popup) return;
      const screenLeft = 8, screenRight = window.innerWidth - 8;
      const screenTop = Math.max(8, (document.getElementById('app-header')?.getBoundingClientRect().bottom || 0) + 4);
      const screenBottom = window.innerHeight - 8;
      const iconTop = Math.max(screenTop, (viewport?.top || 0) + 4,slot.top+4);
      const iconBottom = Math.min(screenBottom, (viewport?.bottom || window.innerHeight) - 4,slot.bottom-4);
      const iconLeft = Math.max(screenLeft, (viewport?.left || 0) + 4,slot.left+4);
      const iconRight = Math.min(screenRight, (viewport?.right || window.innerWidth) - 4,slot.right-4);
      // Retained/virtual pages can mount far outside the view. Choose a side
      // only when the note first reaches its real, measured visible page.
      if(!placementRef.current && !sideRef.current.side &&
        (slot.width<=0 || slot.height<=0 || lastRect.bottom<iconTop || firstRect.top>iconBottom)) {
        icon.style.visibility='hidden';
        if(badge) badge.style.visibility='hidden';
        if(arrowRef.current) arrowRef.current.style.visibility='hidden';
        popup.style.visibility='hidden';
        if(bridgeRef.current) bridgeRef.current.style.visibility='hidden';
        return;
      }
      // Scale the entire card once. Its base width and maximum body height
      // are document-space values, not a viewport-dependent size negotiation.
      const popupFactor=factor*HIGHLIGHT_NOTE_SIZE*popupScale;
      const cardWidth=POPUP_WIDTH*popupFactor;
      popup.style.width=sized(cardWidth);
      popup.style.maxHeight=sized(420*popupFactor);
      popup.style.setProperty('--highlight-popup-height',sized(420*popupFactor));
      popup.style.borderRadius=sized(12*popupFactor);
      popup.style.overflow='hidden';
      const card=popup.firstElementChild as HTMLElement|null;
      if(card && (showPopup || popupHeightRef.current===null)) {
        // Layout text at its actual size. Fractional CSS zoom below 1 can
        // retain a compositor bitmap instead of repainting small glyphs.
        card.style.zoom='1';card.style.maxWidth='none';card.style.width=sized(cardWidth);
        card.style.setProperty('--highlight-ui-scale',String(popupFactor*live));
        card.style.setProperty('--panel-ui-scale',String(popupFactor*live));
      }
      if(popupHeightRef.current===null) popupHeightRef.current=(card?.getBoundingClientRect().height || popup.getBoundingClientRect().height)/(popupFactor*live);
      const height=popupHeightRef.current*popupFactor;
      const gap=POPUP_GAP*factor;
      let direction=sideRef.current.side || placementRef.current?.direction || directionRef.current;
      if(!placementRef.current) {
        direction=sideRef.current.side || initialNoteSide(firstRect.top,lastRect.bottom,iconTop,iconBottom,(iconSize+gap+height)*live);
        const r=direction==='above'?firstRect:lastRect;
        const requested=r.right+(iconSize/2-cardWidth)*live;
        const initialX=cardWidth*live<=iconRight-iconLeft?Math.max(iconLeft,Math.min(iconRight-cardWidth*live,requested)):requested;
        placementRef.current={direction,offsetX:(initialX-requested)/(factor*live)};
        if(!sideRef.current.side) sideRef.current.onSideChange(direction);
      }
      if(directionRef.current!==direction) setChosenSide(direction);
      directionRef.current=direction;
      const end=direction==='above'?anchor:bottomAnchor!;
      const geometry=pageNoteGeometry({x:parseFloat(end.style.left)||0,y:parseFloat(end.style.top)||0,
        width:parseFloat(end.style.width)||0,height:parseFloat(end.style.height)||0,rise:Number(end.dataset.highlightRise || 0)},
        factor,direction==='above',height,cardWidth,placementRef.current?.offsetX || 0);
      if(badge) {Object.assign(badge.style,aligned(geometry.icon));badge.style.visibility='visible';}
      icon.style.visibility='visible';icon.dataset.popupDirection=direction;
      const arrow=arrowRef.current;
      if(arrow) {
        arrow.style.width=sized(ARROW_WIDTH*factor);arrow.style.height=sized(iconSize);
        arrow.style.alignItems=direction==='above'?'flex-end':'flex-start';
        // Align the painted arrow tip with the yellow face, inside the white rim.
        arrow.style.paddingTop=arrow.style.paddingBottom=sized(2*factor);
        const shape=arrow.querySelector('svg');
        if(shape) {
          shape.style.width=sized(iconSize/3);
          shape.style.height=sized(iconSize*2/3);
        }
        arrow.style.visibility='visible';
      }
      Object.assign(popup.style,aligned(geometry.popup));
      popup.style.visibility=showPopup?'visible':'hidden';popup.dataset.popupDirection=direction;
      const bridge=bridgeRef.current;
      if(bridge) {
        Object.assign(bridge.style,aligned(geometry.bridge));
        bridge.style.width=sized(geometry.bridge.width);bridge.style.height=sized(geometry.bridge.height);
        bridge.style.clipPath=geometry.bridge.clipPath;
        bridge.style.visibility=showPopup?'visible':'hidden';
      }
    };
    positionRef.current = position;
    // Keep wheel/pinch routing identical while hovering the note body.
    const viewport = anchor.closest<HTMLElement>('.pdf-viewport-container');
    const wheel = (event: WheelEvent) => {
      if (viewport) routeAnnotationWheel(event, viewport, popupRef.current);
    };
    viewport?.addEventListener('pdf-zoom-end', position);
    viewport?.addEventListener('pdf-zoom-frame', position);
    const pan=()=>{if(viewport?.dataset.zoomGesture!=='true') position();};
    viewport?.addEventListener('pdf-viewport-pan', pan);
    const root = rootRef.current;
    root?.addEventListener('wheel', wheel, { passive: false });
    const schedule=()=> {if(!frame) frame=requestAnimationFrame(()=>{frame=0;position();});};
    viewport?.addEventListener('scroll',schedule,{passive:true});
    const body=popupRef.current?.querySelector('[data-highlight-note-body]');
    const resize = new ResizeObserver(entries=>{
      if(entries.some(entry=>entry.target===body)) popupHeightRef.current=null;
      schedule();
    });
    resize.observe(portalTarget);
    if(body) resize.observe(body);
    const mutation = new MutationObserver(records => {
      if (records.some(record => record.type === 'childList' || record.type === 'characterData')) popupHeightRef.current = null;
      schedule();
    });
    const wrapper = anchor.closest('[data-scale]');
    if (wrapper) mutation.observe(wrapper, { attributes: true, attributeFilter: ['data-user-zoom'] });

    mutation.observe(anchor, { attributes: true, attributeFilter: ['style'] });
    if(bottomAnchor!==anchor) mutation.observe(bottomAnchor!, { attributes: true, attributeFilter: ['style'] });
    if (popupRef.current) mutation.observe(popupRef.current, { childList: true, characterData: true, subtree: true });
    window.addEventListener('resize', schedule);
    position();
    return () => {
      positionRef.current = null;
      viewport?.removeEventListener('pdf-zoom-end', position);
      viewport?.removeEventListener('pdf-zoom-frame', position);
      viewport?.removeEventListener('pdf-viewport-pan', pan);
      viewport?.removeEventListener('scroll',schedule);
      root?.removeEventListener('wheel', wheel);
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [anchorId, bottomAnchorId, scopeId, mode, showPopup,portalTarget,popupScale]);

  // React commits the final page dimensions before paint. Rebase HTML zoom in
  // that same commit rather than leaving one frame with the old live ratio.
  useLayoutEffect(() => { positionRef.current?.(); });

  return portalTarget ? createPortal(
    <div ref={rootRef} data-highlight-note-overlay={highlightId} data-highlight-note-owner={owner} data-highlight-note-open={showPopup} className="absolute inset-0 pointer-events-none z-[90000]" onMouseLeave={event => {
      if (event.relatedTarget instanceof Node && rootRef.current?.contains(event.relatedTarget)) return;
      onLeave();
    }}>
      <div ref={badgeRef} data-highlight-note-badge={highlightId}
        className="absolute flex items-center pointer-events-auto z-[90000]"
        style={{visibility:'hidden',width:ICON_SIZE+ARROW_WIDTH,height:ICON_SIZE}}>
      <button ref={iconRef} type="button" data-highlight-note-icon={highlightId}
        className="flex shrink-0 items-center justify-center bg-[#f5c41a] hover:bg-[#e5b512] text-neutral-950 rounded-full border-2 border-white cursor-pointer"
        style={{visibility: 'hidden', boxSizing:'border-box', flexShrink: 0, transform: 'none', zoom: 1 }} title="Xem/Sửa ghi chú"
        onMouseEnter={onEnter}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onEdit(); }}
        onDoubleClick={e => { e.stopPropagation(); e.preventDefault(); onEdit(); }}
        onContextMenu={e => { e.stopPropagation(); e.preventDefault(); onEdit(); }}>
        <MessageSquare size={ICON_GLYPH_SIZE} style={{ width: ICON_GLYPH_SIZE, height: ICON_GLYPH_SIZE, flexShrink: 0 }} className="fill-neutral-950 stroke-neutral-950" />
      </button>
      <button ref={arrowRef} type="button" data-highlight-note-side={highlightId}
        className="flex shrink-0 items-center justify-center text-black border-0 bg-transparent cursor-pointer"
        style={{visibility:'hidden',boxSizing:'border-box'}} title={chosenSide==='above'?'Chuyển ghi chú xuống dưới':'Chuyển ghi chú lên trên'}
        aria-label={chosenSide==='above'?'Chuyển ghi chú xuống dưới':'Chuyển ghi chú lên trên'}
        onMouseDown={e=>e.stopPropagation()}
        onClick={e=>{
          e.stopPropagation();
          const next=directionRef.current==='above'?'below':'above';
          sideRef.current.side=next;
          placementRef.current=null;
          positionRef.current?.();
          onSideChange(next);
        }}>
        <svg width="100%" height="100%" viewBox="0 0 12 24" fill="none" aria-hidden="true"
          data-note-arrow={chosenSide==='above'?'down':'up'} style={{overflow:'visible'}}>
          <path d={chosenSide==='above'?'M6 10 V23.25 M.75 18 L6 23.25 L11.25 18':'M6 14 V.75 M.75 6 L6 .75 L11.25 6'}
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      </div>
      {<>
        <div ref={bridgeRef} className="absolute z-[89999]" style={{ visibility: 'hidden', pointerEvents: mode === 'auto' ? 'auto' : 'none' }} />
        <div ref={popupRef} data-highlight-note-popup-frame={highlightId} className="absolute rounded-xl z-[90001]" style={{ left: 0, top: 0, visibility: 'hidden', pointerEvents: mode === 'transparent' ? 'none' : 'auto' }}>
          {children}
        </div>
      </>}
    </div>, portalTarget
  ) : null;
}
