import { highlightClip } from '../utils/highlightGeometry';
import { loadOCRLines } from '../utils/selectionOCR';
import React, { useRef, useState, useEffect } from 'react';
import { beginLineGesture, loadSelectionLines, rasterSelectionLines, moveLineGesture, lineSelectionRects, selectedLineText, selectionLineCovered, type LineGesture, type SelectionLine } from '../utils/selectionLines';
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

interface PendingBox { rects: NormalizedRect[]; selectionKind?: 'text'; text?: string; textComplete?: boolean }

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
  const preparingRef = useRef<{doc:any;page:number} | null>(null);
  const preparedRef = useRef<{doc:any;page:number} | null>(null);
  const gestureRef = useRef<LineGesture | null>(null);
  const draggedRef = useRef(false);
  const inputRef = useRef({ pdfDoc, pageNumber });
  inputRef.current = { pdfDoc, pageNumber };
  const prepareLines = () => {
    if (!isActive || !isNearViewport || !containerRef.current) return;
    if(containerRef.current.closest<HTMLElement>('.pdf-viewport-container')?.dataset.zoomGesture === 'true') return;
    if([preparingRef.current,preparedRef.current].some(key=>key?.doc===pdfDoc && key.page===pageNumber)) return;
    const rect = containerRef.current.getBoundingClientRect();
    const viewport = containerRef.current.closest('.pdf-viewport-container')?.getBoundingClientRect();
    if (viewport && (rect.bottom <= viewport.top || rect.top >= viewport.bottom || rect.right <= viewport.left || rect.left >= viewport.right)) return;
    const preparation={doc:pdfDoc,page:pageNumber};
    preparingRef.current=preparation;
    const relevant = () => {
      const box = containerRef.current?.getBoundingClientRect();
      const view = containerRef.current?.closest('.pdf-viewport-container')?.getBoundingClientRect();
      return inputRef.current.pdfDoc === pdfDoc && inputRef.current.pageNumber === pageNumber && containerRef.current?.closest<HTMLElement>('.pdf-viewport-container')?.dataset.zoomGesture !== 'true' && !!box && !!view && box.bottom > view.top && box.top < view.bottom;
    };
    loadSelectionLines(pdfDoc, pageNumber).then(async lines => {
      if (inputRef.current.pdfDoc !== pdfDoc || inputRef.current.pageNumber !== pageNumber) return;
      if(!relevant()) return;
      const nativeLines = lines;
      const page = containerRef.current?.closest('[data-page-container="true"]');
      const canvas = [...(page?.querySelectorAll<HTMLCanvasElement>('canvas[data-rendered-scale]') || [])].find(canvas => getComputedStyle(canvas).visibility !== 'hidden' && getComputedStyle(canvas).opacity !== '0');
      const sparseText = lines.length < 3 || lines.reduce((n,line) => n + (line.glyphs?.length || 0),0) < 80;
      const heights = lines.map(l=>l.height).sort((a,b)=>a-b);
      const height = heights[Math.floor(heights.length/2)] || 0.015;
      const missing: SelectionLine[] = [];
      let uncoveredRows=0;
      if(canvas) for(const x of [0.25,0.5,0.75]) for(const visual of rasterSelectionLines(canvas,x,0.5,height,true)) {
        const covered = [...nativeLines,...missing].filter(line => {
          const oy=Math.min(line.y+line.height,visual.y+visual.height)-Math.max(line.y,visual.y);
          return oy>=Math.min(line.height,visual.height)*0.5;
        }).map(line=>[Math.max(line.x,visual.x),Math.min(line.x+line.width,visual.x+visual.width)])
          .filter(([left,right])=>right>left).sort((a,b)=>a[0]-b[0]);
        let right=visual.x,total=0;
        for(const [left,end] of covered) {total+=Math.max(0,end-Math.max(left,right));right=Math.max(right,end);}
        if(total<visual.width*0.7) {
          uncoveredRows++;
          if(!selectionLineCovered(visual,nativeLines)) missing.push(visual);
        }
      }
      lines = [...nativeLines,...missing];
      if(lines.length) { linesRef.current=lines; loadedPageRef.current={doc:pdfDoc,page:pageNumber}; }
      // Mixed native/scanned pages also need recognition when the visual rows
      // expose missing text coverage; glyph count alone cannot detect them.
      if ((sparseText || uncoveredRows >= 3) && relevant()) {
        if (canvas) {
          const recognized = await loadOCRLines(pdfDoc, pageNumber, canvas, relevant);
          if (recognized.length) {
            // OCR fills scanned regions; it must not replace a native PDF line
            // with a different ink-height box after the worker finishes.
            const native = nativeLines;
            lines = [...native, ...recognized.filter(ocr => !selectionLineCovered(ocr,native))].sort((a, b) => a.y - b.y || a.x - b.x);
          }
        }
      }
      if (inputRef.current.pdfDoc !== pdfDoc || inputRef.current.pageNumber !== pageNumber) return;
      linesRef.current = lines; loadedPageRef.current = { doc: pdfDoc, page: pageNumber };
      if(canvas && relevant()) preparedRef.current=preparation;
    }).finally(()=> {if(preparingRef.current===preparation) preparingRef.current=null;});
  };
  useEffect(() => {
    prepareLines();
    const viewport=containerRef.current?.closest('.pdf-viewport-container');
    const finished=()=>prepareLines();
    viewport?.addEventListener('pdf-zoom-end',finished);
    return ()=>viewport?.removeEventListener('pdf-zoom-end',finished);
  }, [pdfDoc, pageNumber, isActive, isNearViewport]);

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
    // Native text geometry remains authoritative. A scan's visual row bands
    // fill OCR omissions, including rows whose confidence is too low to read.
    const native = matchingLines.filter(line => line.source === 'pdf');
    const sparse = native.length < 3 || native.reduce((n,l) => n + (l.glyphs?.length || 0),0) < 80;
    const visual = sparse ? rasterSelectionLines(canvas,x,y,fallbackHeight) : [];
    const lines = [...matchingLines, ...visual.filter(v => !matchingLines.some(l => {
      const ox = Math.min(l.x+l.width,v.x+v.width)-Math.max(l.x,v.x);
      const oy = Math.min(l.y+l.height,v.y+v.height)-Math.max(l.y,v.y);
      return ox >= v.width*0.6 && oy >= Math.min(l.height,v.height)*0.5;
    }))];
    gestureRef.current = beginLineGesture(lines, x, y, fallbackHeight);
    draggedRef.current = false;

    setStartPos({ x, y });
    setCurrentPos({ x, y });
    setIsDragging(false);
  };

  const getSelectionRects = (p1: { x: number; y: number }, p2: { x: number; y: number }): NormalizedRect[] => {
    const gesture = gestureRef.current;
    if (!gesture || !containerRef.current) return [];
    return lineSelectionRects(gesture, p1.x, p2.x)
      .map(rect => {
        // Keep scanned and native text highlights level, with a little breathing
        // room around the ink so the color does not sit tight against glyphs.
        const verticalPad = rect.height * 0.1;
        const x = Math.max(0, rect.x), y = Math.max(0, rect.y - verticalPad);
        const bottom = Math.min(1, rect.y + rect.height + verticalPad);
        return { x, y, width: Math.min(1, rect.x + rect.width) - x, height: bottom - y };
      })
      .filter(rect => rect.height > 0 && rect.width * containerRef.current!.clientWidth > 2)
      .map(rect => ({ x: rect.x * 100, y: rect.y * 100, width: rect.width * 100, height: rect.height * 100 }));
  };

  // Robust window mousemove and mouseup listeners during dragging
  useEffect(() => {
    if (!startPos) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      if (gestureRef.current) moveLineGesture(gestureRef.current, y, x);
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
      if (gestureRef.current) moveLineGesture(gestureRef.current, endY, endX);
      const dist = Math.hypot((endX - startPos.x) * rect.width, (endY - startPos.y) * rect.height);
      if (dist > 8 && draggedRef.current) {
        const rects = getSelectionRects(startPos, { x: endX, y: endY });
        if (rects.length) setPendingSelection({ rects, selectionKind: gestureRef.current?.textSelection ? 'text' : undefined, ...(gestureRef.current ? selectedLineText(gestureRef.current, startPos.x, endX, 2 / containerRef.current!.clientWidth) : {}) });
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
      text: pendingSelection.text || '',
      textComplete: pendingSelection.textComplete,
      color: colorToUse,
      rects: pendingSelection.rects,
      selectionKind: pendingSelection.selectionKind,
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
      data-selection-layer="true"
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
              clipPath: highlightClip(r),
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
                clipPath: highlightClip(r),
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
