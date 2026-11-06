import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  disabled?: boolean;
  side?: 'top' | 'bottom';
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  disabled = false,
  side = 'bottom',
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const isHoveredRef = useRef(false);

  // If disabled becomes true while visible, immediately hide
  useEffect(() => {
    if (disabled) {
      setIsVisible(false);
      setCoords(null);
    }
  }, [disabled]);

  // Handle position calculation with boundary detection (Requirement 4)
  useLayoutEffect(() => {
    if (!isVisible || disabled || !triggerRef.current || !tooltipRef.current) {
      return;
    }

    const updatePosition = () => {
      if (!triggerRef.current || !tooltipRef.current) return;

      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();

      const tooltipWidth = tooltipRect.width;
      const tooltipHeight = tooltipRect.height;

      // Center horizontally relative to the trigger element
      const triggerCenter = triggerRect.left + triggerRect.width / 2;
      let left = triggerCenter - tooltipWidth / 2;

      // Smart Boundary Detection (Requirement 4):
      // Keep at least 8px padding from both left and right edges of window
      const minLeft = 8;
      const maxLeft = window.innerWidth - tooltipWidth - 8;

      if (left < minLeft) {
        left = minLeft;
      } else if (left > maxLeft) {
        left = Math.max(minLeft, maxLeft);
      }

      // Vertical positioning
      let top = 0;
      if (side === 'top') {
        top = triggerRect.top - tooltipHeight - 6;
        if (top < 8) {
          // If overflows top, place bottom
          top = triggerRect.bottom + 6;
        }
      } else {
        // default 'bottom'
        top = triggerRect.bottom + 6;
        if (top + tooltipHeight > window.innerHeight - 8) {
          // If overflows bottom, place top
          top = triggerRect.top - tooltipHeight - 6;
        }
      }

      setCoords({ top, left });
    };

    updatePosition();

    // Hide or update on window scroll or resize
    const handleScrollOrResize = () => {
      setIsVisible(false);
      setCoords(null);
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isVisible, disabled, side, content]);

  const handleMouseEnter = (e: React.MouseEvent) => {
    isHoveredRef.current = true;
    if (disabled || !content) return;
    setIsVisible(true);
  };

  const handleMouseLeave = (e: React.MouseEvent) => {
    isHoveredRef.current = false;
    setIsVisible(false);
    setCoords(null);
  };

  const handleMouseDownOrClick = (e: React.MouseEvent) => {
    // Requirement 2: Immediately hide on click / mousedown
    setIsVisible(false);
    setCoords(null);
  };

  // Attach ref and event handlers to the single child
  const triggerElement = (React.cloneElement as any)(children, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      const originalRef = (children as any).ref;
      if (typeof originalRef === 'function') {
        originalRef(node);
      } else if (originalRef && 'current' in originalRef) {
        originalRef.current = node;
      }
    },
    onMouseEnter: (e: React.MouseEvent) => {
      (children.props as any).onMouseEnter?.(e);
      handleMouseEnter(e);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      (children.props as any).onMouseLeave?.(e);
      handleMouseLeave(e);
    },
    onMouseDown: (e: React.MouseEvent) => {
      (children.props as any).onMouseDown?.(e);
      handleMouseDownOrClick(e);
    },
    onClick: (e: React.MouseEvent) => {
      (children.props as any).onClick?.(e);
      handleMouseDownOrClick(e);
    },
  });

  return (
    <>
      {triggerElement}
      {isVisible &&
        !disabled &&
        content &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            style={{
              position: 'fixed',
              top: coords ? `${coords.top}px` : '-9999px',
              left: coords ? `${coords.left}px` : '-9999px',
              opacity: coords ? 1 : 0,
            }}
            className={`z-[9999999] pointer-events-none whitespace-nowrap select-none bg-neutral-900 text-white text-[11px] font-medium px-2 py-1 rounded shadow-lg border border-neutral-700/60 transition-opacity duration-100 ease-out font-['Inter',sans-serif] ${className}`}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
};
