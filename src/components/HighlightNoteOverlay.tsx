import { routeAnnotationWheel } from '../utils/annotationWheel';
import { getAnnotationZoom, HIGHLIGHT_NOTE_SIZE } from '../utils/annotationUi';
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
    setPortalTarget(anchor?.closest<HTMLElement>('[data-page-container="true"]') || null);
  },[anchorId,scopeId]);
  useLayoutEffect(() => {
    const scope = document.getElementById(scopeId)?.closest('[data-page-container="true"]') || document;
    const anchor = scope.querySelector<HTMLElement>(`#${CSS.escape(anchorId)}`);
    const icon = iconRef.current;
    if (!anchor || !icon || !portalTarget) return;
    if (!showPopup) placementRef.current=null;
    const position = () => {
      const r = anchor.getBoundingClientRect();
      const slot=portalTarget.getBoundingClientRect();
      const layoutWidth = parseFloat(portalTarget.style.width) || slot.width;
      const live = slot.width / Math.max(1, layoutWidth);
      const root = rootRef.current;
      if (root) {
        root.style.width = portalTarget.style.width; root.style.height = portalTarget.style.height;
        root.style.zoom = String(live); root.style.transformOrigin = '0 0';
        root.style.transform = live === 1 ? '' : `scale(${1/live})`;
      }
      const factor = getAnnotationZoom(anchor);
      const iconSize = ICON_SIZE * factor;
      if(rootRef.current) rootRef.current.dataset.highlightNoteScale=String(factor);
      icon.style.width = icon.style.height = icon.style.minWidth = icon.style.minHeight = icon.style.maxWidth = icon.style.maxHeight = `${iconSize/live}px`;
      icon.style.borderWidth = `${2*factor/live}px`;
      icon.style.boxShadow=`0 ${2*factor}px ${4*factor}px rgba(0,0,0,.16)`;
      const glyph = icon.querySelector('svg');
      if (glyph) glyph.style.width = glyph.style.height = `${ICON_GLYPH_SIZE*factor/live}px`;
      const viewport = anchor.closest('.pdf-viewport-container')?.getBoundingClientRect();
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
      popup.style.width=`${cardWidth/live}px`;
      popup.style.maxHeight=`${420*popupFactor/live}px`;
      popup.style.setProperty('--highlight-popup-height','420px');
      popup.style.borderRadius=`${12*popupFactor/live}px`;
      popup.style.overflow='hidden';
      const card=popup.firstElementChild as HTMLElement | null;
      if(card) {card.style.zoom=String(popupFactor/live);card.style.width=`${POPUP_WIDTH}px`;}
      // Closed notes need only their icon; measuring every hidden card forces
      // synchronous layout for each annotation during every pinch frame.
      if (showPopup || popupHeightRef.current === null) popupHeightRef.current = popup.getBoundingClientRect().height / popupFactor;
      const height=popupHeightRef.current * popupFactor;
      const gap=POPUP_GAP*factor;
      let direction=placementRef.current?.direction || directionRef.current;
      if(!placementRef.current) {
        const above=r.top-iconSize-gap-height-iconTop;
        const below=iconBottom-r.bottom-iconSize-gap-height;
        direction=above>=0 || above>=below ? 'above':'below';
      }
      const ix=r.right-iconSize/2;
      // Overlap by the white rim plus a small part of the coloured disc.
      const rise=Number(anchor.dataset.highlightRise || 0)/Number(anchor.dataset.highlightHeight || 1)*r.height;
      const iy=direction==='above' ? r.top+Math.max(0,rise)-iconSize+5*factor : r.bottom-Math.max(0,-rise)-5*factor;
      if(showPopup && !placementRef.current) {
        const requested=ix+iconSize-cardWidth;
        const initialX=cardWidth<=iconRight-iconLeft ? Math.max(iconLeft,Math.min(iconRight-cardWidth,requested)) : requested;
        placementRef.current={direction,offsetX:(initialX-requested)/factor};
      }
      directionRef.current=direction;
      const x=ix+iconSize-cardWidth+(placementRef.current?.offsetX || 0)*factor;
      const y=direction==='above' ? iy-gap-height : iy+iconSize+gap;
      // Page-local coordinates let the browser scroll page and notes in the
      // same compositor layer. No scroll-event chase or viewport clamping.
      icon.style.left=`${(ix-slot.left)/live}px`;icon.style.top=`${(iy-slot.top)/live}px`;
      icon.style.visibility='visible';icon.dataset.popupDirection=direction;
      popup.style.left=`${(x-slot.left)/live}px`;popup.style.top=`${(y-slot.top)/live}px`;
      popup.style.visibility=showPopup ? 'visible':'hidden';
      popup.dataset.popupDirection=direction;
      const bridge=bridgeRef.current;
      if(bridge) {
        const by=direction==='above' ? y+height : iy+iconSize;
        bridge.style.left=`${(x-slot.left)/live}px`;bridge.style.top=`${(by-slot.top)/live}px`;
        bridge.style.width=`${cardWidth/live}px`;bridge.style.height=`${gap/live}px`;
        bridge.style.visibility=showPopup ? 'visible':'hidden';
      }
    };
    positionRef.current = position;
    // Keep wheel/pinch routing identical while hovering the note body.
    const viewport = anchor.closest<HTMLElement>('.pdf-viewport-container');
    const wheel = (event: WheelEvent) => {
      if (viewport) routeAnnotationWheel(event, viewport, popupRef.current);
    };
    const root = rootRef.current;
    root?.addEventListener('wheel', wheel, { passive: false });
    let frame=0;
    const schedule=()=> {if(!frame) frame=requestAnimationFrame(()=>{frame=0;position();});};
    const resize = new ResizeObserver(schedule);
    resize.observe(anchor);
    if (popupRef.current) {
      resize.observe(popupRef.current);
      const body = popupRef.current.querySelector('[data-highlight-note-body]');
      if (body) resize.observe(body);
    }
    const mutation = new MutationObserver(schedule);
    const wrapper = anchor.closest('[data-scale]');
    if (wrapper) mutation.observe(wrapper, { attributes: true, attributeFilter: ['style', 'data-scale', 'data-user-zoom'] });
    mutation.observe(portalTarget, { attributes: true, attributeFilter: ['style'] });
    mutation.observe(anchor, { attributes: true, attributeFilter: ['style'] });
    if (popupRef.current) mutation.observe(popupRef.current, { childList: true, characterData: true, subtree: true });
    window.addEventListener('resize', schedule);
    position();
    return () => {
      positionRef.current = null;
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
