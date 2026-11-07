import React, { forwardRef, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface AnnotationToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  anchorId: string;
  preferredAbove?: boolean;
}

// Tool UI lives in screen coordinates; the annotation remains in page coordinates.
export const AnnotationToolbar = forwardRef<HTMLDivElement, AnnotationToolbarProps>(
  ({ anchorId, preferredAbove = true, children, className, ...props }, forwardedRef) => {
    const toolbarRef = useRef<HTMLDivElement | null>(null);
    useLayoutEffect(() => {
      const toolbar = toolbarRef.current;
      const anchor = document.getElementById(anchorId);
      if (!toolbar || !anchor) return;
      let frame = 0;
      const position = () => {
        frame = 0;
        const bounds = anchor.getBoundingClientRect();
        const viewport = anchor.closest('.pdf-viewport-container')?.getBoundingClientRect();
        const topLimit = Math.max(8, viewport?.top || 0, document.getElementById('app-header')?.getBoundingClientRect().bottom || 0) + 8;
        const bottomLimit = Math.min(window.innerHeight - 8, viewport?.bottom || window.innerHeight, document.getElementById('bottom-toolbar-dock')?.getBoundingClientRect().top || window.innerHeight) - 8;
        toolbar.style.maxWidth = `${Math.max(1, window.innerWidth - 16)}px`;
        const size = toolbar.getBoundingClientRect();
        const left = Math.max(8, Math.min(window.innerWidth - size.width - 8, (bounds.left + bounds.right - size.width) / 2));
        let above = preferredAbove;
        if (above && bounds.top - size.height - 10 < topLimit && bounds.bottom + size.height + 10 <= bottomLimit) above = false;
        if (!above && bounds.bottom + size.height + 10 > bottomLimit && bounds.top - size.height - 10 >= topLimit) above = true;
        const top = Math.max(topLimit, Math.min(bottomLimit - size.height, above ? bounds.top - size.height - 10 : bounds.bottom + 10));
        toolbar.style.left = `${left}px`;
        toolbar.style.top = `${top}px`;
        toolbar.style.visibility = bounds.bottom <= topLimit || bounds.top >= bottomLimit || bounds.right <= Math.max(0, viewport?.left || 0) || bounds.left >= Math.min(window.innerWidth, viewport?.right || window.innerWidth) ? 'hidden' : 'visible';
      };
      const schedule = () => { if (!frame) frame = requestAnimationFrame(position); };
      const resize = new ResizeObserver(schedule);
      resize.observe(anchor);
      resize.observe(toolbar);
      const mutation = new MutationObserver(schedule);
      const wrapper = anchor.closest('[data-scale]');
      if (wrapper) mutation.observe(wrapper, { attributes: true, attributeFilter: ['style', 'data-scale'] });
      mutation.observe(anchor, { attributes: true, attributeFilter: ['style'] });
      window.addEventListener('scroll', schedule, true);
      window.addEventListener('resize', schedule);
      position();
      return () => {
        cancelAnimationFrame(frame);
        resize.disconnect();
        mutation.disconnect();
        window.removeEventListener('scroll', schedule, true);
        window.removeEventListener('resize', schedule);
      };
    }, [anchorId, preferredAbove]);

    return createPortal(
      <div {...props} ref={node => {
        toolbarRef.current = node;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }} className={className} style={{ position: 'fixed', zIndex: 90000, left: 0, top: 0, visibility: 'hidden', width: 'max-content', flexWrap: 'wrap' }}>
        {children}
      </div>, document.body
    );
  }
);
