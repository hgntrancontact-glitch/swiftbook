import { pageNoteGeometry, pointStyle } from '../utils/pageNoteGeometry';
import { routeAnnotationWheel } from '../utils/annotationWheel';
import { HIGHLIGHT_NOTE_SIZE } from '../utils/annotationUi';
import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare } from 'lucide-react';

interface Props {
  anchorId: string;
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
const ICON_SIZE = 18.5;
const ICON_GLYPH_SIZE = 9.5;
const POPUP_WIDTH = 224;
const POPUP_GAP = 6;

// Page-local overlays scroll natively; dimensions follow document zoom.
export function HighlightNoteOverlay({ anchorId, scopeId, owner, highlightId, mode, showPopup, onEnter, onLeave, onEdit, children }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLButtonElement>(null);
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
    const icon = iconRef.current;
    if (!anchor || !icon || !portalTarget) return;
    if (!showPopup) placementRef.current=null;
    const position = () => {
      const wrapper=anchor.closest<HTMLElement>('[data-user-zoom]');
      const factor=Number(wrapper?.dataset.userZoom || 1);
      const r=anchor.getBoundingClientRect();
      const slot=portalTarget.getBoundingClientRect();
      const layoutWidth=parseFloat(portalTarget.style.getPropertyValue('--pdf-page-width')) || slot.width;
      const live=slot.width/Math.max(1,layoutWidth);
      const sized=(pixels:number)=>`calc(${pixels}px * var(--pdf-live-zoom, 1))`;
      const iconSize=ICON_SIZE*factor;
      if(rootRef.current) rootRef.current.dataset.highlightNoteScale=String(factor*live);
      icon.style.width=icon.style.height=icon.style.minWidth=icon.style.minHeight=icon.style.maxWidth=icon.style.maxHeight=sized(iconSize);
      icon.style.borderWidth=sized(2*factor);
      icon.style.boxShadow=`0 ${sized(2*factor)} ${sized(4*factor)} rgba(0,0,0,.16)`;
      const glyph=icon.querySelector('svg');
      if(glyph) glyph.style.width=glyph.style.height=sized(ICON_GLYPH_SIZE*factor);
      const viewport=anchor.closest('.pdf-viewport-container')?.getBoundingClientRect();
      const popup = popupRef.current;
      if (!popup) return;
      const screenLeft = 8, screenRight = window.innerWidth - 8;
      const screenTop = Math.max(8, (document.getElementById('app-header')?.getBoundingClientRect().bottom || 0) + 4);
      const screenBottom = window.innerHeight - 8;
      const iconTop = Math.max(screenTop, (viewport?.top || 0) + 4);
      const iconBottom = Math.min(screenBottom, (viewport?.bottom || window.innerHeight) - 4);
      const iconLeft = Math.max(screenLeft, (viewport?.left || 0) + 4);
      const iconRight = Math.min(screenRight, (viewport?.right || window.innerWidth) - 4);
      // Scale the entire card once. Its base width and maximum body height
      // are document-space values, not a viewport-dependent size negotiation.
      const popupFactor=factor*HIGHLIGHT_NOTE_SIZE;
      const cardWidth=POPUP_WIDTH*popupFactor;
      popup.style.width=sized(cardWidth);
      popup.style.maxHeight=sized(420*popupFactor);
      popup.style.setProperty('--highlight-popup-height','420px');
      popup.style.borderRadius=sized(12*popupFactor);
      popup.style.overflow='hidden';
      const card=popup.firstElementChild as HTMLElement|null;
      if(card) {card.style.zoom=`calc(${popupFactor} * var(--pdf-live-zoom, 1))`;card.style.width=`${POPUP_WIDTH}px`;}
      if(popupHeightRef.current===null) popupHeightRef.current=card?.offsetHeight || popup.getBoundingClientRect().height/(popupFactor*live);
      const height=popupHeightRef.current*popupFactor;
      const gap=POPUP_GAP*factor;
      let direction=placementRef.current?.direction || directionRef.current;
      if(!placementRef.current) {
        const above=r.top-(iconSize+gap+height)*live-iconTop;
        const below=iconBottom-r.bottom-(iconSize+gap+height)*live;
        direction=above>=0 || above>=below ? 'above':'below';
      }
      if(showPopup && !placementRef.current) {
        const requested=r.right+(iconSize/2-cardWidth)*live;
        const initialX=cardWidth*live<=iconRight-iconLeft?Math.max(iconLeft,Math.min(iconRight-cardWidth*live,requested)):requested;
        placementRef.current={direction,offsetX:(initialX-requested)/(factor*live)};
      }
      directionRef.current=direction;
      const geometry=pageNoteGeometry({x:parseFloat(anchor.style.left)||0,y:parseFloat(anchor.style.top)||0,
        width:parseFloat(anchor.style.width)||0,height:parseFloat(anchor.style.height)||0,rise:Number(anchor.dataset.highlightRise || 0)},
        factor,direction==='above',height,cardWidth,placementRef.current?.offsetX || 0);
      Object.assign(icon.style,pointStyle(geometry.icon));
      icon.style.visibility='visible';icon.dataset.popupDirection=direction;
      Object.assign(popup.style,pointStyle(geometry.popup));
      popup.style.visibility=showPopup?'visible':'hidden';popup.dataset.popupDirection=direction;
      const bridge=bridgeRef.current;
      if(bridge) {
        Object.assign(bridge.style,pointStyle(geometry.bridge));
        bridge.style.width=sized(cardWidth);bridge.style.height=sized(gap);
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
    const root = rootRef.current;
    root?.addEventListener('wheel', wheel, { passive: false });
    let frame=0;
    const schedule=()=> {if(!frame) frame=requestAnimationFrame(()=>{frame=0;position();});};
    const resize = new ResizeObserver(schedule);

    const body=popupRef.current?.querySelector('[data-highlight-note-body]');
    if(body) resize.observe(body);
    const mutation = new MutationObserver(records => {
      if (records.some(record => record.type === 'childList' || record.type === 'characterData')) popupHeightRef.current = null;
      schedule();
    });
    const wrapper = anchor.closest('[data-scale]');
    if (wrapper) mutation.observe(wrapper, { attributes: true, attributeFilter: ['data-user-zoom'] });

    mutation.observe(anchor, { attributes: true, attributeFilter: ['style'] });
    if (popupRef.current) mutation.observe(popupRef.current, { childList: true, characterData: true, subtree: true });
    window.addEventListener('resize', schedule);
    position();
    return () => {
      positionRef.current = null;
      viewport?.removeEventListener('pdf-zoom-end', position);
      root?.removeEventListener('wheel', wheel);
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [anchorId, scopeId, mode, showPopup,portalTarget]);

  // React commits the final page dimensions before paint. Rebase HTML zoom in
  // that same commit rather than leaving one frame with the old live ratio.
  useLayoutEffect(() => { positionRef.current?.(); });

  return portalTarget ? createPortal(
    <div ref={rootRef} data-highlight-note-overlay={highlightId} data-highlight-note-owner={owner} data-highlight-note-open={showPopup} className="absolute inset-0 pointer-events-none z-[90000]" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <button ref={iconRef} type="button" data-highlight-note-icon={highlightId}
        className="absolute bg-[#f5c41a] hover:bg-[#e5a84c] text-neutral-950 rounded-full shadow-md flex items-center justify-center border-2 border-white cursor-pointer pointer-events-auto z-[90000]"
        style={{ left: 0, top: 0, visibility: 'hidden', width: ICON_SIZE, height: ICON_SIZE, minWidth: ICON_SIZE, minHeight: ICON_SIZE, maxWidth: ICON_SIZE, maxHeight: ICON_SIZE, boxSizing: 'border-box', flexShrink: 0, transform: 'none', zoom: 1 }} title="Xem/Sửa ghi chú"
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onEdit(); }}
        onDoubleClick={e => { e.stopPropagation(); e.preventDefault(); onEdit(); }}
        onContextMenu={e => { e.stopPropagation(); e.preventDefault(); onEdit(); }}>
        <MessageSquare size={ICON_GLYPH_SIZE} style={{ width: ICON_GLYPH_SIZE, height: ICON_GLYPH_SIZE, flexShrink: 0 }} className="fill-neutral-950 stroke-neutral-950" />
      </button>
      {<>
        <div ref={bridgeRef} className="absolute z-[90000]" style={{ visibility: 'hidden', pointerEvents: mode === 'auto' ? 'auto' : 'none' }} />
        <div ref={popupRef} data-highlight-note-popup-frame={highlightId} className="absolute rounded-xl z-[90001]" style={{ left: 0, top: 0, visibility: 'hidden', pointerEvents: mode === 'transparent' ? 'none' : 'auto' }}>
          {children}
        </div>
      </>}
    </div>, portalTarget
  ) : null;
}
