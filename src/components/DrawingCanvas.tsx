import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DrawingStroke, DrawingPoint } from '../types';
import { recognizeSmartShape, recognizeSmartShapeDetailed, recognizeSmartHighlight } from '../utils/shapeRecognizer';
import { findBestMatchingPage, elevatePageZIndex, resetPageZIndex } from '../utils/pageBoundaryHelper';

// Helper to identify strictly geometrical shapes with handles (Square, Rectangle, Circle, Oval, Triangle)
export const isGeometricalShape = (stroke: DrawingStroke | null | undefined): boolean => {
  if (!stroke) return false;
  if (stroke.isHighlighter) return false;
  if (!stroke.isSmartShape) return false;
  const t = stroke.shapeType;
  return (
    t === 'circle' ||
    t === 'ellipse' ||
    t === 'rectangle' ||
    t === 'square' ||
    t === 'triangle' ||
    t === 'parallelogram' ||
    t === 'trapezoid'
  );
};

// Distance from point to line segment helper (squared distance)
const distToSegmentSquared = (p: DrawingPoint, v: DrawingPoint, w: DrawingPoint) => {
  const l2 = (v.x - w.x) * (v.x - w.x) + (v.y - w.y) * (v.y - w.y);
  if (l2 === 0) return (p.x - v.x) * (p.x - v.x) + (p.y - v.y) * (p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = v.x + t * (w.x - v.x);
  const projY = v.y + t * (w.y - v.y);
  return (p.x - projX) * (p.x - projX) + (p.y - projY) * (p.y - projY);
};

export const isPointTouchingStrokeHelper = (
  pt: DrawingPoint,
  stroke: DrawingStroke,
  pageWidth: number,
  pageHeight: number,
  extraTolerancePx: number = 0
): boolean => {
  if (!stroke.points || stroke.points.length === 0) return false;
  const maxDim = Math.max(1, Math.max(pageWidth, pageHeight));
  const strokeRadiusNorm = ((stroke.size / 2) / maxDim) * 100;
  const extraToleranceNorm = (extraTolerancePx / maxDim) * 100;
  const hitThreshold = Math.max(1.5, strokeRadiusNorm + extraToleranceNorm);
  const hitThresholdSq = hitThreshold * hitThreshold;

  if (stroke.points.length === 1) {
    const dx = stroke.points[0].x - pt.x;
    const dy = stroke.points[0].y - pt.y;
    return dx * dx + dy * dy <= hitThresholdSq;
  }

  for (let j = 0; j < stroke.points.length - 1; j++) {
    const dSq = distToSegmentSquared(pt, stroke.points[j], stroke.points[j + 1]);
    if (dSq <= hitThresholdSq) {
      return true;
    }
  }
  return false;
};

// Check if point touches the border OR is inside a closed shape (rectangle, square, circle, oval, triangle)
export const isPointInsideOrTouchingStroke = (
  pt: DrawingPoint,
  stroke: DrawingStroke,
  pageWidth: number,
  pageHeight: number,
  extraTolerancePx: number = 0
): boolean => {
  if (!stroke.points || stroke.points.length === 0) return false;

  // 1. Check if touching stroke border
  if (isPointTouchingStrokeHelper(pt, stroke, pageWidth, pageHeight, extraTolerancePx)) {
    return true;
  }

  // 2. Lines & arrows do not have an enclosed body
  const shapeType = stroke.shapeType;
  if (shapeType === 'line' || shapeType === 'arrow') {
    return false;
  }

  const minX = Math.min(...stroke.points.map((p) => p.x));
  const maxX = Math.max(...stroke.points.map((p) => p.x));
  const minY = Math.min(...stroke.points.map((p) => p.y));
  const maxY = Math.max(...stroke.points.map((p) => p.y));

  // Fast bounding box rejection with tolerance
  const pad = 1.0;
  if (pt.x < minX - pad || pt.x > maxX + pad || pt.y < minY - pad || pt.y > maxY + pad) {
    return false;
  }

  // Circle or Ellipse interior check
  if (shapeType === 'circle' || shapeType === 'ellipse') {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const rx = Math.max(0.5, (maxX - minX) / 2);
    const ry = Math.max(0.5, (maxY - minY) / 2);
    const normX = (pt.x - cx) / rx;
    const normY = (pt.y - cy) / ry;
    return normX * normX + normY * normY <= 1.08;
  }

  // Triangle or arbitrary closed polygon: Ray casting algorithm
  if (shapeType === 'triangle' || (stroke.points.length >= 3 && (stroke.isSmartShape || stroke.points.length <= 8))) {
    let inside = false;
    const pts = stroke.points;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y;
      const xj = pts[j].x, yj = pts[j].y;
      const intersect =
        yi > pt.y !== yj > pt.y &&
        pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi || 0.00001) + xi;
      if (intersect) inside = !inside;
    }
    if (inside) return true;
  }

  // Rectangle, square, or other recognized closed shapes
  if (stroke.isSmartShape && shapeType && shapeType !== 'freehand') {
    return pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY;
  }

  return false;
};

// Check if point is inside, touching, or within handle reach of a shape (Geometrical Shapes only)
export const isPointNearShapeOrHandles = (
  pt: DrawingPoint,
  stroke: DrawingStroke,
  pageWidth: number,
  pageHeight: number
): boolean => {
  if (!stroke.points || stroke.points.length === 0) return false;
  if (!isGeometricalShape(stroke)) return false;
  if (isPointInsideOrTouchingStroke(pt, stroke, pageWidth, pageHeight, (stroke.size + 16) / 2)) {
    return true;
  }
  const minX = Math.min(...stroke.points.map((p) => p.x));
  const maxX = Math.max(...stroke.points.map((p) => p.x));
  const minY = Math.min(...stroke.points.map((p) => p.y));
  const maxY = Math.max(...stroke.points.map((p) => p.y));
  // 14px comfort margin around bounding box to catch handles
  const padX = (14 / pageWidth) * 100;
  const padY = (14 / pageHeight) * 100;
  return pt.x >= minX - padX && pt.x <= maxX + padX && pt.y >= minY - padY && pt.y <= maxY + padY;
};

interface DrawingCanvasProps {
  fileId?: string;
  pageNumber: number;
  width: number;
  height: number;
  scale: number;
  isDrawingMode: boolean; // true if pen, highlighter, smart_pen or smart_highlighter
  isHighlighter: boolean; // true if highlighter or smart_highlighter
  isSmartPen?: boolean;
  isSmartHighlighter?: boolean;
  isEraserMode: boolean;
  penColor: string;
  penSize: number;
  penOpacity?: number;
  eraserSize?: number;
  strokes: DrawingStroke[];
  onAddStroke: (stroke: Omit<DrawingStroke, 'id' | 'createdAt'>) => string | void;
  onUpdateStroke?: (strokeId: string, updates: Partial<DrawingStroke>, skipHistory?: boolean) => void;
  onDeleteStroke: (strokeId: string) => void;
  selectedIds?: string[];
  onSelect?: (id: string, isShift: boolean) => void;
  elevatedContainerId?: string;
}

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  fileId,
  pageNumber,
  width,
  height,
  scale,
  isDrawingMode,
  isHighlighter,
  isSmartPen = false,
  isSmartHighlighter = false,
  isEraserMode,
  penColor,
  penSize,
  penOpacity = 1,
  eraserSize = 20,
  strokes,
  onAddStroke,
  onUpdateStroke,
  onDeleteStroke,
  selectedIds,
  onSelect,
  elevatedContainerId,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPainting, setIsPainting] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<DrawingPoint[]>([]);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const activePenSizeRef = useRef<number>(penSize);
  const [cssScaleFactor, setCssScaleFactor] = useState<number>(1);

  // Helper to reliably locate target page container within the current document/column
  const getPageEl = useCallback((targetPage: number): HTMLElement | null => {
    if (canvasRef.current && targetPage === pageNumber) {
      const currentContainer = canvasRef.current.closest<HTMLElement>('[data-page-container="true"]') || canvasRef.current.parentElement;
      if (currentContainer) return currentContainer;
    }
    if (canvasRef.current) {
      const colContainer = canvasRef.current.closest('.pdf-viewport-container');
      if (colContainer) {
        const match = colContainer.querySelector<HTMLElement>(`[data-page-number="${targetPage}"]`);
        if (match) return match;
      }
    }
    if (fileId) {
      const el = document.getElementById(`page-container-${fileId}-${targetPage}`);
      if (el) return el;
    }
    return document.getElementById(`page-container-${targetPage}`);
  }, [fileId, pageNumber]);

  const [mountedContainer, setMountedContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = document.getElementById(elevatedContainerId || (fileId ? `elevated-annotation-container-${fileId}-${pageNumber}` : `elevated-annotation-container-${pageNumber}`));
    if (el) setMountedContainer(el);
  }, [pageNumber, elevatedContainerId]);
  const targetElevatedContainer = mountedContainer || (typeof document !== 'undefined' ? document.getElementById(elevatedContainerId || `elevated-annotation-container-${pageNumber}`) : null);

  const updateScaleFactor = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && width > 0) {
        setCssScaleFactor(rect.width / width);
      }
    }
  }, [width]);

  useEffect(() => {
    updateScaleFactor();
    window.addEventListener('resize', updateScaleFactor);
    return () => window.removeEventListener('resize', updateScaleFactor);
  }, [updateScaleFactor]);

  // Selected stroke state (requires single click or drag to select)
  const selectedIdsRef = useRef<string[] | undefined>(selectedIds);
  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  const [selectedStrokeId, setSelectedStrokeId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedIds) {
      if (selectedIds.length === 1) {
        setSelectedStrokeId(selectedIds[0]);
      } else if (selectedIds.length === 0) {
        setSelectedStrokeId(null);
      }
    }
  }, [selectedIds]);

  const isStrokeElevated = (strokeId: string) => {
    if (draggingStrokeId === strokeId || resizingStrokeId === strokeId) return true;
    if (selectedIds && selectedIds.includes(strokeId)) return true;
    if (selectedStrokeId === strokeId) return true;
    return false;
  };

  const [isShiftDown, setIsShiftDown] = useState(false);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftDown(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftDown(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const [altGhost, setAltGhost] = useState<DrawingStroke | null>(null);
  const altGhostRef = useRef<DrawingStroke | null>(null);
  useEffect(() => { altGhostRef.current = altGhost; }, [altGhost]);
  const [isHoveringShape, setIsHoveringShape] = useState(false);

  // 8-Point Bounding Box Resizing state
  type HandleType = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
  const [resizingStrokeId, setResizingStrokeId] = useState<string | null>(null);
  const [resizingHandle, setResizingHandle] = useState<HandleType | null>(null);

  const resizeStartRef = useRef<{
    startClientX: number;
    startClientY: number;
    origMinX: number;
    origMaxX: number;
    origMinY: number;
    origMaxY: number;
    shapeType?: string;
    initialPoints: DrawingPoint[];
  } | null>(null);

  // Dragging / Moving existing strokes state across pages
  const [draggingStrokeId, setDraggingStrokeId] = useState<string | null>(null);
  const dragStartRef = useRef<{ startClientX: number; startClientY: number; initialPoints: DrawingPoint[] } | null>(null);
  const hasMovedRef = useRef<boolean>(false);

  const strokesRef = useRef(strokes);
  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  const targetPageNum = Number(pageNumber);
  const pageStrokes = [
    ...strokes.filter((s) => Number(s.pageNumber) === targetPageNum),
    ...(altGhost && Number(altGhost.pageNumber) === targetPageNum ? [altGhost] : []),
  ];

  // Global mousemove & mouseup listeners for stroke dragging across pages
  useEffect(() => {
    if (!draggingStrokeId || !dragStartRef.current) return;

    const handleWindowMouseMove = (e: MouseEvent | PointerEvent) => {
      if (!dragStartRef.current || e.buttons !== 1) return;
      hasMovedRef.current = true;

      document.body.style.cursor = 'grabbing';
      if (canvasRef.current) {
        canvasRef.current.style.cursor = 'grabbing';
      }

      const stroke = strokesRef.current.find((s) => s.id === draggingStrokeId);
      const originPage = stroke?.pageNumber || pageNumber;
      const pageEl = getPageEl(originPage);
      if (!pageEl) return;
      const pageRect = pageEl.getBoundingClientRect();

      const dxPx = e.clientX - dragStartRef.current.startClientX;
      const dyPx = e.clientY - dragStartRef.current.startClientY;

      const dxPct = (dxPx / pageRect.width) * 100;
      const dyPct = (dyPx / pageRect.height) * 100;

      const newPoints = dragStartRef.current.initialPoints.map((p) => ({
        x: p.x + dxPct,
        y: p.y + dyPct,
      }));

      if (altGhostRef.current && altGhostRef.current.id === draggingStrokeId) {
        setAltGhost({ ...altGhostRef.current, points: newPoints });
      } else {
        onUpdateStroke?.(draggingStrokeId, { points: newPoints }, true);
        const currentSelected = selectedIdsRef.current;
        if (currentSelected && currentSelected.length > 1 && currentSelected.includes(draggingStrokeId)) {
          const lastDx = (dragStartRef.current as any).lastDispatchedDx || 0;
          const lastDy = (dragStartRef.current as any).lastDispatchedDy || 0;
          const stepDx = dxPct - lastDx;
          const stepDy = dyPct - lastDy;
          (dragStartRef.current as any).lastDispatchedDx = dxPct;
          (dragStartRef.current as any).lastDispatchedDy = dyPct;
          window.dispatchEvent(new CustomEvent('batch-translate', {
            detail: { leaderId: draggingStrokeId, dxPct: stepDx, dyPct: stepDy }
          }));
        }
      }
    };

    const handleWindowMouseUp = (e: MouseEvent | PointerEvent) => {
      document.body.style.cursor = '';
      if (canvasRef.current) {
        canvasRef.current.style.cursor = '';
      }

      if (draggingStrokeId && dragStartRef.current) {
        if (altGhostRef.current && altGhostRef.current.id === draggingStrokeId) {
           onAddStroke(altGhostRef.current);
           const addedId = altGhostRef.current.id;
           const targetPage = altGhostRef.current.pageNumber || pageNumber;
           setAltGhost(null);
           if (onSelect) onSelect(addedId, false);
           resetPageZIndex(targetPage, fileId);
           setDraggingStrokeId(null);
           dragStartRef.current = null;
           hasMovedRef.current = false;
           return;
        }

        const savedStroke = strokesRef.current.find((s) => s.id === draggingStrokeId);
        const originRect = getPageEl(savedStroke?.pageNumber || pageNumber)?.getBoundingClientRect();
        const stroke = savedStroke && originRect && Number.isFinite(e.clientX) && Number.isFinite(e.clientY) ? {
          ...savedStroke,
          points: dragStartRef.current.initialPoints.map(p => ({
            x: p.x + (e.clientX - dragStartRef.current!.startClientX) / originRect.width * 100,
            y: p.y + (e.clientY - dragStartRef.current!.startClientY) / originRect.height * 100,
          })),
        } : savedStroke;
        const originPage = stroke?.pageNumber || pageNumber;
        const pageEl = getPageEl(originPage);

        if (pageEl && stroke && stroke.points.length > 0 && hasMovedRef.current) {
          const pageRect = pageEl.getBoundingClientRect();
          const minX = Math.min(...stroke.points.map((p) => p.x));
          const minY = Math.min(...stroke.points.map((p) => p.y));
          const maxX = Math.max(...stroke.points.map((p) => p.x));
          const maxY = Math.max(...stroke.points.map((p) => p.y));

          const leftPx = pageRect.left + (minX / 100) * pageRect.width;
          const topPx = pageRect.top + (minY / 100) * pageRect.height;
          const widthPx = Math.max(1, ((maxX - minX) / 100) * pageRect.width);
          const heightPx = Math.max(1, ((maxY - minY) / 100) * pageRect.height);

          const match = findBestMatchingPage(
            {
              left: leftPx,
              top: topPx,
              right: leftPx + widthPx,
              bottom: topPx + heightPx,
              width: widthPx,
              height: heightPx,
            },
            originPage,
            maxX - minX,
            maxY - minY,
            fileId
          );

          if (match) {
            const strokeW = maxX - minX;
            const strokeH = maxY - minY;
            const convertedPoints = stroke.points.map((p) => {
              const relX = strokeW > 0 ? (p.x - minX) / strokeW : 0;
              const relY = strokeH > 0 ? (p.y - minY) / strokeH : 0;
              return {
                x: match.relXPct + relX * match.elementWidthPct,
                y: match.relYPct + relY * match.elementHeightPct,
              };
            });

            onUpdateStroke?.(
              draggingStrokeId,
              {
                pageNumber: match.targetPage,
                points: convertedPoints,
              },
              false
            );
          } else {
            // Commit history for same page move
            onUpdateStroke?.(draggingStrokeId, { points: stroke.points }, false);
          }
          const currentSelected = selectedIdsRef.current;
          if (currentSelected && currentSelected.length > 1) {
            window.dispatchEvent(new CustomEvent('batch-translate-commit', { detail: { leaderId: draggingStrokeId } }));
          }
        }

        resetPageZIndex(originPage, fileId);
        setDraggingStrokeId(null);
        dragStartRef.current = null;
      }
      hasMovedRef.current = false;
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    window.addEventListener('pointermove', handleWindowMouseMove);
    window.addEventListener('pointerup', handleWindowMouseUp);
    window.addEventListener('blur', handleWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
      window.removeEventListener('pointermove', handleWindowMouseMove);
      window.removeEventListener('pointerup', handleWindowMouseUp);
      window.removeEventListener('blur', handleWindowMouseUp);
    };
  }, [draggingStrokeId, isDrawingMode, pageNumber, onUpdateStroke, getPageEl, fileId]);

  // Global mousemove & mouseup listeners for 8-handle resizing
  useEffect(() => {
    if (!resizingStrokeId || !resizingHandle || !resizeStartRef.current) return;

    const handleResizeMouseMove = (e: MouseEvent) => {
      if (e.buttons !== 1 || !resizeStartRef.current) {
        handleResizeMouseUp();
        return;
      }

      const pageEl = getPageEl(pageNumber);
      if (!pageEl) return;
      const pageRect = pageEl.getBoundingClientRect();

      const dxPx = e.clientX - resizeStartRef.current.startClientX;
      const dyPx = e.clientY - resizeStartRef.current.startClientY;

      const dxPct = (dxPx / pageRect.width) * 100;
      const dyPct = (dyPx / pageRect.height) * 100;

      const { origMinX, origMaxX, origMinY, origMaxY, initialPoints, shapeType } = resizeStartRef.current;
      const origW = Math.max(0.001, origMaxX - origMinX);
      const origH = Math.max(0.001, origMaxY - origMinY);

      let scaledPoints: DrawingPoint[] = initialPoints;

      // 4 Corner handles: Free or proportional (1:1) scaling
      const isProportional = e.shiftKey || shapeType === 'square' || shapeType === 'circle';

      if (resizingHandle === 'nw') {
        let newMinX = Math.min(origMinX + dxPct, origMaxX - 0.5);
        let newMinY = Math.min(origMinY + dyPct, origMaxY - 0.5);
        let newW = origMaxX - newMinX;
        let newH = origMaxY - newMinY;

        if (isProportional) {
          const maxDim = Math.max(newW, newH);
          newW = maxDim;
          newH = maxDim * (origH / origW);
          newMinX = origMaxX - newW;
          newMinY = origMaxY - newH;
        }

        scaledPoints = initialPoints.map((p) => ({
          x: newMinX + ((p.x - origMinX) / origW) * newW,
          y: newMinY + ((p.y - origMinY) / origH) * newH,
        }));
      } else if (resizingHandle === 'ne') {
        let newMaxX = Math.max(origMaxX + dxPct, origMinX + 0.5);
        let newMinY = Math.min(origMinY + dyPct, origMaxY - 0.5);
        let newW = newMaxX - origMinX;
        let newH = origMaxY - newMinY;

        if (isProportional) {
          const maxDim = Math.max(newW, newH);
          newW = maxDim;
          newH = maxDim * (origH / origW);
          newMaxX = origMinX + newW;
          newMinY = origMaxY - newH;
        }

        scaledPoints = initialPoints.map((p) => ({
          x: origMinX + ((p.x - origMinX) / origW) * newW,
          y: newMinY + ((p.y - origMinY) / origH) * newH,
        }));
      } else if (resizingHandle === 'se') {
        let newMaxX = Math.max(origMaxX + dxPct, origMinX + 0.5);
        let newMaxY = Math.max(origMaxY + dyPct, origMinY + 0.5);
        let newW = newMaxX - origMinX;
        let newH = newMaxY - origMinY;

        if (isProportional) {
          const maxDim = Math.max(newW, newH);
          newW = maxDim;
          newH = maxDim * (origH / origW);
          newMaxX = origMinX + newW;
          newMaxY = origMinY + newH;
        }

        scaledPoints = initialPoints.map((p) => ({
          x: origMinX + ((p.x - origMinX) / origW) * newW,
          y: origMinY + ((p.y - origMinY) / origH) * newH,
        }));
      } else if (resizingHandle === 'sw') {
        let newMinX = Math.min(origMinX + dxPct, origMaxX - 0.5);
        let newMaxY = Math.max(origMaxY + dyPct, origMinY + 0.5);
        let newW = origMaxX - newMinX;
        let newH = newMaxY - origMinY;

        if (isProportional) {
          const maxDim = Math.max(newW, newH);
          newW = maxDim;
          newH = maxDim * (origH / origW);
          newMinX = origMaxX - newW;
          newMaxY = origMinY + newH;
        }

        scaledPoints = initialPoints.map((p) => ({
          x: newMinX + ((p.x - origMinX) / origW) * newW,
          y: origMinY + ((p.y - origMinY) / origH) * newH,
        }));
      } else if (resizingHandle === 'n') {
        // Cạnh trên: Co giãn chiều cao dọc
        const newMinY = Math.min(origMinY + dyPct, origMaxY - 0.5);
        const newH = origMaxY - newMinY;
        scaledPoints = initialPoints.map((p) => ({
          x: p.x,
          y: newMinY + ((p.y - origMinY) / origH) * newH,
        }));
      } else if (resizingHandle === 's') {
        // Cạnh dưới: Co giãn chiều cao dọc
        const newMaxY = Math.max(origMaxY + dyPct, origMinY + 0.5);
        const newH = newMaxY - origMinY;
        scaledPoints = initialPoints.map((p) => ({
          x: p.x,
          y: origMinY + ((p.y - origMinY) / origH) * newH,
        }));
      } else if (resizingHandle === 'w') {
        // Cạnh trái: Co giãn chiều rộng ngang
        const newMinX = Math.min(origMinX + dxPct, origMaxX - 0.5);
        const newW = origMaxX - newMinX;
        scaledPoints = initialPoints.map((p) => ({
          x: newMinX + ((p.x - origMinX) / origW) * newW,
          y: p.y,
        }));
      } else if (resizingHandle === 'e') {
        // Cạnh phải: Co giãn chiều rộng ngang
        const newMaxX = Math.max(origMaxX + dxPct, origMinX + 0.5);
        const newW = newMaxX - origMinX;
        scaledPoints = initialPoints.map((p) => ({
          x: origMinX + ((p.x - origMinX) / origW) * newW,
          y: p.y,
        }));
      }

      onUpdateStroke?.(resizingStrokeId, { points: scaledPoints }, true);
    };

    const handleResizeMouseUp = () => {
      if (resizingStrokeId) {
        const stroke = strokesRef.current.find((s) => s.id === resizingStrokeId);
        if (stroke && stroke.points) {
          onUpdateStroke?.(resizingStrokeId, { points: stroke.points }, false);
        }
        resetPageZIndex(stroke?.pageNumber || pageNumber);
      }
      setResizingStrokeId(null);
      setResizingHandle(null);
      resizeStartRef.current = null;
    };

    window.addEventListener('mousemove', handleResizeMouseMove);
    window.addEventListener('mouseup', handleResizeMouseUp);
    window.addEventListener('pointerup', handleResizeMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleResizeMouseMove);
      window.removeEventListener('mouseup', handleResizeMouseUp);
      window.removeEventListener('pointerup', handleResizeMouseUp);
    };
  }, [resizingStrokeId, resizingHandle, pageNumber, onUpdateStroke]);

  const handleStartResize = (
    e: React.MouseEvent,
    stroke: DrawingStroke,
    handle: HandleType
  ) => {
    e.stopPropagation();
    e.preventDefault();

    const minX = Math.min(...stroke.points.map((p) => p.x));
    const maxX = Math.max(...stroke.points.map((p) => p.x));
    const minY = Math.min(...stroke.points.map((p) => p.y));
    const maxY = Math.max(...stroke.points.map((p) => p.y));

    setSelectedStrokeId(stroke.id);
    setResizingStrokeId(stroke.id);
    setResizingHandle(handle);
    elevatePageZIndex(stroke.pageNumber || pageNumber, fileId);

    resizeStartRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      origMinX: minX,
      origMaxX: maxX,
      origMinY: minY,
      origMaxY: maxY,
      shapeType: stroke.shapeType,
      initialPoints: stroke.points.map((p) => ({ ...p })),
    };
  };

  // Clear selected stroke if user clicks outside canvas/handles/strokes
  useEffect(() => {
    const handleGlobalDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const el = e.target instanceof Element ? e.target : (e.target as Node | null)?.parentElement;
      if (el?.closest?.('#smart-shape-handles') || el?.closest?.('.stroke-interactive-group, .stroke-vector-group')) {
        return;
      }
      if (canvasRef.current && (canvasRef.current === e.target || (el && canvasRef.current.contains(el)))) {
        return;
      }
      setSelectedStrokeId(null);
    };
    window.addEventListener('mousedown', handleGlobalDown);
    return () => window.removeEventListener('mousedown', handleGlobalDown);
  }, []);

  // Keyboard Delete / Backspace listener for selected stroke in Select Mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeTag = (document.activeElement?.tagName || '').toLowerCase();
        if (
          activeTag === 'input' ||
          activeTag === 'textarea' ||
          (document.activeElement as HTMLElement)?.isContentEditable
        ) {
          return;
        }
        const currentSelected = selectedIdsRef.current;
        if (currentSelected && currentSelected.length > 0) {
          return;
        }
        if (selectedStrokeId) {
          e.preventDefault();
          onDeleteStroke(selectedStrokeId);
          setSelectedStrokeId(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedStrokeId, onDeleteStroke]);

  // Synchronize canvas cursor with active tool mode
  useEffect(() => {
    if (canvasRef.current) {
      if (isEraserMode) {
        canvasRef.current.style.cursor = 'none';
      } else if (isDrawingMode) {
        canvasRef.current.style.cursor = 'crosshair';
      } else {
        canvasRef.current.style.cursor = 'default';
      }
    }
  }, [isDrawingMode, isEraserMode]);

  const getNormalizedPoint = (
    e: React.PointerEvent<HTMLCanvasElement>
  ): DrawingPoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    
    // Always calculate relative coordinates directly from the page container origin (0, 0)
    const pageEl = getPageEl(pageNumber);
    const rect = pageEl ? pageEl.getBoundingClientRect() : canvas.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;

    const rawX = ((e.clientX - rect.left) / rect.width) * 100;
    const rawY = ((e.clientY - rect.top) / rect.height) * 100;

    // Clamp coordinates to valid page boundaries [0..100%] to prevent annotation drift into mid-air outside the page
    const x = Math.max(0, Math.min(100, rawX));
    const y = Math.max(0, Math.min(100, rawY));

    return { x, y };
  };

  // Object / Stroke Eraser logic (Lark Suite style)
  const eraseNearestStroke = (pt: DrawingPoint) => {
    if (pageStrokes.length === 0) return;

    for (const stroke of pageStrokes) {
      if (isPointTouchingStrokeHelper(pt, stroke, width, height, eraserSize / 2)) {
        onDeleteStroke(stroke.id);
        break;
      }
    }
  };

  const handleStart = (
    e: React.PointerEvent<HTMLCanvasElement>
  ) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    const pt = getNormalizedPoint(e);
    if (!pt) return;

    if (isEraserMode) {
      eraseNearestStroke(pt);
      return;
    }

    if (!isDrawingMode) {
      // In Select Mode: Check if clicked on an existing stroke (border or interior)
      const clickedStroke = [...pageStrokes].reverse().find((stroke) =>
        isPointInsideOrTouchingStroke(pt, stroke, width, height, (stroke.size + 14) / 2)
      );
      if (clickedStroke) {
        if (onSelect) {
          onSelect(clickedStroke.id, e.shiftKey);
        } else {
          setSelectedStrokeId(clickedStroke.id);
        }
        startDragStroke(e as any, clickedStroke);
      } else {
        if (!e.shiftKey) {
          if (onSelect) onSelect('', false);
          setSelectedStrokeId(null);
        }
      }
      return;
    }

    // In Drawing / Smart Drawing Mode:
    // Deselect previous shape and immediately start drawing a new stroke
    setSelectedStrokeId(null);
    setIsHoveringShape(false);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    updateScaleFactor();
    activePenSizeRef.current = penSize;
    setIsPainting(true);
    setCurrentStroke([pt]);
  };

  const handleMove = (
    e: React.PointerEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    if (canvas && e.pointerType === 'mouse') {
      const rect = canvas.getBoundingClientRect();
      setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }

    const pt = getNormalizedPoint(e);
    if (!pt) return;

    if (isEraserMode && e.buttons === 1) {
      eraseNearestStroke(pt);
      return;
    }

    if (isDrawingMode && canvas) {
      if (isPainting || resizingStrokeId || draggingStrokeId) {
        // Dragging, resizing or actively painting - do not run shape hover checks
      } else {
        const currentActive = selectedStrokeId
          ? pageStrokes.find((s) => s.id === selectedStrokeId)
          : null;

        if (
          currentActive &&
          isGeometricalShape(currentActive) &&
          isPointNearShapeOrHandles(pt, currentActive, width, height)
        ) {
          setIsHoveringShape(true);
          const isDirectlyOnBody = isPointInsideOrTouchingStroke(
            pt,
            currentActive,
            width,
            height,
            (currentActive.size + 14) / 2
          );
          canvas.style.cursor = isDirectlyOnBody ? 'move' : 'crosshair';
        } else {
          // Check if hovering any other GEOMETRICAL SHAPE on this page
          const hoveredShape = [...pageStrokes].reverse().find(
            (s) => isGeometricalShape(s) && isPointNearShapeOrHandles(pt, s, width, height)
          );
          if (hoveredShape) {
            setSelectedStrokeId(hoveredShape.id);
            setIsHoveringShape(true);
            const isDirectlyOnBody = isPointInsideOrTouchingStroke(
              pt,
              hoveredShape,
              width,
              height,
              (hoveredShape.size + 14) / 2
            );
            canvas.style.cursor = isDirectlyOnBody ? 'move' : 'crosshair';
          } else {
            // Moved away or hovering over lines/arrows/freehand/highlighters
            // In Drawing Mode, keep crosshair '+' and NEVER allow interaction with them
            setIsHoveringShape(false);
            canvas.style.cursor = 'crosshair';
          }
        }
      }
    } else if (!isDrawingMode && !isEraserMode && canvas) {
      if (draggingStrokeId) {
        canvas.style.cursor = 'grabbing';
      } else {
        // In Select Mode: Check if hovering on ANY stroke
        const hoveredStroke = [...pageStrokes].reverse().find((stroke) =>
          isPointInsideOrTouchingStroke(pt, stroke, width, height, (stroke.size + 16) / 2)
        );
        if (hoveredStroke) {
          if (isGeometricalShape(hoveredStroke)) {
            canvas.style.cursor = 'move';
          } else {
            // Nhóm Nét Vẽ & Chỉ Hướng: Đường Thẳng, Mũi Tên, Nét Vẽ Tự Do, Highlight:
            // Con trỏ chuột dạng Bàn tay xòe ('grab')
            canvas.style.cursor = 'grab';
          }
        } else {
          canvas.style.cursor = 'default';
        }
      }
    }

    if (isPainting) {
      setCurrentStroke((prev) => [...prev, pt]);
    }
  };

  const handleEnd = (e?: React.PointerEvent<HTMLCanvasElement>) => {
    if (e) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
    if (!isPainting) return;
    setIsPainting(false);
    if (currentStroke.length > 1) {
      let finalPoints = currentStroke;
      let isSmartShape = false;
      let shapeType: string | undefined = undefined;

      if (isSmartPen) {
        const res = recognizeSmartShapeDetailed(currentStroke);
        finalPoints = res.points;
        isSmartShape = res.isRecognized;
        shapeType = res.shapeType;
      } else if (isSmartHighlighter) {
        const res = recognizeSmartHighlight(currentStroke);
        finalPoints = res.points;
        isSmartShape = res.isRecognized;
        shapeType = res.isRecognized ? 'line' : 'freehand';
      }

      // Ensure all final stroke points are strictly bound and clamped to page boundaries [0..100%]
      const strokePointsToSave = finalPoints.map((p) => ({
        x: Math.max(0, Math.min(100, p.x)),
        y: Math.max(0, Math.min(100, p.y)),
      }));

      const newStrokeId = onAddStroke({
        pageNumber: Number(pageNumber),
        points: strokePointsToSave,
        color: penColor,
        size: activePenSizeRef.current || penSize,
        referenceScale: scale,
        opacity: isHighlighter ? 0.45 : (penOpacity ?? 1),
        isHighlighter: isHighlighter,
        isSmartShape: isSmartShape,
        shapeType: shapeType,
      });

      // Check if newly drawn stroke is a Geometrical Shape
      const isGeom =
        isSmartShape &&
        !isHighlighter &&
        (shapeType === 'circle' ||
          shapeType === 'ellipse' ||
          shapeType === 'rectangle' ||
          shapeType === 'square' ||
          shapeType === 'triangle' ||
          shapeType === 'parallelogram' ||
          shapeType === 'trapezoid');

      if (isGeom && typeof newStrokeId === 'string') {
        // Nhóm Hình Khối: Cho phép kéo chỉnh Handle và kéo di chuyển trực tiếp
        setSelectedStrokeId(newStrokeId);
        setIsHoveringShape(true);
      } else {
        // Nhóm Nét Vẽ & Chỉ Hướng (Đường Thẳng, Mũi Tên, Vẽ Tự Do, Highlight):
        // Trong Chế độ Vẽ/Tạo Nét: KHÔNG cho phép di chuyển hay tương tác lại nét vừa vẽ
        setSelectedStrokeId(null);
        setIsHoveringShape(false);
      }
    }
    setCurrentStroke([]);
  };

  const startDragStroke = (e: React.MouseEvent | React.PointerEvent, stroke: DrawingStroke) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    // Option (Alt) + Left Click Drag -> Quick Duplicate Stroke!
    if (e.altKey) {
      e.preventDefault();
      const dupId = `stroke_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const duplicated = {
        ...stroke,
        id: dupId,
        createdAt: Date.now(),
      };
      setAltGhost(duplicated);
      hasMovedRef.current = true;
      dragStartRef.current = { startClientX: e.clientX, startClientY: e.clientY, initialPoints: JSON.parse(JSON.stringify(stroke.points)) };
      setDraggingStrokeId(dupId);
      document.body.style.cursor = 'copy';
      return;
    }

    if (e.shiftKey) {
      if (onSelect) {
        onSelect(stroke.id, true);
      }
      setSelectedStrokeId(stroke.id);
    } else {
      const currentSelected = selectedIdsRef.current;
      if (currentSelected && currentSelected.includes(stroke.id) && currentSelected.length > 1) {
        // Part of multi-selection: preserve all selected items for group dragging!
        setSelectedStrokeId(stroke.id);
      } else {
        if (onSelect) {
          onSelect(stroke.id, false);
        }
        setSelectedStrokeId(stroke.id);
      }
    }

    hasMovedRef.current = false;
    updateScaleFactor();
    elevatePageZIndex(stroke.pageNumber || pageNumber, fileId);
    setDraggingStrokeId(stroke.id);
    dragStartRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      initialPoints: stroke.points.map((p) => ({ ...p })),
    };
    if (canvasRef.current) {
      canvasRef.current.style.cursor = 'grabbing';
    }
    document.body.style.cursor = 'grabbing';
  };

  // Convert points to SVG path data string (straight lines for sharp polygons/smart shapes, bezier for freehand)
  const getSvgPathData = (points: DrawingPoint[], isPolygon = false) => {
    if (points.length < 2) return '';
    let d = `M ${points[0].x} ${points[0].y}`;
    if (points.length === 2 || isPolygon) {
      for (let i = 1; i < points.length; i++) {
        d += ` L ${points[i].x} ${points[i].y}`;
      }
      return d;
    }
    for (let i = 1; i < points.length - 1; i++) {
      const curr = points[i];
      const next = points[i + 1];
      const midX = (curr.x + next.x) / 2;
      const midY = (curr.y + next.y) / 2;
      d += ` Q ${curr.x} ${curr.y}, ${midX} ${midY}`;
    }
    d += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;
    return d;
  };

  const selectedStroke = pageStrokes.find((s) => s.id === selectedStrokeId);
  const isSmartShapeActive = Boolean(selectedStroke && isGeometricalShape(selectedStroke));

  return (
    <>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full pointer-events-none z-25 overflow-hidden select-none"
        style={{ mixBlendMode: 'multiply' }} data-annotation-highlighters="true">
        {pageStrokes.filter(stroke => stroke.isHighlighter && stroke.id !== draggingStrokeId).map(stroke => (
          <path key={stroke.id} d={getSvgPathData(stroke.points, stroke.isSmartShape || stroke.points.length <= 6)}
            fill="none" stroke={stroke.color} strokeWidth={stroke.size * scale / (stroke.referenceScale || 1)}
            vectorEffect="non-scaling-stroke" strokeOpacity={stroke.opacity ?? 0.45}
            strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </svg>
      {/* 1. Base Annotation Layer (Lớp dưới): Persistent vector rendering of all completed unselected page strokes */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full pointer-events-none z-20 overflow-hidden select-none"
      >
        {pageStrokes.map((stroke) => {
          if (isStrokeElevated(stroke.id)) return null; // Rendered in elevated portal or active drag preview
          const isGeom = isGeometricalShape(stroke);
          const isPolygon = stroke.isSmartShape || (stroke.points && stroke.points.length <= 6);
          const d = getSvgPathData(stroke.points, isPolygon);
          if (!d) return null;

          const hitStrokeWidth = Math.max(24, stroke.size * scale / (stroke.referenceScale || 1) + 20);
          const currentSelected = selectedIdsRef.current;
          const isSelected = currentSelected
            ? currentSelected.includes(stroke.id)
            : selectedStrokeId === stroke.id;

          return (
            <g key={`stroke-render-${stroke.id}`} className="stroke-vector-group">
              {/* Visible vector stroke */}
              <path
                d={d}
                fill={isGeom && stroke.fillColor && stroke.fillColor !== 'transparent' ? stroke.fillColor : 'none'}
                stroke={stroke.color}
                strokeWidth={stroke.size * scale / (stroke.referenceScale || 1)}
                vectorEffect="non-scaling-stroke"
                strokeOpacity={stroke.opacity ?? (stroke.isHighlighter ? 0.45 : 1)}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  display: stroke.isHighlighter ? 'none' : undefined,
                  pointerEvents: 'none',
                }}
              />

              {/* Interactive Hit Path in Select Mode or when Shift is held */}
              {((!isDrawingMode || isShiftDown) && !isEraserMode) && (
                <path
                  d={d}
                  fill={isGeom ? 'transparent' : 'none'}
                  stroke="transparent"
                  strokeWidth={hitStrokeWidth}
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    pointerEvents: isGeom ? 'all' : 'stroke',
                    cursor: draggingStrokeId === stroke.id
                      ? 'grabbing'
                      : 'grab',
                  }}
                  onMouseEnter={() => {
                    if (!draggingStrokeId && canvasRef.current) {
                      canvasRef.current.style.cursor = 'grab';
                    }
                  }}
                  onMouseLeave={() => {
                    if (!draggingStrokeId && canvasRef.current) {
                      canvasRef.current.style.cursor = 'default';
                    }
                  }}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    e.preventDefault();
                    startDragStroke(e, stroke);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* 1b. Elevated Selected Stroke Layer: Only the specifically selected stroke is rendered above StickyNotesLayer */}
      {targetElevatedContainer &&
        typeof document !== 'undefined' &&
        (() => {
          const elevatedStrokes = pageStrokes.filter(
            (s) => isStrokeElevated(s.id) && s.id !== draggingStrokeId
          );
          if (elevatedStrokes.length === 0) return null;

          return createPortal(
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full pointer-events-none z-20 overflow-visible select-none"
            >
              {elevatedStrokes.map((stroke) => {
                const isGeom = isGeometricalShape(stroke);
                const isPolygon = stroke.isSmartShape || (stroke.points && stroke.points.length <= 6);
                const d = getSvgPathData(stroke.points, isPolygon);
                if (!d) return null;

                const hitStrokeWidth = Math.max(24, stroke.size * scale / (stroke.referenceScale || 1) + 20);

                return (
                  <g key={`elevated-stroke-render-${stroke.id}`} className="stroke-vector-group">
                    {/* Visible vector stroke (elevated above sticky notes) */}
                    <path
                      d={d}
                      fill={isGeom && stroke.fillColor && stroke.fillColor !== 'transparent' ? stroke.fillColor : 'none'}
                      stroke={stroke.color}
                      strokeWidth={stroke.size * scale / (stroke.referenceScale || 1)}
                      vectorEffect="non-scaling-stroke"
                      strokeOpacity={stroke.opacity ?? (stroke.isHighlighter ? 0.45 : 1)}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        display: stroke.isHighlighter ? 'none' : undefined,
                        pointerEvents: 'none',
                      }}
                    />

                    {/* Interactive Hit Path in Select Mode or when Shift is held (accessible directly over sticky notes) */}
                    {((!isDrawingMode || isShiftDown) && !isEraserMode) && (
                      <path
                        d={d}
                        fill={isGeom ? 'transparent' : 'none'}
                        stroke="transparent"
                        strokeWidth={hitStrokeWidth}
                        vectorEffect="non-scaling-stroke"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{
                          pointerEvents: isGeom ? 'all' : 'stroke',
                          cursor: draggingStrokeId === stroke.id ? 'grabbing' : 'grab',
                        }}
                        onMouseEnter={() => {
                          if (!draggingStrokeId && canvasRef.current) {
                            canvasRef.current.style.cursor = 'grab';
                          }
                        }}
                        onMouseLeave={() => {
                          if (!draggingStrokeId && canvasRef.current) {
                            canvasRef.current.style.cursor = 'default';
                          }
                        }}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          e.stopPropagation();
                          e.preventDefault();
                          startDragStroke(e, stroke);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      />
                    )}
                  </g>
                );
              })}
            </svg>,
            targetElevatedContainer
          );
        })()}

      {/* 2. Active Drawing Layer (Lớp trên): HTML5 Canvas for real-time smooth raster rendering */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        className={`absolute inset-0 z-30 ${
          isEraserMode
            ? 'cursor-none pointer-events-auto'
            : isDrawingMode
            ? 'cursor-crosshair pointer-events-auto'
            : 'pointer-events-none'
        }`}
        onPointerDown={handleStart}
        onPointerMove={handleMove}
        onPointerUp={handleEnd}
        onPointerCancel={handleEnd}
        onMouseLeave={() => {
          setCursorPos(null);
          if (isDrawingMode && !draggingStrokeId && !resizingStrokeId) {
            setIsHoveringShape(false);
          }
        }}
        style={{
          width: `${width}px`,
          height: `${height}px`,
        }}
      />

      {/* Real-time Current Drawing Stroke SVG Overlay */}
      {isPainting && currentStroke.length > 0 && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none z-[9999] overflow-visible"
          style={{ mixBlendMode: isHighlighter ? 'multiply' : 'normal' }}
        >
          <path
            d={getSvgPathData(currentStroke)}
            fill="none"
            stroke={penColor}
            vectorEffect="non-scaling-stroke"
            strokeWidth={(activePenSizeRef.current || penSize) * cssScaleFactor}
            strokeOpacity={isHighlighter ? 0.45 : (penOpacity ?? 1)}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              mixBlendMode: isHighlighter ? 'multiply' : 'normal',
            }}
          />
        </svg>
      )}

      {/* Interactive Transform Box & 8/4-Point Handles for Selected Geometrical Shape rendered via document.body Portal */}
      {selectedStroke &&
        (!selectedIdsRef.current || selectedIdsRef.current.length <= 1) &&
        selectedStroke.points &&
        selectedStroke.points.length >= 2 &&
        isGeometricalShape(selectedStroke) &&
        (!isDrawingMode || isHoveringShape || !!draggingStrokeId || !!resizingStrokeId) &&
        typeof document !== 'undefined' &&
        (() => {
          const activeMovingStroke =
            draggingStrokeId === selectedStroke.id || resizingStrokeId === selectedStroke.id
              ? strokes.find((s) => s.id === selectedStroke.id) || altGhost || selectedStroke
              : selectedStroke;

          if (!activeMovingStroke || !activeMovingStroke.points || activeMovingStroke.points.length < 2) return null;

          const originPage = activeMovingStroke.pageNumber || pageNumber;
          const pageEl = getPageEl(originPage);
          if (!pageEl) return null;
          const pageRect = pageEl.getBoundingClientRect();

          const minX = Math.min(...activeMovingStroke.points.map((p) => p.x));
          const maxX = Math.max(...activeMovingStroke.points.map((p) => p.x));
          const minY = Math.min(...activeMovingStroke.points.map((p) => p.y));
          const maxY = Math.max(...activeMovingStroke.points.map((p) => p.y));
          const w = Math.max(0.5, maxX - minX);
          const h = Math.max(0.5, maxY - minY);
          const midX = minX + w / 2;
          const midY = minY + h / 2;

          const isTriangle = activeMovingStroke.shapeType === 'triangle';

          // Convert percentage coordinates relative to origin page into fixed screen pixel coordinates
          const screenMinX = pageRect.left + (minX / 100) * pageRect.width;
          const screenMinY = pageRect.top + (minY / 100) * pageRect.height;
          const screenW = (w / 100) * pageRect.width;
          const screenH = (h / 100) * pageRect.height;

          // 4 Corner Handles (NW, NE, SE, SW) for all shapes
          const cornerHandles: Array<{
            id: HandleType;
            screenX: number;
            screenY: number;
            cursor: string;
            title: string;
          }> = [
            { id: 'nw', screenX: pageRect.left + (minX / 100) * pageRect.width, screenY: pageRect.top + (minY / 100) * pageRect.height, cursor: 'nwse-resize', title: 'Kéo co giãn góc trên trái' },
            { id: 'ne', screenX: pageRect.left + (maxX / 100) * pageRect.width, screenY: pageRect.top + (minY / 100) * pageRect.height, cursor: 'nesw-resize', title: 'Kéo co giãn góc trên phải' },
            { id: 'se', screenX: pageRect.left + (maxX / 100) * pageRect.width, screenY: pageRect.top + (maxY / 100) * pageRect.height, cursor: 'nwse-resize', title: 'Kéo co giãn góc dưới phải' },
            { id: 'sw', screenX: pageRect.left + (minX / 100) * pageRect.width, screenY: pageRect.top + (maxY / 100) * pageRect.height, cursor: 'nesw-resize', title: 'Kéo co giãn góc dưới trái' },
          ];

          // 4 Edge Midpoint Handles (N, S, W, E) for Rectangle/Square & Circle/Oval (hidden for Triangle)
          const edgeHandles: Array<{
            id: HandleType;
            screenX: number;
            screenY: number;
            cursor: string;
            title: string;
          }> = isTriangle
            ? []
            : [
                { id: 'n', screenX: pageRect.left + (midX / 100) * pageRect.width, screenY: pageRect.top + (minY / 100) * pageRect.height, cursor: 'ns-resize', title: 'Kéo co giãn chiều cao phía trên' },
                { id: 's', screenX: pageRect.left + (midX / 100) * pageRect.width, screenY: pageRect.top + (maxY / 100) * pageRect.height, cursor: 'ns-resize', title: 'Kéo co giãn chiều cao phía dưới' },
                { id: 'w', screenX: pageRect.left + (minX / 100) * pageRect.width, screenY: pageRect.top + (midY / 100) * pageRect.height, cursor: 'ew-resize', title: 'Kéo co giãn chiều rộng bên trái' },
                { id: 'e', screenX: pageRect.left + (maxX / 100) * pageRect.width, screenY: pageRect.top + (midY / 100) * pageRect.height, cursor: 'ew-resize', title: 'Kéo co giãn chiều rộng bên phải' },
              ];

          return createPortal(
            <div
              id="smart-shape-handles-portal"
              className="fixed inset-0 pointer-events-none z-[99999999] select-none"
              onMouseEnter={() => {
                if (isDrawingMode) setIsHoveringShape(true);
              }}
            >
              {/* Move Area: Pure transparent body drag area - border and stroke completely invisible */}
              <div
                className="fixed pointer-events-auto cursor-move border-0 border-transparent bg-transparent z-[99999998]"
                style={{
                  left: `${screenMinX}px`,
                  top: `${screenMinY}px`,
                  width: `${screenW}px`,
                  height: `${screenH}px`,
                }}
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  startDragStroke(e, activeMovingStroke);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
                onMouseEnter={() => {
                  if (isDrawingMode) setIsHoveringShape(true);
                }}
                title="Đè chuột trái để di chuyển hình"
              />

              {/* Corner Handles (4 points) - Compact round blue dots with white border matching Figma/GoodNotes */}
              {cornerHandles.map((handle) => (
                <div
                  key={handle.id}
                  className="fixed -translate-x-1/2 -translate-y-1/2 w-[10px] h-[10px] rounded-full bg-[#2563eb] border-2 border-white shadow-lg pointer-events-auto select-none z-[99999999] before:content-[''] before:absolute before:-inset-2.5 before:rounded-full before:bg-transparent hover:scale-125 transition-transform"
                  style={{
                    left: `${handle.screenX}px`,
                    top: `${handle.screenY}px`,
                    cursor: handle.cursor,
                  }}
                  onMouseEnter={() => {
                    if (isDrawingMode) setIsHoveringShape(true);
                  }}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    handleStartResize(e, activeMovingStroke, handle.id);
                  }}
                  title={handle.title}
                />
              ))}

              {/* Edge Midpoint Handles (4 points - Rectangle/Square & Circle/Oval only) */}
              {edgeHandles.map((handle) => (
                <div
                  key={handle.id}
                  className="fixed -translate-x-1/2 -translate-y-1/2 w-[10px] h-[10px] rounded-full bg-[#2563eb] border-2 border-white shadow-lg pointer-events-auto select-none z-[99999999] before:content-[''] before:absolute before:-inset-2.5 before:rounded-full before:bg-transparent hover:scale-125 transition-transform"
                  style={{
                    left: `${handle.screenX}px`,
                    top: `${handle.screenY}px`,
                    cursor: handle.cursor,
                  }}
                  onMouseEnter={() => {
                    if (isDrawingMode) setIsHoveringShape(true);
                  }}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    handleStartResize(e, activeMovingStroke, handle.id);
                  }}
                  title={handle.title}
                />
              ))}
            </div>,
            document.body
          );
        })()}


      {/* Active Dragging Stroke Preview across all pages without canvas clipping using document body Portal */}
      {draggingStrokeId &&
        typeof document !== 'undefined' &&
        createPortal(
          (() => {
            const activeStroke = strokes.find((s) => s.id === draggingStrokeId) || altGhost;
            if (!activeStroke || !activeStroke.points || activeStroke.points.length < 2) return null;
            const originPage = activeStroke.pageNumber || pageNumber;
            const pageEl = getPageEl(originPage);
            if (!pageEl) return null;
            const pageRect = pageEl.getBoundingClientRect();

            const isPolygon = activeStroke.isSmartShape || (activeStroke.points && activeStroke.points.length <= 6);

            // Convert points relative to origin page into absolute screen pixel coordinates
            const screenPoints = activeStroke.points.map((p) => ({
              x: pageRect.left + (p.x / 100) * pageRect.width,
              y: pageRect.top + (p.y / 100) * pageRect.height,
            }));

            let pathData = `M ${screenPoints[0].x} ${screenPoints[0].y}`;
            if (screenPoints.length === 2 || isPolygon) {
              for (let i = 1; i < screenPoints.length; i++) {
                pathData += ` L ${screenPoints[i].x} ${screenPoints[i].y}`;
              }
            } else {
              for (let i = 1; i < screenPoints.length - 1; i++) {
                const curr = screenPoints[i];
                const next = screenPoints[i + 1];
                const midX = (curr.x + next.x) / 2;
                const midY = (curr.y + next.y) / 2;
                pathData += ` Q ${curr.x} ${curr.y}, ${midX} ${midY}`;
              }
              pathData += ` L ${screenPoints[screenPoints.length - 1].x} ${screenPoints[screenPoints.length - 1].y}`;
            }

            return (
              <div className="fixed inset-0 pointer-events-none z-[999999] overflow-visible" style={{ mixBlendMode: activeStroke.isHighlighter ? 'multiply' : 'normal' }}>
                <svg
                  className="w-full h-full pointer-events-none overflow-visible"
                  style={{ width: '100vw', height: '100vh' }}
                >
                  <path
                    d={pathData}
                    fill={
                      isGeometricalShape(activeStroke) && activeStroke.fillColor && activeStroke.fillColor !== 'transparent'
                        ? activeStroke.fillColor
                        : 'none'
                    }
                    stroke={activeStroke.color}
                    vectorEffect="non-scaling-stroke"
                    strokeWidth={activeStroke.size * scale / (activeStroke.referenceScale || 1) * cssScaleFactor}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={activeStroke.opacity ?? (activeStroke.isHighlighter ? 0.45 : 1)}
                    style={{
                      mixBlendMode: activeStroke.isHighlighter ? 'multiply' : 'normal',
                    }}
                    className="pointer-events-none shadow-sm"
                  />
                </svg>
              </div>
            );
          })(),
          document.body
        )}
    </>
  );
};
