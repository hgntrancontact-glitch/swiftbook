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
  useLayoutEffect(() => {
    const scope = document.getElementById(scopeId)?.closest('[data-page-container="true"]') || document;
    const anchor = scope.querySelector<HTMLElement>(`#${CSS.escape(anchorId)}`);
    const icon = iconRef.current;
    if (!anchor || !icon) return;
    const position = () => {
      const r = anchor.getBoundingClientRect();
      const viewport = anchor.closest('.pdf-viewport-container')?.getBoundingClientRect();
      const top = Math.max(8, viewport?.top || 0);
      const bottom = Math.min(window.innerHeight - 8, viewport?.bottom || window.innerHeight);
      const visible = r.bottom > top && r.top < bottom && r.right > Math.max(0, viewport?.left || 0) && r.left < Math.min(window.innerWidth, viewport?.right || window.innerWidth);
      const ix = r.right - 10;
      const iy = r.top - 14;
      icon.style.left = `${ix}px`;
      icon.style.top = `${iy}px`;
      icon.style.visibility = visible ? 'visible' : 'hidden';
      const popup = popupRef.current;
      if (!popup) return;
      popup.style.width = `${Math.min(256, window.innerWidth - 16)}px`;
      const safeTop = Math.max(8, (document.getElementById('app-header')?.getBoundingClientRect().bottom || 0) + 4);
      // Never flip below the icon or clamp the card over the highlighted text.
      // A near-edge note scrolls internally within the available space above.
      popup.style.maxHeight = `${Math.max(1, iy - 6 - safeTop)}px`;
      popup.style.overflowY = 'auto';
      const p = popup.getBoundingClientRect();
      const x = Math.max(8, Math.min(window.innerWidth - p.width - 8, ix + 20 - p.width));
      const y = iy - p.height - 6;
      popup.style.left = `${x}px`;
      popup.style.top = `${y}px`;
      popup.style.visibility = visible || mode !== 'auto' ? 'visible' : 'hidden';
      const bridge = bridgeRef.current;
      if (bridge) {
        bridge.style.left = `${x}px`;
        bridge.style.top = `${y + p.height}px`;
        bridge.style.width = `${p.width}px`;
        bridge.style.height = '6px';
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
    if (popupRef.current) resize.observe(popupRef.current);
    const mutation = new MutationObserver(position);
    const wrapper = anchor.closest('[data-scale]');
    if (wrapper) mutation.observe(wrapper, { attributes: true, attributeFilter: ['style', 'data-scale'] });
    mutation.observe(anchor, { attributes: true, attributeFilter: ['style'] });
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
      {showPopup && <>
        <div ref={bridgeRef} className="fixed z-[90000]" style={{ pointerEvents: mode === 'auto' ? 'auto' : 'none' }} />
        <div ref={popupRef} data-highlight-note-popup-frame={highlightId} className={`fixed rounded-xl z-[90001] ${mode === 'transparent' ? 'shadow-md' : 'shadow-2xl'}`} style={{ left: 0, top: 0, visibility: 'hidden', pointerEvents: mode === 'transparent' ? 'none' : 'auto' }}>
          {children}
        </div>
      </>}
    </div>, document.body
  );
}
