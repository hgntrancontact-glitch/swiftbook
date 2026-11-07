import React, { useRef, useState, useEffect, useLayoutEffect, useMemo } from 'react';
import {
  HighlightAnnotation,
  TextNoteAnnotation,
  DrawingStroke,
  BoxAnnotation,
  BoxConfig,
  FreeTextAnnotation,
  ActiveTool,
  NormalizedRect,
  HighlightColor,
} from '../types';
import { PDFPageView, pageDimensionCache } from './PDFPageView';
import { CONTINUOUS_GAP } from '../utils/pdfViewport';

interface ContinuousViewProps {
  fileId: string;
  pdfDoc: any;
  visualViewportScale?: number;
  totalPages: number;
  scale: number;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  activeTool: ActiveTool;
  penColor: string;
  penSize: number;
  penOpacity?: number;
  eraserSize?: number;
  highlightColorHex?: string;
  highlightColor?: HighlightColor;
  boxColor?: string;
  boxConfig?: BoxConfig;
  onUpdateBoxConfig?: (updates: Partial<BoxConfig>) => void;
  highlights: HighlightAnnotation[];
  textNotes: TextNoteAnnotation[];
  drawings: DrawingStroke[];
  boxes: BoxAnnotation[];
  freeTexts: FreeTextAnnotation[];
  selectedIds?: string[];
  onSelect?: (id: string, isShift: boolean) => void;
  onTextSelected: (
    pageNumber: number,
    text: string,
    rects: NormalizedRect[],
    clientPos: { x: number; y: number }
  ) => void;
  onAddHighlight?: (highlight: HighlightAnnotation) => void;
  onAddNote: (note: Omit<TextNoteAnnotation, 'id' | 'createdAt'>) => void;
  onUpdateNote: (id: string, updates: Partial<TextNoteAnnotation>, skipHistory?: boolean) => void;
  onDeleteNote: (id: string) => void;
  onAddBox: (box: Omit<BoxAnnotation, 'id' | 'createdAt'>) => void;
  onUpdateBox: (id: string, updates: Partial<BoxAnnotation>, skipHistory?: boolean) => void;
  onDeleteBox: (id: string) => void;
  onAddFreeText: (text: Omit<FreeTextAnnotation, 'id' | 'createdAt'>) => void;
  onUpdateFreeText: (id: string, updates: Partial<FreeTextAnnotation>, skipHistory?: boolean) => void;
  onDeleteFreeText: (id: string) => void;
  onDeleteHighlight: (id: string) => void;
  onUpdateHighlight?: (id: string, updates: Partial<HighlightAnnotation>, skipHistory?: boolean) => void;
  onUpdateHighlightNote?: (id: string, note: string) => void;
  onUpdateHighlightColor?: (id: string, color: any) => void;
  onAddStroke: (stroke: Omit<DrawingStroke, 'id' | 'createdAt'>) => void;
  onUpdateStroke?: (strokeId: string, updates: Partial<DrawingStroke>, skipHistory?: boolean) => void;
  onDeleteStroke: (strokeId: string) => void;
  onActiveToolChange?: (tool: ActiveTool) => void;
}

const ContinuousViewComponent: React.FC<ContinuousViewProps> = ({
  fileId,
  pdfDoc,
  visualViewportScale = 1,
  totalPages,
  scale,
  currentPage,
  onPageChange,
  activeTool,
  penColor,
  penSize,
  penOpacity,
  eraserSize,
  highlightColorHex,
  highlightColor,
  boxColor,
  boxConfig,
  onUpdateBoxConfig,
  highlights,
  textNotes,
  drawings,
  boxes,
  freeTexts,
  selectedIds,
  onSelect,
  onTextSelected,
  onAddHighlight,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onAddBox,
  onUpdateBox,
  onDeleteBox,
  onAddFreeText,
  onUpdateFreeText,
  onDeleteFreeText,
  onDeleteHighlight,
  onUpdateHighlight,
  onUpdateHighlightNote,
  onUpdateHighlightColor,
  onAddStroke,
  onUpdateStroke,
  onDeleteStroke,
  onActiveToolChange,
}) => {
  const pagesArray = useMemo(() => Array.from({ length: totalPages }, (_, i) => i + 1), [totalPages]);
  const [activeGesturingPage, setActiveGesturingPage] = useState<number | null>(null);
  const [activeInteractionPage, setActiveInteractionPage] = useState<number | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const pageElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const currentPageRef = useRef(currentPage);
  const onPageChangeRef = useRef(onPageChange);
  currentPageRef.current = currentPage;
  onPageChangeRef.current = onPageChange;

  const seedPages = () => new Set(Array.from({ length: 3 }, (_, index) => currentPage - 1 + index)
    .filter((page) => page >= 1 && page <= totalPages));
  const [renderedPages, setRenderedPages] = useState<Set<number>>(seedPages);
  const reportedPageRef = useRef<number | null>(null);
  const positioningRef = useRef(true);
  const zoomScrollRef = useRef(false);
  useLayoutEffect(() => {
    if (!currentPage || reportedPageRef.current === currentPage) return;
    const container = wrapperRef.current?.closest<HTMLElement>('.pdf-viewport-container');
    const target = pageElementsRef.current.get(currentPage);
    if (!container || !target) return;
    positioningRef.current = true;
    setRenderedPages((previous) => previous.has(currentPage) ? previous : new Set([...previous, currentPage]));
    container.scrollTop += target.getBoundingClientRect().top - container.getBoundingClientRect().top - parseFloat(getComputedStyle(container).paddingTop);
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => { positioningRef.current = false; });
    });
    return () => cancelAnimationFrame(frame);
  }, [fileId, currentPage]);

  // IntersectionObserver & Scroll Listener for continuous scroll loading & page tracker
  useEffect(() => {
    const scrollParent = wrapperRef.current?.closest('.pdf-viewport-container') as HTMLElement | null;
    const nearbyPageNumbers = new Set<number>();
    const startZoom = () => { zoomScrollRef.current = true; };
    const userScroll = (event: Event) => {
      if (event instanceof WheelEvent && event.ctrlKey) return;
      zoomScrollRef.current = false;
    };
    scrollParent?.addEventListener('pdf-zoom-start', startZoom);
    scrollParent?.addEventListener('wheel', userScroll, { passive: true });
    scrollParent?.addEventListener('pointerdown', userScroll, { passive: true });
    scrollParent?.addEventListener('touchstart', userScroll, { passive: true });

    const mountNearbyPages = () => {
      if (scrollParent?.dataset.zoomGesture === 'true') return;
      setRenderedPages((previous) => {
        const next = new Set(previous);
        nearbyPageNumbers.forEach((page) => next.add(page));
        return next.size === previous.size ? previous : next;
      });
    };
    scrollParent?.addEventListener('pdf-zoom-end', mountNearbyPages);
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const pageNumber = Number((entry.target as HTMLElement).dataset.continuousPage);
        if (!pageNumber) return;
        if (entry.isIntersecting) {
          nearbyPageNumbers.add(pageNumber);
        } else {
          nearbyPageNumbers.delete(pageNumber);
        }
      });
      mountNearbyPages();
      handleScroll();
    }, { root: scrollParent, rootMargin: '1200px 0px', threshold: 0 });
    pageElementsRef.current.forEach((element) => observer.observe(element));

    let scrollRaf: number | null = null;
    const handleScroll = () => {
      if (scrollRaf !== null) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = null;
        if (!scrollParent || positioningRef.current || zoomScrollRef.current || scrollParent.dataset.zoomGesture === 'true') return;

        const containerRect = scrollParent.getBoundingClientRect();
        const viewportCenter = containerRect.top + containerRect.height / 2;
        let closestPage = 1;
        let minDistance = Infinity;
        let currentDistance = Infinity;
        const candidates = nearbyPageNumbers.size ? nearbyPageNumbers : new Set([currentPageRef.current || 1]);
        candidates.forEach((pageNum) => {
          const el = pageElementsRef.current.get(pageNum);
          if (!el) return;
          const rect = el.getBoundingClientRect();
          const pageCenter = rect.top + rect.height / 2;
          const dist = Math.abs(pageCenter - viewportCenter);
          if (pageNum === currentPageRef.current) currentDistance = dist;
          if (dist < minDistance) {
            minDistance = dist;
            closestPage = pageNum;
          }
        });

        // Retain the current page in the narrow tie region between adjacent
        // pages. Subpixel/layout updates must not repeatedly flip the tracker.
        if (closestPage !== currentPageRef.current && currentDistance - minDistance < 12) {
          closestPage = currentPageRef.current;
        }
        if (onPageChangeRef.current && closestPage) {
          reportedPageRef.current = closestPage;
          if (closestPage !== currentPageRef.current) onPageChangeRef.current(closestPage);
        }
      });
    };

    const targetScroll = scrollParent || window;
    targetScroll.addEventListener('scroll', handleScroll, { passive: true });
    const initialRaf = requestAnimationFrame(handleScroll);

    return () => {
      targetScroll.removeEventListener('scroll', handleScroll);
      observer.disconnect();
      scrollParent?.removeEventListener('pdf-zoom-end', mountNearbyPages);
      scrollParent?.removeEventListener('pdf-zoom-start', startZoom);
      scrollParent?.removeEventListener('wheel', userScroll);
      scrollParent?.removeEventListener('pointerdown', userScroll);
      scrollParent?.removeEventListener('touchstart', userScroll);
      if (scrollRaf !== null) cancelAnimationFrame(scrollRaf);
      cancelAnimationFrame(initialRaf);
    };
  }, [fileId, totalPages]);

  useEffect(() => {
    const handleElevate = (e: any) => {
      const pNum = e.detail?.pageNumber;
      if (pNum) {
        setActiveGesturingPage(pNum);
        setActiveInteractionPage(pNum);
      }
    };
    const handleReset = (e: any) => {
      setActiveGesturingPage(null);
      const pNum = e.detail?.pageNumber;
      if (pNum) {
        setActiveInteractionPage(pNum);
      }
    };
    const handleActivated = (e: any) => {
      const pNum = e.detail?.pageNumber;
      if (pNum) {
        setActiveInteractionPage(pNum);
      }
    };

    window.addEventListener('page-elevate', handleElevate);
    window.addEventListener('page-reset', handleReset);
    window.addEventListener('page-activated', handleActivated);

    return () => {
      window.removeEventListener('page-elevate', handleElevate);
      window.removeEventListener('page-reset', handleReset);
      window.removeEventListener('page-activated', handleActivated);
    };
  }, []);

  const defaultDim = pageDimensionCache.get(`${fileId}_default`) || { width: 595, height: 842 };

  return (
    <div
      ref={wrapperRef}
      style={{ gap: CONTINUOUS_GAP }}
      className="flex flex-col items-center justify-center mx-auto"
    >
      {pagesArray.map((pageNum) => {
        const cachedDim = pageDimensionCache.get(`${fileId}_${pageNum}`) || defaultDim;
        const estimatedW = Math.max(1, cachedDim.width * scale);
        const estimatedH = Math.max(1, cachedDim.height * scale);

        const hasOpenNote = textNotes.some((n) => n.pageNumber === pageNum && !n.isMinimized);
        const hasSelectedAnnotation = Boolean(
          selectedIds && selectedIds.length > 0 && (
            freeTexts.some((t) => t.pageNumber === pageNum && selectedIds.includes(t.id)) ||
            textNotes.some((n) => n.pageNumber === pageNum && selectedIds.includes(n.id)) ||
            boxes.some((b) => b.pageNumber === pageNum && selectedIds.includes(b.id))
          )
        );
        const isGesturing = activeGesturingPage === pageNum;
        const isActivePage = activeInteractionPage === pageNum;
        const pageZIndex = isGesturing
          ? 9999
          : hasSelectedAnnotation
          ? 500
          : hasOpenNote
          ? 200
          : isActivePage
          ? 30
          : 10;

        const isMounted = renderedPages.has(pageNum);

        return (
          <div
            key={`continuous-page-${fileId}-${pageNum}`}
            ref={(el) => {
              if (el) {
                pageElementsRef.current.set(pageNum, el);
              } else {
                pageElementsRef.current.delete(pageNum);
              }
            }}
            data-continuous-page={pageNum}
            className="rounded-none relative overflow-visible"
            style={{
              zIndex: pageZIndex,
              '--pdf-page-width': `${estimatedW}px`,
              '--pdf-page-height': `${estimatedH}px`,
              width: isMounted ? undefined : 'calc(var(--pdf-page-width) * var(--pdf-live-zoom, 1))',
              height: isMounted ? undefined : 'calc(var(--pdf-page-height) * var(--pdf-live-zoom, 1))',
              flexShrink: 0,
            } as React.CSSProperties}
            onPointerDownCapture={() => {
              if (!activeGesturingPage) setActiveInteractionPage(pageNum);
            }}
            onMouseDownCapture={() => {
              if (!activeGesturingPage) setActiveInteractionPage(pageNum);
            }}
          >
            {isMounted ? (
              <PDFPageView
                fileId={fileId}
                visualViewportScale={visualViewportScale}
                pdfDoc={pdfDoc}
                pageNumber={pageNum}
                scale={scale}
                activeTool={activeTool}
                penColor={penColor}
                penSize={penSize}
                penOpacity={penOpacity}
                eraserSize={eraserSize}
                highlightColorHex={highlightColorHex}
                highlightColor={highlightColor}
                boxColor={boxColor}
                boxConfig={boxConfig}
                onUpdateBoxConfig={onUpdateBoxConfig}
                highlights={highlights}
                textNotes={textNotes}
                drawings={drawings}
                boxes={boxes}
                freeTexts={freeTexts}
                selectedIds={selectedIds}
                onSelect={onSelect}
                onTextSelected={onTextSelected}
                onAddHighlight={onAddHighlight}
                onAddNote={onAddNote}
                onUpdateNote={onUpdateNote}
                onDeleteNote={onDeleteNote}
                onAddBox={onAddBox}
                onUpdateBox={onUpdateBox}
                onDeleteBox={onDeleteBox}
                onAddFreeText={onAddFreeText}
                onUpdateFreeText={onUpdateFreeText}
                onDeleteFreeText={onDeleteFreeText}
                onDeleteHighlight={onDeleteHighlight}
                onUpdateHighlight={onUpdateHighlight}
                onUpdateHighlightNote={onUpdateHighlightNote}
                onUpdateHighlightColor={onUpdateHighlightColor}
                onAddStroke={onAddStroke}
                onUpdateStroke={onUpdateStroke}
                onDeleteStroke={onDeleteStroke}
                onActiveToolChange={onActiveToolChange}
                isBookMode={false}
                bookPageSide="single"
                totalPages={totalPages}
              />
            ) : (
              <div
                style={{
                  width: 'calc(var(--pdf-page-width) * var(--pdf-live-zoom, 1))',
                  height: 'calc(var(--pdf-page-height) * var(--pdf-live-zoom, 1))',
                }}
                className="bg-white/95 rounded-none shadow-md flex flex-col items-center justify-center text-neutral-300 font-sans text-xs select-none border border-neutral-100"
              >
                <div className="w-8 h-8 rounded-full border-2 border-neutral-200 border-t-neutral-400 animate-spin mb-2" />
                <span className="text-neutral-400 font-medium">Trang {pageNum}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const ContinuousView = React.memo(ContinuousViewComponent);
