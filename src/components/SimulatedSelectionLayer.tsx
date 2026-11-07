import React, { useRef, useState, useEffect } from 'react';
import { HighlightAnnotation, NormalizedRect, HighlightColor } from '../types';

interface SimulatedSelectionLayerProps {
  pageNumber: number;
  scale: number;
  isActive: boolean;
  highlightColor: HighlightColor;
  onAddHighlight: (highlight: HighlightAnnotation) => void;
}

interface PendingBox {
  rects: { minX: number; maxX: number; y: number; width: number; lineHeight: number }[];
  normalizedRects: NormalizedRect[];
}

export const SimulatedSelectionLayer: React.FC<SimulatedSelectionLayerProps> = ({
  pageNumber,
  scale,
  isActive,
  highlightColor,
  onAddHighlight,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(null);
  const [pendingSelection, setPendingSelection] = useState<PendingBox | null>(null);
  const lastRightClickTimeRef = useRef<number>(0);

  // Constants for simulated line height
  const BASE_LINE_HEIGHT = 20;

  useEffect(() => {
    if (!isActive) {
      setStartPos(null);
      setCurrentPos(null);
      setIsDragging(false);
      setPendingSelection(null);
    }
  }, [isActive]);

  // Global listener: if user clicks left mouse anywhere, dismiss pending selection immediately
  useEffect(() => {
    const handleGlobalMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // Only for left click
      // If clicking outside the active double-click action, dismiss immediately
      setPendingSelection(null);
    };

    window.addEventListener('mousedown', handleGlobalMouseDown, { capture: true });
    return () => {
      window.removeEventListener('mousedown', handleGlobalMouseDown, { capture: true });
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isActive || e.button !== 0) return;

    // Immediately dismiss any existing pending selection on new click
    setPendingSelection(null);

    // Ignore clicks on existing annotations or interactive elements
    const el = e.target instanceof Element ? e.target : (e.target as Node | null)?.parentElement;
    if (el?.closest?.('.annotation-interactive-element, button, .sticky-note-paper, .stroke-interactive-group, .stroke-vector-group, .box-interactive-element, .free-text-item-container, .box-floating-toolbar, .unified-group-toolbar, .floating-submenu')) {
      return;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setStartPos({ x, y });
    setCurrentPos({ x, y });
    setIsDragging(false);
  };

  const getSelectionRects = (p1: {x: number, y: number}, p2: {x: number, y: number}, rectWidth: number, rectHeight: number) => {
    const lineHeight = BASE_LINE_HEIGHT * scale;
    const startY = Math.min(p1.y, p2.y);
    const endY = Math.max(p1.y, p2.y);
    
    // Strict A-B horizontal width locking:
    // Start X (A) and End X (B) determine the exact horizontal range [minX, maxX]
    const minX = Math.min(p1.x, p2.x);
    const maxX = Math.max(p1.x, p2.x);
    const lockedWidth = Math.max(0, maxX - minX);

    if (lockedWidth <= 2) return [];

    // Calculate how many lines we are spanning vertically
    const numLines = Math.max(1, Math.round((endY - startY) / lineHeight) + 1);
    const firstLineY = startY - lineHeight / 2;
    const totalHeight = Math.max(lineHeight, numLines * lineHeight);

    // Return a single unified block spanning the entire height seamlessly without horizontal seam lines
    return [{
      minX,
      maxX,
      width: lockedWidth,
      y: firstLineY,
      lineHeight: totalHeight,
    }];
  };

  // Robust window mousemove and mouseup listeners during dragging
  useEffect(() => {
    if (!startPos) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const dist = Math.hypot(x - startPos.x, y - startPos.y);
      if (dist > 3) {
        setIsDragging(true);
        setPendingSelection(null);
      }

      setCurrentPos({ x, y });
    };

    const handleWindowMouseUp = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        setIsDragging(false);
        setStartPos(null);
        setCurrentPos(null);
        return;
      }

      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;

      const dist = Math.hypot(endX - startPos.x, endY - startPos.y);
      if (dist > 8 && isDragging) {
        const rects = getSelectionRects(startPos, { x: endX, y: endY }, rect.width, rect.height);
        const normalizedRects = rects.map((r) => ({
          x: (r.minX / rect.width) * 100,
          y: (r.y / rect.height) * 100,
          width: (r.width / rect.width) * 100,
          height: (r.lineHeight / rect.height) * 100,
        }));

        setPendingSelection({
          rects,
          normalizedRects,
        });
      }

      setIsDragging(false);
      setStartPos(null);
      setCurrentPos(null);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [startPos, isDragging, scale]);

  const commitHighlight = () => {
    if (!pendingSelection) return;

    const colorToUse: HighlightColor = highlightColor || 'yellow';

    const newHighlight: HighlightAnnotation = {
      id: crypto.randomUUID(),
      pageNumber,
      text: '', // Simulated selection
      color: colorToUse,
      rects: pendingSelection.normalizedRects,
      createdAt: Date.now(),
    };

    onAddHighlight(newHighlight);
    setPendingSelection(null);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!pendingSelection) return;
    e.preventDefault();
    e.stopPropagation();

    const now = Date.now();
    if (now - lastRightClickTimeRef.current < 600) {
      commitHighlight();
      lastRightClickTimeRef.current = 0;
    } else {
      lastRightClickTimeRef.current = now;
    }
  };

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 select-none ${
        !isActive
          ? 'pointer-events-none z-20'
          : isDragging
          ? 'cursor-text pointer-events-auto z-30'
          : 'cursor-default pointer-events-auto z-20'
      }`}
      style={{
        transformStyle: 'preserve-3d',
        WebkitBackfaceVisibility: 'hidden',
        transform: 'translateZ(0px)',
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Live dragging rectangle */}
      {isDragging && startPos && currentPos && containerRef.current && (
        getSelectionRects(startPos, currentPos, containerRef.current.clientWidth, containerRef.current.clientHeight).map((r, i) => (
          <div 
            key={i}
            style={{
              position: 'absolute',
              left: `${r.minX}px`,
              top: `${r.y}px`,
              width: `${r.width}px`,
              height: `${r.lineHeight}px`,
              backgroundColor: 'rgba(59, 130, 246, 0.3)',
              pointerEvents: 'none',
              zIndex: 50,
            }}
          />
        ))
      )}

      {/* Pending simulated selection overlay */}
      {pendingSelection && !isDragging && (
        <div
          className="pending-simulated-selection absolute inset-0 cursor-pointer select-none"
          onContextMenu={handleContextMenu}
          onClick={(e) => {
            e.stopPropagation();
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            commitHighlight();
          }}
          title="Nhấp đúp chuột phải (hoặc đúp chuột trái) để lưu Highlight. Nhấp chuột trái ra ngoài để hủy."
        >
          {pendingSelection.rects.map((r, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${r.minX}px`,
                top: `${r.y}px`,
                width: `${r.width}px`,
                height: `${r.lineHeight}px`,
                backgroundColor: 'rgba(59, 130, 246, 0.35)',
                // REMOVED border to satisfy user request!
                zIndex: 45,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};
