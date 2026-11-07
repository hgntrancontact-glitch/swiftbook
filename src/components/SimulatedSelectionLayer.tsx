import React, { useRef, useState, useEffect } from 'react';
import { beginLineGesture, loadSelectionLines, rasterSelectionLines, moveLineGesture, type LineGesture, type SelectionLine } from '../utils/selectionLines';
import { HighlightAnnotation, NormalizedRect, HighlightColor } from '../types';

interface SimulatedSelectionLayerProps {
  pdfDoc: any;
  isNearViewport: boolean;
  pageNumber: number;
  scale: number;
  isActive: boolean;
  highlightColor: HighlightColor;
  onAddHighlight: (highlight: HighlightAnnotation) => void;
}

interface PendingBox { rects: NormalizedRect[] }

export const SimulatedSelectionLayer: React.FC<SimulatedSelectionLayerProps> = ({
  pdfDoc,
  isNearViewport,
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

  const linesRef = useRef<SelectionLine[]>([]);
  const loadedPageRef = useRef<{ doc: any; page: number } | null>(null);
  const gestureRef = useRef<LineGesture | null>(null);
  const draggedRef = useRef(false);
  const inputRef = useRef({ pdfDoc, pageNumber });
  inputRef.current = { pdfDoc, pageNumber };
  const prepareLines = () => {
    if (!isActive || !isNearViewport || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const viewport = containerRef.current.closest('.pdf-viewport-container')?.getBoundingClientRect();
    if (viewport && (rect.bottom <= viewport.top || rect.top >= viewport.bottom || rect.right <= viewport.left || rect.left >= viewport.right)) return;
    loadSelectionLines(pdfDoc, pageNumber).then(lines => {
      if (inputRef.current.pdfDoc !== pdfDoc || inputRef.current.pageNumber !== pageNumber) return;
      linesRef.current = lines; loadedPageRef.current = { doc: pdfDoc, page: pageNumber };
    });
  };
  useEffect(() => { prepareLines(); }, [pdfDoc, pageNumber, isActive, isNearViewport]);

  useEffect(() => {
    if (!isActive) {
      setStartPos(null);
      setCurrentPos(null);
      setIsDragging(false);
      setPendingSelection(null);
    }
  }, [isActive]);

  useEffect(() => {
    setStartPos(null); setCurrentPos(null); setPendingSelection(null); setIsDragging(false);
    gestureRef.current = null;
  }, [pdfDoc, pageNumber]);

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

    prepareLines();
    // Immediately dismiss any existing pending selection on new click
    setPendingSelection(null);

    // Ignore clicks on existing annotations or interactive elements
    const el = e.target instanceof Element ? e.target : (e.target as Node | null)?.parentElement;
    if (el?.closest?.('.annotation-interactive-element, button, .sticky-note-paper, .stroke-interactive-group, .stroke-vector-group, .box-interactive-element, .free-text-item-container, .box-floating-toolbar, .unified-group-toolbar, .floating-submenu')) {
      return;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const fallbackHeight = 20 * scale / Math.max(1, containerRef.current!.clientHeight);
    const page = containerRef.current!.closest('[data-page-container="true"]');
    const canvas = [...(page?.querySelectorAll<HTMLCanvasElement>('canvas[data-rendered-scale]') || [])].find(canvas => getComputedStyle(canvas).visibility !== 'hidden' && getComputedStyle(canvas).opacity !== '0');
    const matchingLines = loadedPageRef.current?.doc === pdfDoc && loadedPageRef.current.page === pageNumber ? linesRef.current : [];
    const lines = matchingLines.length ? matchingLines : rasterSelectionLines(canvas, x, y, fallbackHeight);
    gestureRef.current = beginLineGesture(lines, x, y, fallbackHeight);
    draggedRef.current = false;

    setStartPos({ x, y });
    setCurrentPos({ x, y });
    setIsDragging(false);
  };

  const getSelectionRects = (p1: { x: number; y: number }, p2: { x: number; y: number }): NormalizedRect[] => {
    const gesture = gestureRef.current;
    if (!gesture || !containerRef.current) return [];
    const x = Math.max(0, Math.min(p1.x, p2.x));
    const right = Math.min(1, Math.max(p1.x, p2.x));
    if ((right - x) * containerRef.current.clientWidth <= 2) return [];
    const a = gesture.lines[gesture.start], b = gesture.lines[gesture.current];
    const y = Math.max(0, Math.min(a.y, b.y));
    const bottom = Math.min(1, Math.max(a.y + a.height, b.y + b.height));
    return [{ x: x * 100, y: y * 100, width: (right - x) * 100, height: (bottom - y) * 100 }];
  };

  // Robust window mousemove and mouseup listeners during dragging
  useEffect(() => {
    if (!startPos) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      if (gestureRef.current) moveLineGesture(gestureRef.current, y);
      const dist = Math.hypot((x - startPos.x) * rect.width, (y - startPos.y) * rect.height);
      if (dist > 3) {
        draggedRef.current = true;
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

      const endX = (e.clientX - rect.left) / rect.width;
      const endY = (e.clientY - rect.top) / rect.height;
      if (gestureRef.current) moveLineGesture(gestureRef.current, endY);
      const dist = Math.hypot((endX - startPos.x) * rect.width, (endY - startPos.y) * rect.height);
      if (dist > 8 && draggedRef.current) {
        setPendingSelection({ rects: getSelectionRects(startPos, { x: endX, y: endY }) });
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
  }, [startPos]);

  const commitHighlight = () => {
    if (!pendingSelection) return;

    const colorToUse: HighlightColor = highlightColor || 'yellow';

    const newHighlight: HighlightAnnotation = {
      id: crypto.randomUUID(),
      pageNumber,
      text: '', // Simulated selection
      color: colorToUse,
      rects: pendingSelection.rects,
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
      onMouseEnter={prepareLines}
      onMouseDown={handleMouseDown}
    >
      {/* Live dragging rectangle */}
      {isDragging && startPos && currentPos && containerRef.current && (
        getSelectionRects(startPos, currentPos).map((r, i) => (
          <div 
            key={i}
            data-selection-preview="live"
            style={{
              position: 'absolute',
              left: `${r.x}%`,
              top: `${r.y}%`,
              width: `${r.width}%`,
              height: `${r.height}%`,
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
              data-selection-preview="pending"
              style={{
                position: 'absolute',
                left: `${r.x}%`,
                top: `${r.y}%`,
                width: `${r.width}%`,
                height: `${r.height}%`,
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
