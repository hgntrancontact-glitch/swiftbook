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
      const viewport = anchor.closest('.pdf-viewport-container')?.getBoundingClientRect();
      const top = Math.max(8, (viewport?.top || 0) + 4, (document.getElementById('app-header')?.getBoundingClientRect().bottom || 0) + 4);
      const bottom = Math.min(window.innerHeight - 8, (viewport?.bottom || window.innerHeight) - 4);
      const left = Math.max(8, (viewport?.left || 0) + 4);
      const right = Math.min(window.innerWidth - 8, (viewport?.right || window.innerWidth) - 4);
      const visible = r.bottom > top && r.top < bottom && r.right > left && r.left < right;
      const popup = popupRef.current;
      if (!popup) return;
      popup.style.width = `${Math.max(1, Math.min(256, right - left))}px`;
      // The hidden card stays mounted, so its natural size is known before
      // hover. The header never scrolls away; only the note body is constrained.
      const body = popup.querySelector<HTMLElement>('[data-highlight-note-body]');
      const header = popup.querySelector<HTMLElement>('[data-highlight-note-header]');
      const naturalHeight = body && header ? body.scrollHeight + header.getBoundingClientRect().height + 26 : popup.scrollHeight;
      const aboveIcon = r.top - 21;
      const belowIcon = r.bottom + 1;
      const aboveSpace = aboveIcon - 6 - top;
      const belowSpace = bottom - belowIcon - 20 - 6;
      let direction = directionRef.current;
      const currentSpace = direction === 'above' ? aboveSpace : belowSpace;
      const otherSpace = direction === 'above' ? belowSpace : aboveSpace;
      if (naturalHeight > currentSpace && otherSpace >= naturalHeight) direction = direction === 'above' ? 'below' : 'above';
      else if (naturalHeight > aboveSpace && naturalHeight > belowSpace) direction = aboveSpace >= belowSpace ? 'above' : 'below';
      directionRef.current = direction;
      const space = direction === 'above' ? aboveSpace : belowSpace;
      const minimumHeight = Math.min(bottom - top, (header?.getBoundingClientRect().height || 28) + 40);
      const height = Math.max(minimumHeight, Math.min(naturalHeight, Math.max(0, space), bottom - top));
      popup.style.maxHeight = `${height}px`;
      popup.style.setProperty('--highlight-popup-height', `${height}px`);
      popup.style.overflow = 'hidden';
      const ix = Math.max(left, Math.min(right - 20, r.right - 10));
      const iy = Math.max(top, Math.min(bottom - 20, direction === 'above' ? aboveIcon : belowIcon));
      const x = Math.max(left, Math.min(right - popup.getBoundingClientRect().width, ix + 20 - popup.getBoundingClientRect().width));
      const y = Math.max(top, Math.min(bottom - height, direction === 'above' ? iy - 6 - height : iy + 26));
      icon.style.left = `${ix}px`;
      icon.style.top = `${iy}px`;
      icon.style.visibility = visible ? 'visible' : 'hidden';
      icon.dataset.popupDirection = direction;
      popup.style.left = `${x}px`;
      popup.style.top = `${y}px`;
      popup.style.visibility = showPopup && (visible || mode !== 'auto') ? 'visible' : 'hidden';
      const bridge = bridgeRef.current;
      if (bridge) {
        bridge.style.left = `${x}px`;
        bridge.style.top = `${direction === 'above' ? y + height : iy + 20}px`;
        bridge.style.width = `${popup.getBoundingClientRect().width}px`;
        bridge.style.height = '6px';
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
    const resize = new ResizeObserver(position);
    resize.observe(anchor);
    if (popupRef.current) {
      resize.observe(popupRef.current);
      const body = popupRef.current.querySelector('[data-highlight-note-body]');
      if (body) resize.observe(body);
    }
    const mutation = new MutationObserver(position);
    const wrapper = anchor.closest('[data-scale]');
    if (wrapper) mutation.observe(wrapper, { attributes: true, attributeFilter: ['style', 'data-scale'] });
    mutation.observe(anchor, { attributes: true, attributeFilter: ['style'] });
    if (popupRef.current) mutation.observe(popupRef.current, { childList: true, characterData: true, subtree: true });
    window.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);
    position();
    return () => {
      root?.removeEventListener('wheel', wheel);
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener('scroll', position, true);
      window.removeEventListener('resize', position);
    };
  }, [anchorId, scopeId, mode, showPopup]);

  return createPortal(
    <div ref={rootRef} data-highlight-note-overlay={highlightId} data-highlight-note-owner={owner} className="pointer-events-none" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <button ref={iconRef} type="button" data-highlight-note-icon={highlightId}
        className="fixed bg-[#f5c41a] hover:bg-[#e5a84c] text-neutral-950 rounded-full shadow-md flex items-center justify-center border-2 border-white cursor-pointer pointer-events-auto z-[90000]"
        style={{ left: 0, top: 0, visibility: 'hidden', width: '20px', height: '20px', minWidth: '20px', minHeight: '20px', maxWidth: '20px', maxHeight: '20px', boxSizing: 'border-box', flexShrink: 0, transform: 'none', zoom: 1 }} title="Xem/Sửa ghi chú"
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
