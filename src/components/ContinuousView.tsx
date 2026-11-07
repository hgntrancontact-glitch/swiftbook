import React, { useRef, useState, useEffect, useMemo } from 'react';
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
  const [activeSpreadPage, setActiveSpreadPage] = useState<number | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const pageElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const isUserScrollingRef = useRef<boolean>(false);
  const scrollTimeoutRef = useRef<any>(null);

  // Render near the current view first. Mounting dozens of canvas pages at once
  // makes large PDFs slow and can starve the pages the reader is looking at.
  const initialPageCount = Math.min(2, totalPages);
  const [renderedPages, setRenderedPages] = useState<Set<number>>(() => {
    const initial = new Set<number>();
    for (let i = 1; i <= initialPageCount; i++) {
      initial.add(i);
    }
    return initial;
  });

  // Mount pages on demand, then retain their canvas so scrolling back does not
  // flash a blank page while PDF.js renders it again.
  useEffect(() => {
    const initial = new Set<number>();
    for (let page = 1; page <= initialPageCount; page++) initial.add(page);
    setRenderedPages(initial);
  }, [fileId, initialPageCount]);

  // Synchronize external currentPage jumps (e.g. from header input, TOC bookmark click)
  useEffect(() => {
    if (!currentPage || isUserScrollingRef.current) return;
    const targetEl = pageElementsRef.current.get(currentPage);
    if (targetEl) {
      setRenderedPages((prev) => {
        if (prev.has(currentPage)) return prev;
        const next = new Set(prev);
        next.add(currentPage);
        return next;
      });
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [currentPage]);

  // IntersectionObserver & Scroll Listener for continuous scroll loading & page tracker
  useEffect(() => {
    const scrollParent = wrapperRef.current?.closest('.pdf-viewport-container') as HTMLElement | null;

    let scrollRaf: number | null = null;
    const handleScroll = () => {
      if (scrollRaf !== null) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = null;
        if (!scrollParent) return;

        const containerRect = scrollParent.getBoundingClientRect();
        const viewportCenter = containerRect.top + containerRect.height / 2;
        const nearbyPages = new Set<number>();

        let closestPage = 1;
        let minDistance = Infinity;

        pageElementsRef.current.forEach((el, pageNum) => {
          const rect = el.getBoundingClientRect();
          // Prepare nearby pages before they enter the viewport.
          if (rect.bottom >= containerRect.top - 1200 && rect.top <= containerRect.bottom + 1200) {
            nearbyPages.add(pageNum);
          }

          // Track page closest to viewport center
          const pageCenter = rect.top + rect.height / 2;
          const dist = Math.abs(pageCenter - viewportCenter);
          if (dist < minDistance) {
            minDistance = dist;
            closestPage = pageNum;
          }
        });

        setRenderedPages((prev) => {
          let changed = false;
          const next = new Set(prev);
          nearbyPages.forEach((page) => {
            if (!next.has(page)) {
              next.add(page);
              changed = true;
            }
          });
          return changed ? next : prev;
        });

        if (onPageChange && closestPage) {
          isUserScrollingRef.current = true;
          onPageChange(closestPage);
          clearTimeout(scrollTimeoutRef.current);
          scrollTimeoutRef.current = setTimeout(() => {
            isUserScrollingRef.current = false;
          }, 400);
        }
      });
    };

    const targetScroll = scrollParent || window;
    targetScroll.addEventListener('scroll', handleScroll, { passive: true });
    const initialRaf = requestAnimationFrame(handleScroll);

    return () => {
      targetScroll.removeEventListener('scroll', handleScroll);
      if (scrollRaf !== null) cancelAnimationFrame(scrollRaf);
      cancelAnimationFrame(initialRaf);
      clearTimeout(scrollTimeoutRef.current);
    };
  }, [fileId, totalPages, onPageChange]);

  useEffect(() => {
    const handleElevate = (e: any) => {
      const pNum = e.detail?.pageNumber;
      if (pNum) {
        setActiveGesturingPage(pNum);
        setActiveSpreadPage(pNum);
      }
    };
    const handleReset = (e: any) => {
      setActiveGesturingPage(null);
      const pNum = e.detail?.pageNumber;
      if (pNum) {
        setActiveSpreadPage(pNum);
      }
    };
    const handleActivated = (e: any) => {
      const pNum = e.detail?.pageNumber;
      if (pNum) {
        setActiveSpreadPage(pNum);
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
      className="flex flex-col items-center justify-center gap-6 px-4 my-auto mx-auto"
    >
      {pagesArray.map((pageNum) => {
        const cachedDim = pageDimensionCache.get(`${fileId}_${pageNum}`) || defaultDim;
        const estimatedW = Math.max(1, Math.round(cachedDim.width * scale));
        const estimatedH = Math.max(1, Math.round(cachedDim.height * scale));

        const hasOpenNote = textNotes.some((n) => n.pageNumber === pageNum && !n.isMinimized);
        const hasSelectedAnnotation = Boolean(
          selectedIds && selectedIds.length > 0 && (
            freeTexts.some((t) => t.pageNumber === pageNum && selectedIds.includes(t.id)) ||
            textNotes.some((n) => n.pageNumber === pageNum && selectedIds.includes(n.id)) ||
            boxes.some((b) => b.pageNumber === pageNum && selectedIds.includes(b.id))
          )
        );
        const isGesturing = activeGesturingPage === pageNum;
        const isHovered = activeSpreadPage === pageNum;
        const pageZIndex = isGesturing
          ? 9999
          : hasSelectedAnnotation
          ? 500
          : hasOpenNote
          ? 200
          : isHovered
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
            className="shadow-2xl rounded-none relative overflow-visible"
            style={{
              zIndex: pageZIndex,
              minWidth: `${estimatedW}px`,
              minHeight: `${estimatedH}px`,
              contentVisibility: 'auto',
              containIntrinsicSize: `${estimatedW}px ${estimatedH}px`,
            }}
            onMouseEnter={() => {
              if (!activeGesturingPage) setActiveSpreadPage(pageNum);
            }}
            onPointerDownCapture={() => {
              if (!activeGesturingPage) setActiveSpreadPage(pageNum);
            }}
            onMouseDownCapture={() => {
              if (!activeGesturingPage) setActiveSpreadPage(pageNum);
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
                  width: `${estimatedW}px`,
                  height: `${estimatedH}px`,
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
