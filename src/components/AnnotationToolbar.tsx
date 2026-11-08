import { routeAnnotationWheel } from '../utils/annotationWheel';
import React, { forwardRef, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface AnnotationToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  anchorId: string;
  anchorIds?: string[];
  scopeId?: string;
  preserveAnchorGap?: boolean;
  preferredAbove?: boolean;
  align?: 'left' | 'center';
}

// Tool UI lives in screen coordinates; the annotation remains in page coordinates.
export const AnnotationToolbar = forwardRef<HTMLDivElement, AnnotationToolbarProps>(
  ({ anchorId, anchorIds, scopeId, preserveAnchorGap = false, preferredAbove = true, align = 'center', children, className, style, ...props }, forwardedRef) => {
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
        toolbar.style.maxWidth = `${Math.max(1, window.innerWidth - 16)}px`;
        toolbar.style.maxHeight = '';
        toolbar.style.overflowY = '';
        let size = toolbar.getBoundingClientRect();
        const leftLimit = align === 'left' ? Math.max(8, (viewport?.left || 0) + 8) : 8;
        const rightLimit = align === 'left' ? Math.min(window.innerWidth - 8, viewport?.right || window.innerWidth) : window.innerWidth - 8;
        const left = Math.max(leftLimit, Math.min(Math.max(leftLimit, rightLimit - size.width), align === 'left' ? bounds.left : (bounds.left + bounds.right - size.width) / 2));
        let above = preferredAbove;
        if (above && bounds.top - size.height - 10 < topLimit && bounds.bottom + size.height + 10 <= bottomLimit) above = false;
        if (!above && bounds.bottom + size.height + 10 > bottomLimit && bounds.top - size.height - 10 >= topLimit) above = true;
        if (preserveAnchorGap && bounds.top - size.height - 10 < topLimit && bounds.bottom + size.height + 10 > bottomLimit) {
          above = bounds.top - topLimit >= bottomLimit - bounds.bottom;
          const space = above ? bounds.top - topLimit - 10 : bottomLimit - bounds.bottom - 10;
          toolbar.style.maxHeight = `${Math.max(32, space)}px`;
          toolbar.style.overflowY = 'auto';
          size = toolbar.getBoundingClientRect();
        }
        const requestedTop = above ? bounds.top - size.height - 10 : bounds.bottom + 10;
        const top = preserveAnchorGap ? requestedTop : Math.max(topLimit, Math.min(bottomLimit - size.height, requestedTop));
        toolbar.style.left = `${left}px`;
        toolbar.style.top = `${top}px`;
        toolbar.style.visibility = bounds.bottom <= topLimit || bounds.top >= bottomLimit || bounds.right <= Math.max(0, viewport?.left || 0) || bounds.left >= Math.min(window.innerWidth, viewport?.right || window.innerWidth) ? 'hidden' : 'visible';
      };
      const schedule = () => { if (!frame) frame = requestAnimationFrame(position); };
      const update = preserveAnchorGap ? position : schedule;
      const viewport = anchor.closest<HTMLElement>('.pdf-viewport-container');
      const wheel = (event: WheelEvent) => { if (viewport) routeAnnotationWheel(event, viewport, toolbar); };
      if (preserveAnchorGap) toolbar.addEventListener('wheel', wheel, { passive: false });
      const resize = new ResizeObserver(update);
      anchors.forEach(el => resize.observe(el));
      resize.observe(toolbar);
      const mutation = new MutationObserver(update);
      const wrapper = anchor.closest('[data-scale]');
      if (wrapper) mutation.observe(wrapper, { attributes: true, attributeFilter: ['style', 'data-scale'] });
      anchors.forEach(el => mutation.observe(el, { attributes: true, attributeFilter: ['style'] }));
      window.addEventListener('scroll', update, true);
      window.addEventListener('resize', update);
      position();
      return () => {
        cancelAnimationFrame(frame);
        toolbar.removeEventListener('wheel', wheel);
        resize.disconnect();
        mutation.disconnect();
        window.removeEventListener('scroll', update, true);
        window.removeEventListener('resize', update);
      };
    }, [anchorId, anchorIds?.join('|'), scopeId, preserveAnchorGap, preferredAbove, align]);

    return createPortal(
      <div {...props} ref={node => {
        toolbarRef.current = node;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }} className={className} style={{ position: 'fixed', zIndex: 90000, left: 0, top: 0, visibility: 'hidden', width: style?.width || 'max-content', flexWrap: 'wrap' }}>
        {children}
      </div>, document.body
    );
  }
);
