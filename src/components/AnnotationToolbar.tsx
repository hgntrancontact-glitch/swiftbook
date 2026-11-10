import { routeAnnotationWheel } from '../utils/annotationWheel';
import { getAnnotationZoom, placeAnnotationToolbar } from '../utils/annotationUi';
import React, { forwardRef, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface AnnotationToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  anchorId: string;
  anchorIds?: string[];
  scopeId?: string;
  preserveAnchorGap?: boolean;
  preferredAbove?: boolean;
  align?: 'left' | 'center';
  scaleWithPage?: boolean;
  uiScale?: number;
}

// Tool UI lives in screen coordinates; the annotation remains in page coordinates.
export const AnnotationToolbar = forwardRef<HTMLDivElement, AnnotationToolbarProps>(
  ({ anchorId, anchorIds, scopeId, preserveAnchorGap = false, preferredAbove = true, align = 'center', scaleWithPage = false, uiScale = 1, children, className, style, ...props }, forwardedRef) => {
    const toolbarRef = useRef<HTMLDivElement | null>(null);
    useLayoutEffect(() => {
      const toolbar = toolbarRef.current;
      const scope = scopeId ? document.getElementById(scopeId)?.closest('[data-page-container="true"]') || document : document;
      const anchors = (anchorIds || [anchorId]).map(id => scope.querySelector<HTMLElement>(`#${CSS.escape(id)}`)).filter((el): el is HTMLElement => !!el);
      const anchor = anchors[0];
      if (!toolbar || !anchor) return;
      let frame = 0;
      const position = () => {
        frame = 0;
        const rects = anchors.map(el => el.getBoundingClientRect());
        const bounds = { left: Math.min(...rects.map(r => r.left)), right: Math.max(...rects.map(r => r.right)), top: Math.min(...rects.map(r => r.top)), bottom: Math.max(...rects.map(r => r.bottom)) };
        const viewport = anchor.closest('.pdf-viewport-container')?.getBoundingClientRect();
        const topLimit = Math.max(8, viewport?.top || 0, document.getElementById('app-header')?.getBoundingClientRect().bottom || 0) + 8;
        const bottomLimit = Math.min(window.innerHeight - 8, viewport?.bottom || window.innerHeight, document.getElementById('bottom-toolbar-dock')?.getBoundingClientRect().top || window.innerHeight) - 8;
        const scale = uiScale * (scaleWithPage ? getAnnotationZoom(anchor) : 1);
        // Native CSS zoom rasterizes text at its actual display size. A transform
        // kept a low-resolution text layer after the gesture finished.
        toolbar.style.transform = '';
        toolbar.style.zoom = String(scale);
        toolbar.dataset.annotationToolbarScale = String(scale);
        toolbar.style.maxWidth = `${Math.max(1, window.innerWidth - 16) / scale}px`;
        toolbar.style.maxHeight = '';
        toolbar.style.overflowY = '';
        const size = toolbar.getBoundingClientRect();
        const leftLimit = align === 'left' ? Math.max(8, (viewport?.left || 0) + 8) : 8;
        const rightLimit = align === 'left' ? Math.min(window.innerWidth - 8, viewport?.right || window.innerWidth) : window.innerWidth - 8;
        const placement = placeAnnotationToolbar(bounds, { width: size.width / scale, height: size.height / scale },
          { left: leftLimit, right: rightLimit, top: topLimit, bottom: bottomLimit }, scale, preferredAbove, preserveAnchorGap, align);
        if (placement.maxHeight !== undefined) {
          toolbar.style.maxHeight = `${placement.maxHeight}px`;
          toolbar.style.overflowY = 'auto';
        }
        toolbar.style.left = `${placement.left/scale}px`;
        toolbar.style.top = `${placement.top/scale}px`;
        toolbar.style.visibility = bounds.bottom <= topLimit || bounds.top >= bottomLimit || bounds.right <= Math.max(0, viewport?.left || 0) || bounds.left >= Math.min(window.innerWidth, viewport?.right || window.innerWidth) ? 'hidden' : 'visible';
      };
      const schedule = () => { if (!frame) frame = requestAnimationFrame(position); };
      const update = schedule;
      const viewport = anchor.closest<HTMLElement>('.pdf-viewport-container');
      const wheel = (event: WheelEvent) => { if (viewport) routeAnnotationWheel(event, viewport, toolbar); };
      if (preserveAnchorGap) toolbar.addEventListener('wheel', wheel, { passive: false });
      const resize = new ResizeObserver(update);
      anchors.forEach(el => resize.observe(el));
      resize.observe(toolbar);
      const mutation = new MutationObserver(update);
      const wrapper = anchor.closest('[data-scale]');
      if (wrapper) mutation.observe(wrapper, { attributes: true, attributeFilter: ['style', 'data-scale', 'data-user-zoom'] });
      const page = anchor.closest('[data-page-container="true"]');
      if (page) mutation.observe(page, { attributes: true, attributeFilter: ['style'] });
      anchors.forEach(el => mutation.observe(el, { attributes: true, attributeFilter: ['style'] }));
      viewport?.addEventListener('pdf-zoom-end', position);
      viewport?.addEventListener('pdf-viewport-pan', update);
      window.addEventListener('scroll', update, true);
      window.addEventListener('resize', update);
      position();
      return () => {
        cancelAnimationFrame(frame);
        toolbar.removeEventListener('wheel', wheel);
        viewport?.removeEventListener('pdf-zoom-end', position);
        viewport?.removeEventListener('pdf-viewport-pan', update);
        resize.disconnect();
        mutation.disconnect();
        window.removeEventListener('scroll', update, true);
        window.removeEventListener('resize', update);
      };
    }, [anchorId, anchorIds?.join('|'), scopeId, preserveAnchorGap, preferredAbove, align, scaleWithPage, uiScale]);

    return createPortal(
      <div {...props} ref={node => {
        toolbarRef.current = node;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }} className={className} style={{ position: 'fixed', zIndex: 90000, left: 0, top: 0, visibility: 'hidden', width: style?.width || 'max-content', flexWrap: 'wrap', transformOrigin: '0 0' }}>
        {children}
      </div>, document.body
    );
  }
);
