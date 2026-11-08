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

// Baseline screen dimensions at 100%; bounded, gentle scaling never inverts zoom.
const ICON_SIZE = 20;
const ICON_GAP = 1;
const POPUP_WIDTH = 256;
const POPUP_GAP = 6;

// The anchor stays in page space. The icon and readable popup use screen pixels.
export function HighlightNoteOverlay({ anchorId, scopeId, owner, highlightId, mode, showPopup, onEnter, onLeave, onEdit, children }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef<HTMLDivElement>(null);
  const directionRef = useRef<'above' | 'below'>('above');
  useLayoutEffect(() => {
    const scope = document.getElementById(scopeId)?.closest('[data-page-container="true"]') || document;
    const anchor = scope.querySelector<HTMLElement>(`#${CSS.escape(anchorId)}`);
    const icon = iconRef.current;
    if (!anchor || !icon) return;
    const position = () => {
      const r = anchor.getBoundingClientRect();
      const wrapper = anchor.closest<HTMLElement>('[data-user-zoom]');
      const page=anchor.closest<HTMLElement>('[data-page-container="true"]');
      const layoutWidth=page ? parseFloat(page.style.width) : 0;
      const liveRatio=page && layoutWidth ? page.getBoundingClientRect().width/layoutWidth : 1;
      const userZoom = Number(wrapper?.dataset.userZoom || 1) * liveRatio;
      const factor = 1 + 0.08 * Math.tanh(Math.log(Math.max(0.2, Math.min(50,userZoom))));
      const iconSize = ICON_SIZE * factor;
      if(rootRef.current) rootRef.current.dataset.highlightNoteScale=String(factor);
      icon.style.width = icon.style.height = icon.style.minWidth = icon.style.minHeight = icon.style.maxWidth = icon.style.maxHeight = `${iconSize}px`;
      icon.style.borderWidth = `${2*factor}px`;
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
      const cardWidth = Math.max(1, Math.min(POPUP_WIDTH * factor, screenRight - screenLeft));
      let top = iconTop, bottom = iconBottom, left = iconLeft, right = iconRight;
      // A partly visible column may provide position bounds, but cannot change
      // the screen-sized card's width. Use the screen as the narrow-column fallback.
      if (right - left < cardWidth) { left = screenLeft; right = screenRight; }
      if (bottom - top < iconSize + POPUP_GAP + 40) { top = screenTop; bottom = screenBottom; }
      popup.style.width = `${cardWidth}px`;
      const card = popup.firstElementChild as HTMLElement | null;
      if (card) { card.style.zoom = String(factor); card.style.width = `${cardWidth/factor}px`; }
      // The hidden card stays mounted, so its natural size is known before
      // hover. The header never scrolls away; only the note body is constrained.
      const body = popup.querySelector<HTMLElement>('[data-highlight-note-body]');
      const header = popup.querySelector<HTMLElement>('[data-highlight-note-header]');
      const naturalHeight = body && header ? (body.scrollHeight + 26) * factor + header.getBoundingClientRect().height : popup.scrollHeight;
      const aboveIcon = r.top - iconSize - ICON_GAP;
      const belowIcon = r.bottom + ICON_GAP;
      const aboveSpace = aboveIcon - POPUP_GAP - top;
      const belowSpace = bottom - belowIcon - iconSize - POPUP_GAP;
      let direction = directionRef.current;
      const currentSpace = direction === 'above' ? aboveSpace : belowSpace;
      const otherSpace = direction === 'above' ? belowSpace : aboveSpace;
      if (naturalHeight > currentSpace && otherSpace >= naturalHeight) direction = direction === 'above' ? 'below' : 'above';
      else if (naturalHeight > aboveSpace && naturalHeight > belowSpace && otherSpace > currentSpace + iconSize) direction = direction === 'above' ? 'below' : 'above';
      directionRef.current = direction;
      const minimumHeight = Math.min(bottom - top, (header?.getBoundingClientRect().height || 28) + 40);
      // Zoom changes the anchor's height and the gaps on either side, not
      // the card's size. If neither side fits, clamp its position inside the
      // viewport; constrain the body only when the viewport itself is too short.
      const height = Math.max(minimumHeight, Math.min(naturalHeight, bottom - top));
      popup.style.maxHeight = `${height}px`;
      popup.style.setProperty('--highlight-popup-height', `${height / factor}px`);
      popup.style.overflow = 'hidden';
      const ix = Math.max(screenLeft, Math.min(screenRight - iconSize, Math.max(iconLeft, Math.min(iconRight - iconSize, r.right - iconSize / 2))));
      const iy = Math.max(screenTop, Math.min(screenBottom - iconSize, Math.max(iconTop, Math.min(iconBottom - iconSize, direction === 'above' ? aboveIcon : belowIcon))));
      const popupWidth = popup.getBoundingClientRect().width;
      let x = Math.max(left, Math.min(right - popupWidth, ix + iconSize - popupWidth));
      const y = Math.max(top, Math.min(bottom - height, direction === 'above' ? iy - POPUP_GAP - height : iy + iconSize + POPUP_GAP));
      // In the viewport-clamped fallback, keep the card beside the icon if
      // necessary instead of covering the trigger with the larger card.
      if (y < iy + iconSize && y + height > iy) {
        if (ix - POPUP_GAP - popupWidth >= left) x = ix - POPUP_GAP - popupWidth;
        else if (ix + iconSize + POPUP_GAP + popupWidth <= right) x = ix + iconSize + POPUP_GAP;
      }
      icon.style.left = `${ix}px`;
      icon.style.top = `${iy}px`;
      icon.style.visibility = visible ? 'visible' : 'hidden';
      icon.dataset.popupDirection = direction;
      popup.style.left = `${x}px`;
      popup.style.top = `${y}px`;
      popup.style.visibility = showPopup && (visible || mode !== 'auto') ? 'visible' : 'hidden';
      const bridge = bridgeRef.current;
      if (bridge) {
        const beside = y < iy + iconSize && y + height > iy && (x + popupWidth <= ix || x >= ix + iconSize);
        if (beside) {
          const edge = x + popupWidth <= ix ? x + popupWidth : ix + iconSize;
          bridge.style.left = `${edge}px`;
          bridge.style.top = `${Math.max(y, iy)}px`;
          bridge.style.width = `${Math.max(0, x + popupWidth <= ix ? ix - edge : x - edge)}px`;
          bridge.style.height = `${Math.max(0, Math.min(y + height, iy + iconSize) - Math.max(y, iy))}px`;
        } else {
          bridge.style.left = `${x}px`;
          bridge.style.top = `${direction === 'above' ? y + height : iy + iconSize}px`;
          bridge.style.width = `${popupWidth}px`;
          bridge.style.height = `${Math.max(0, direction === 'above' ? iy - y - height : y - iy - iconSize)}px`;
        }
        bridge.style.visibility = showPopup && visible ? 'visible' : 'hidden';
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
        <div ref={popupRef} data-highlight-note-popup-frame={highlightId} className={`fixed rounded-xl z-[90001] ${mode === 'transparent' ? 'shadow-md' : 'shadow-2xl'}`} style={{ left: 0, top: 0, visibility: 'hidden', pointerEvents: mode === 'transparent' ? 'none' : 'auto' }}>
          {children}
        </div>
      </>}
    </div>, document.body
  );
}
