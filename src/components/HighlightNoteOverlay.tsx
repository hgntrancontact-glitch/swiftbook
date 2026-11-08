import { routeAnnotationWheel } from '../utils/annotationWheel';
import React, { useLayoutEffect, useRef } from 'react';
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
const ICON_SIZE = 20;
const POPUP_WIDTH = 256;
const POPUP_GAP = 6;

// The portal uses client coordinates, with UI dimensions scaled by document zoom.
export function HighlightNoteOverlay({ anchorId, scopeId, owner, highlightId, mode, showPopup, onEnter, onLeave, onEdit, children }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef<HTMLDivElement>(null);
  const directionRef = useRef<'above' | 'below'>('above');
  const placementRef = useRef<{direction:'above'|'below';offsetX:number} | null>(null);
  useLayoutEffect(() => {
    const scope = document.getElementById(scopeId)?.closest('[data-page-container="true"]') || document;
    const anchor = scope.querySelector<HTMLElement>(`#${CSS.escape(anchorId)}`);
    const icon = iconRef.current;
    if (!anchor || !icon) return;
    if (!showPopup) placementRef.current=null;
    const position = () => {
      const r = anchor.getBoundingClientRect();
      const wrapper = anchor.closest<HTMLElement>('[data-user-zoom]');
      const page=anchor.closest<HTMLElement>('[data-page-container="true"]');
      const layoutWidth=page ? parseFloat(page.style.width) : 0;
      const liveRatio=page && layoutWidth ? page.getBoundingClientRect().width/layoutWidth : 1;
      const userZoom = Number(wrapper?.dataset.userZoom || 1) * liveRatio;
      const factor = Math.max(0.2,userZoom);
      const iconSize = ICON_SIZE * factor;
      if(rootRef.current) rootRef.current.dataset.highlightNoteScale=String(factor);
      icon.style.width = icon.style.height = icon.style.minWidth = icon.style.minHeight = icon.style.maxWidth = icon.style.maxHeight = `${iconSize}px`;
      icon.style.borderWidth = `${2*factor}px`;
      icon.style.boxShadow=`0 ${2*factor}px ${4*factor}px rgba(0,0,0,.16)`;
      const glyph = icon.querySelector('svg');
      if (glyph) glyph.style.width = glyph.style.height = `${10*factor}px`;
      const viewport = anchor.closest('.pdf-viewport-container')?.getBoundingClientRect();
      const popup = popupRef.current;
      if (!popup) return;
      const screenLeft = 8, screenRight = window.innerWidth - 8;
      const screenTop = Math.max(8, (document.getElementById('app-header')?.getBoundingClientRect().bottom || 0) + 4);
      const screenBottom = window.innerHeight - 8;
      const ownerVisible = !viewport || (viewport.width > 0 && viewport.height > 0 && viewport.right > screenLeft && viewport.left < screenRight && viewport.bottom > screenTop && viewport.top < screenBottom);
      if (!ownerVisible) {
        // An off-screen column must not squeeze a pinned card into a 1px strip.
        // Keep its metrics and pin state for when the owning document returns.
        icon.style.visibility = 'hidden';
        popup.style.visibility = 'hidden';
        if (bridgeRef.current) bridgeRef.current.style.visibility = 'hidden';
        return;
      }
      const iconTop = Math.max(screenTop, (viewport?.top || 0) + 4);
      const iconBottom = Math.min(screenBottom, (viewport?.bottom || window.innerHeight) - 4);
      const iconLeft = Math.max(screenLeft, (viewport?.left || 0) + 4);
      const iconRight = Math.min(screenRight, (viewport?.right || window.innerWidth) - 4);
      const visible = r.bottom > iconTop && r.top < iconBottom && r.right > iconLeft && r.left < iconRight;
      if(!visible && !showPopup) {
        icon.style.visibility='hidden';popup.style.visibility='hidden';
        if(bridgeRef.current) bridgeRef.current.style.visibility='hidden';
        return;
      }
      // Scale the entire card once. Its base width and maximum body height
      // are document-space values, not a viewport-dependent size negotiation.
      const cardWidth=POPUP_WIDTH*factor;
      popup.style.width=`${cardWidth}px`;
      popup.style.maxHeight=`${420*factor}px`;
      popup.style.setProperty('--highlight-popup-height','420px');
      popup.style.borderRadius=`${12*factor}px`;
      popup.style.overflow='hidden';
      const card=popup.firstElementChild as HTMLElement | null;
      if(card) {card.style.zoom=String(factor);card.style.width=`${POPUP_WIDTH}px`;}
      const height=popup.getBoundingClientRect().height;
      const gap=POPUP_GAP*factor;
      let direction=placementRef.current?.direction || directionRef.current;
      if(!placementRef.current) {
        const above=r.top-iconSize-gap-height-iconTop;
        const below=iconBottom-r.bottom-iconSize-gap-height;
        direction=above>=0 || above>=below ? 'above':'below';
      }
      const ix=r.right-iconSize/2;
      const iy=direction==='above' ? r.top-iconSize+2*factor : r.bottom-2*factor;
      if(showPopup && !placementRef.current) {
        const requested=ix+iconSize-cardWidth;
        const initialX=cardWidth<=iconRight-iconLeft ? Math.max(iconLeft,Math.min(iconRight-cardWidth,requested)) : requested;
        placementRef.current={direction,offsetX:(initialX-requested)/factor};
      }
      directionRef.current=direction;
      const x=ix+iconSize-cardWidth+(placementRef.current?.offsetX || 0)*factor;
      const y=direction==='above' ? iy-gap-height : iy+iconSize+gap;
      // Scrolling clips the anchored card exactly like page content. It never
      // flips sides or sticks to a screen edge just to remain visible.
      const clip=(element:HTMLElement,ex:number,ey:number,width:number,h:number)=> {
        element.style.clipPath=`inset(${Math.max(0,iconTop-ey)}px ${Math.max(0,ex+width-iconRight)}px ${Math.max(0,ey+h-iconBottom)}px ${Math.max(0,iconLeft-ex)}px)`;
      };
      icon.style.left=`${ix}px`;icon.style.top=`${iy}px`;
      icon.style.visibility='visible';icon.dataset.popupDirection=direction;
      clip(icon,ix,iy,iconSize,iconSize);
      popup.style.left=`${x}px`;popup.style.top=`${y}px`;
      popup.style.visibility=showPopup ? 'visible':'hidden';
      popup.dataset.popupDirection=direction;
      clip(popup,x,y,cardWidth,height);
      const bridge=bridgeRef.current;
      if(bridge) {
        const by=direction==='above' ? y+height : iy+iconSize;
        bridge.style.left=`${x}px`;bridge.style.top=`${by}px`;
        bridge.style.width=`${cardWidth}px`;bridge.style.height=`${gap}px`;
        bridge.style.visibility=showPopup ? 'visible':'hidden';
        clip(bridge,x,by,cardWidth,gap);
      }
    };
    // Portals are outside the PDF scroll tree. Route wheel/pinch back to the
    // owning viewport so hovering a pinned note never zooms the browser or
    // strands ordinary page scrolling on the body element.
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
    const mutation = new MutationObserver(position);
    const wrapper = anchor.closest('[data-scale]');
    if (wrapper) mutation.observe(wrapper, { attributes: true, attributeFilter: ['style', 'data-scale', 'data-user-zoom'] });
    mutation.observe(anchor, { attributes: true, attributeFilter: ['style'] });
    if (popupRef.current) mutation.observe(popupRef.current, { childList: true, characterData: true, subtree: true });
    window.addEventListener('scroll', position, true);
    window.addEventListener('resize', schedule);
    position();
    return () => {
      root?.removeEventListener('wheel', wheel);
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener('scroll', position, true);
      window.removeEventListener('resize', schedule);
    };
  }, [anchorId, scopeId, mode, showPopup]);

  return createPortal(
    <div ref={rootRef} data-highlight-note-overlay={highlightId} data-highlight-note-owner={owner} className="pointer-events-none" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <button ref={iconRef} type="button" data-highlight-note-icon={highlightId}
        className="fixed bg-[#f5c41a] hover:bg-[#e5a84c] text-neutral-950 rounded-full shadow-md flex items-center justify-center border-2 border-white cursor-pointer pointer-events-auto z-[90000]"
        style={{ left: 0, top: 0, visibility: 'hidden', width: ICON_SIZE, height: ICON_SIZE, minWidth: ICON_SIZE, minHeight: ICON_SIZE, maxWidth: ICON_SIZE, maxHeight: ICON_SIZE, boxSizing: 'border-box', flexShrink: 0, transform: 'none', zoom: 1 }} title="Xem/Sửa ghi chú"
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onEdit(); }}
        onDoubleClick={e => { e.stopPropagation(); e.preventDefault(); onEdit(); }}
        onContextMenu={e => { e.stopPropagation(); e.preventDefault(); onEdit(); }}>
        <MessageSquare size={10} style={{ width: '10px', height: '10px', flexShrink: 0 }} className="fill-neutral-950 stroke-neutral-950" />
      </button>
      {<>
        <div ref={bridgeRef} className="fixed z-[90000]" style={{ visibility: 'hidden', pointerEvents: mode === 'auto' ? 'auto' : 'none' }} />
        <div ref={popupRef} data-highlight-note-popup-frame={highlightId} className="fixed rounded-xl z-[90001]" style={{ left: 0, top: 0, visibility: 'hidden', pointerEvents: mode === 'transparent' ? 'none' : 'auto' }}>
          {children}
        </div>
      </>}
    </div>, document.body
  );
}
