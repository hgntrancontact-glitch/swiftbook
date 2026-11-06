import React, { useRef, useState, useEffect, useLayoutEffect, useMemo } from 'react';
import {
  WorkspaceDoc,
  ActiveTool,
  HighlightColor,
  BoxConfig,
  HIGHLIGHT_COLORS,
  NormalizedRect,
  HighlightAnnotation,
  TextNoteAnnotation,
  BoxAnnotation,
  FreeTextAnnotation,
  DrawingStroke,
} from '../types';
import { BookSpreadView } from './BookSpreadView';
import { PDFPageView } from './PDFPageView';
import { ContinuousView } from './ContinuousView';
import { ChevronLeft, ChevronRight, FileText, CheckCircle2 } from 'lucide-react';

interface PDFWorkspaceColumnProps {
  doc: WorkspaceDoc;
  isActive: boolean;
  totalVisibleDocs: number;
  activeTool: ActiveTool;
  penColor: string;
  penSize: number;
  penOpacity: number;
  eraserSize: number;
  highlightColor: HighlightColor;
  boxColor: string;
  boxConfig: BoxConfig;
  onActivate: (docId: string) => void;
  onPageChange: (docId: string, page: number) => void;
  onZoomChange: (docId: string, scale: number, resetFitMode?: boolean) => void;
  onUpdateBoxConfig: (docId: string, updates: Partial<BoxConfig>) => void;
  onTextSelected: (
    docId: string,
    pageNumber: number,
    text: string,
    rects: NormalizedRect[],
    clientPos: { x: number; y: number }
  ) => void;
  onAddHighlight: (docId: string, highlight: HighlightAnnotation) => void;
  onAddNote: (docId: string, note: Omit<TextNoteAnnotation, 'id' | 'createdAt'>) => void;
  onUpdateNote: (docId: string, id: string, updates: Partial<TextNoteAnnotation>, skipHistory?: boolean) => void;
  onDeleteNote: (docId: string, id: string) => void;
  onAddBox: (docId: string, box: Omit<BoxAnnotation, 'id' | 'createdAt'>) => void;
  onUpdateBox: (docId: string, id: string, updates: Partial<BoxAnnotation>, skipHistory?: boolean) => void;
  onDeleteBox: (docId: string, id: string) => void;
  onAddFreeText: (docId: string, text: Omit<FreeTextAnnotation, 'id' | 'createdAt'>) => void;
  onUpdateFreeText: (docId: string, id: string, updates: Partial<FreeTextAnnotation>, skipHistory?: boolean) => void;
  onDeleteFreeText: (docId: string, id: string) => void;
  onDeleteHighlight: (docId: string, id: string) => void;
  onUpdateHighlight: (docId: string, id: string, updates: Partial<HighlightAnnotation>, skipHistory?: boolean) => void;
  onUpdateHighlightNote: (docId: string, id: string, note: string) => void;
  onUpdateHighlightColor: (docId: string, id: string, color: HighlightColor) => void;
  onAddStroke: (docId: string, stroke: Omit<DrawingStroke, 'id' | 'createdAt'>) => string;
  onUpdateStroke: (docId: string, id: string, updates: Partial<DrawingStroke>, skipHistory?: boolean) => void;
  onDeleteStroke: (docId: string, id: string) => void;
  onActiveToolChange: (tool: ActiveTool) => void;
  onSelect: (docId: string, id: string, isShift: boolean) => void;
  onClearSelection: (docId: string) => void;
}

const PDFWorkspaceColumnComponent: React.FC<PDFWorkspaceColumnProps> = ({
  doc,
  isActive,
  totalVisibleDocs,
  activeTool,
  penColor,
  penSize,
  penOpacity,
  eraserSize,
  highlightColor,
  boxColor,
  boxConfig,
  onActivate,
  onPageChange,
  onZoomChange,
  onUpdateBoxConfig,
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
  onSelect,
  onClearSelection,
}) => {
  const containerRef = useRef<HTMLElement>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);

  // ResizeObserver for this specific PDF's container to scale accurately
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let timeoutId: any;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        const newHeight = entry.contentRect.height;
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          setContainerSize((prev) => {
            if (
              prev &&
              Math.abs(prev.width - newWidth) < 2 &&
              Math.abs(prev.height - newHeight) < 2
            ) {
              return prev;
            }
            return { width: newWidth, height: newHeight };
          });
        }, 30);
      }
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(timeoutId);
    };
  }, []);

  // Butter-smooth pinch-to-zoom for this specific PDF viewport
  const scaleRef = useRef<number>(doc.scale);
  scaleRef.current = doc.scale;
  const pendingZoomScrollRef = useRef<{
    pointOnW_X: number;
    pointOnW_Y: number;
    ratio: number;
    cursorViewportX: number;
    cursorViewportY: number;
    reset?: boolean;
  } | null>(null);

  useLayoutEffect(() => {
    if (pendingZoomScrollRef.current && containerRef.current) {
      const pending = pendingZoomScrollRef.current;
      pendingZoomScrollRef.current = null;
      const c = containerRef.current;
      if (pending.reset) {
        c.scrollLeft = 0;
        c.scrollTop = 0;
        return;
      }
      const w = document.getElementById(`pdf-transform-wrapper-${doc.id}`);
      if (c && w) {
        const new_cRect = c.getBoundingClientRect();
        const new_wRect = w.getBoundingClientRect();
        const new_w_offset_X = new_wRect.left - new_cRect.left + c.scrollLeft;
        const new_w_offset_Y = new_wRect.top - new_cRect.top + c.scrollTop;
        const newPointOnW_X = pending.pointOnW_X * pending.ratio;
        const newPointOnW_Y = pending.pointOnW_Y * pending.ratio;
        c.scrollLeft = Math.max(0, (new_w_offset_X + newPointOnW_X) - pending.cursorViewportX);
        c.scrollTop = Math.max(0, (new_w_offset_Y + newPointOnW_Y) - pending.cursorViewportY);
      }
    }
  }, [doc.scale, doc.id]);

  // Reset horizontal panning when zoom returns to its fitted 100% baseline.
  useEffect(() => {
    if (doc.fitMode && containerRef.current) {
      containerRef.current.scrollLeft = 0;
    }
  }, [doc.fitMode, doc.id]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let targetZoomScale = scaleRef.current || 1.0;
    let targetClientX: number | null = null;
    let targetClientY: number | null = null;
    let rafId: number | null = null;

    const applyZoomFrame = () => {
      rafId = null;
      const c = containerRef.current;
      const w = document.getElementById(`pdf-transform-wrapper-${doc.id}`);
      if (!c || !w) return;

      const curScale = scaleRef.current || 1.0;
      const nextScale = Math.max(0.2, targetZoomScale);
      if (Math.abs(nextScale - curScale) < 0.0001) return;

      const cRect = c.getBoundingClientRect();
      const wRect = w.getBoundingClientRect();

      const clientX = targetClientX ?? cRect.left + cRect.width / 2;
      const clientY = targetClientY ?? cRect.top + cRect.height / 2;

      const cursorViewportX = clientX - cRect.left;
      const cursorViewportY = clientY - cRect.top;
      const pointOnW_X = clientX - wRect.left;
      const pointOnW_Y = clientY - wRect.top;
      const ratio = nextScale / curScale;

      pendingZoomScrollRef.current = {
        pointOnW_X,
        pointOnW_Y,
        ratio,
        cursorViewportX,
        cursorViewportY,
      };

      scaleRef.current = nextScale;
      targetZoomScale = nextScale;
      onZoomChange(doc.id, nextScale);
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();

        let deltaY = e.deltaY;
        if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) deltaY *= 16;
        else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) deltaY *= container.clientHeight;
        deltaY = Math.max(-80, Math.min(80, deltaY));
        targetZoomScale = Math.max(0.2, targetZoomScale * Math.exp(-deltaY * 0.0012));

        targetClientX = e.clientX;
        targetClientY = e.clientY;

        if (rafId === null) {
          rafId = requestAnimationFrame(applyZoomFrame);
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [doc.id, onZoomChange]);

  // Compute adaptive base scale for this column
  const baseScale = useMemo(() => {
    if (!doc.basePageDimensions) return 1.0;
    const availableHeight = containerSize?.height || 700;
    const targetHeight = Math.max(10, availableHeight - 40);
    const scaleForHeight = targetHeight / doc.basePageDimensions.height;

    const availableWidth = containerSize?.width || 600;
    const isDoubleSpread = doc.viewMode === 'double' && doc.totalPages > 1;
    const spreadMultiplier = isDoubleSpread ? 2 : 1;
    const scaleForWidth = Math.max(10, availableWidth - 20) / (doc.basePageDimensions.width * spreadMultiplier);

    if (doc.viewMode === 'continuous') {
      return Math.max(0.05, Math.min(scaleForWidth, 1.6));
    }

    return Math.max(0.05, Math.min(scaleForHeight, scaleForWidth));
  }, [doc.basePageDimensions, containerSize, doc.viewMode, doc.totalPages]);

  const actualScale = baseScale * doc.scale;

  const columnRootRef = useRef<HTMLDivElement>(null);
  const [isInViewport, setIsInViewport] = useState<boolean>(true);
  const hasRenderedOnceRef = useRef<boolean>(false);

  // IntersectionObserver for performance virtualization on offscreen PDF columns
  useEffect(() => {
    const el = columnRootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const parentWorkspace = document.getElementById('multi-pdf-workspace-container');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setIsInViewport(entry.isIntersecting);
          if (entry.isIntersecting) {
            hasRenderedOnceRef.current = true;
          }
        }
      },
      {
        root: parentWorkspace || null,
        rootMargin: '800px 800px 800px 800px',
        threshold: 0.01,
      }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  const handleActivateThisColumn = () => {
    onActivate(doc.id);
  };

  return (
    <div
      ref={columnRootRef}
      data-workspace-doc={doc.id}
      onClick={handleActivateThisColumn}
      onPointerDownCapture={handleActivateThisColumn}
      onMouseDownCapture={handleActivateThisColumn}
      className={`h-full relative flex flex-col bg-[#fafafa] transition-all select-none ${
        totalVisibleDocs > 1
          ? 'w-[50%] min-w-[50%] max-w-[50%] flex-[0_0_50%] shrink-0 border-r border-neutral-300/80 last:border-r-0'
          : 'w-full flex-1'
      } ${
        isActive && totalVisibleDocs > 1
          ? 'ring-1 ring-neutral-400/70 z-10'
          : ''
      }`}
      style={{
        display: doc.isHidden ? 'none' : 'flex',
        contentVisibility: isInViewport || isActive ? 'visible' : 'auto',
        scrollSnapAlign: totalVisibleDocs > 1 ? 'start' : undefined,
        scrollSnapStop: totalVisibleDocs > 1 ? 'always' : undefined,
      }}
    >
      {/* Column Mini Sub-Header when viewing multiple PDFs */}
      {totalVisibleDocs > 1 && (
        <div
          className={`h-7 px-3 flex items-center justify-between text-xs border-b transition-colors shrink-0 ${
            isActive
              ? 'bg-neutral-200/80 text-neutral-900 border-neutral-300 font-medium'
              : 'bg-neutral-100 text-neutral-600 border-neutral-200'
          }`}
        >
          <div className="flex items-center gap-1.5 truncate max-w-[70%]">
            <FileText size={12} className={isActive ? 'text-neutral-900' : 'text-neutral-500'} />
            <span className="truncate font-semibold text-xs" title={doc.fileName}>
              {doc.fileName}
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px] shrink-0">
            <span className="text-neutral-500 font-normal">
              Trang {doc.currentPage}/{doc.totalPages}
            </span>
            {isActive ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#f5c41a] text-neutral-950 leading-none shadow-xs">
                <CheckCircle2 size={10} className="text-neutral-950" />
                <span>Đang chọn</span>
              </span>
            ) : (
              <span className="text-[10px] text-neutral-400 font-normal">
                Nhấp để chọn
              </span>
            )}
          </div>
        </div>
      )}

      {/* Main Viewport Container */}
      <main
        ref={containerRef}
        className="pdf-viewport-container w-full h-full relative min-h-0 no-scrollbar box-border pt-4 pb-24 px-3 sm:px-4"
        style={{
          overflowX: 'auto',
          overflowY: 'auto',
          overscrollBehaviorX: 'contain',
        }}
        onWheelCapture={(e) => {
          if (e.ctrlKey || e.metaKey) return;
          const viewport = e.currentTarget;
          const hasHorizontalOverflow = viewport.scrollWidth > viewport.clientWidth + 1;
          const horizontalDelta = e.deltaX || (e.shiftKey ? e.deltaY : 0);
          if (!hasHorizontalOverflow || horizontalDelta === 0) return;

          e.stopPropagation();
          if (e.shiftKey && e.deltaX === 0) {
            e.preventDefault();
            viewport.scrollLeft += e.deltaY;
          }
        }}
        onPointerDownCapture={handleActivateThisColumn}
        onMouseDownCapture={handleActivateThisColumn}
        onClick={(e) => {
          handleActivateThisColumn();
          if (e.button === 0 && !e.shiftKey) {
            const el = e.target instanceof Element ? e.target : (e.target as Node | null)?.parentElement;
            const isInteractive = Boolean(
              el?.closest?.(
                '.free-text-item-container, .box-floating-toolbar, [id^="box-"], .sticky-note-paper, [id^="sticky-"], [id^="hl-"], #smart-shape-handles, .stroke-vector-group, button, input, textarea, .ft-toolbar, .ft-link-card-popover, .lark-floating-toolbar, nav, header, .unified-group-toolbar, .floating-submenu'
              )
            );
            if (!isInteractive) {
              onClearSelection(doc.id);
            }
          }
        }}
      >
        <div className="w-max min-w-full min-h-full flex flex-col justify-start items-start">
          <div
            id={`pdf-transform-wrapper-${doc.id}`}
            data-scale={actualScale}
            className="pdf-hardware-accelerated flex flex-col relative shrink-0 m-auto"
            style={{ width: 'fit-content' }}
          >
            {(isInViewport || isActive || hasRenderedOnceRef.current) ? (
              doc.viewMode === 'double' ? (
                <BookSpreadView
                  key={`${doc.id}_double`}
                  fileId={doc.fileId}
                  visualViewportScale={1}
                  pdfDoc={doc.pdfDoc}
                  currentPage={doc.currentPage}
                  totalPages={doc.totalPages}
                  scale={actualScale}
                  activeTool={activeTool}
                  penColor={penColor}
                  penSize={penSize}
                  penOpacity={penOpacity}
                  eraserSize={eraserSize}
                  highlightColorHex={HIGHLIGHT_COLORS[highlightColor].hex}
                  highlightColor={highlightColor}
                  boxColor={boxColor}
                  boxConfig={boxConfig}
                  onUpdateBoxConfig={(updates) => onUpdateBoxConfig(doc.id, updates)}
                  highlights={doc.highlights}
                  textNotes={doc.textNotes}
                  drawings={doc.drawings}
                  boxes={doc.boxes}
                  freeTexts={doc.freeTexts}
                  selectedIds={doc.selectedIds.length > 0 ? doc.selectedIds : undefined}
                  onSelect={(id, isShift) => onSelect(doc.id, id, isShift)}
                  onPageChange={(p) =>
                    onPageChange(doc.id, Math.max(1, Math.min(doc.totalPages, p)))
                  }
                  onTextSelected={(pageNumber, text, rects, clientPos) =>
                    onTextSelected(doc.id, pageNumber, text, rects, clientPos)
                  }
                  onAddHighlight={(h) => onAddHighlight(doc.id, h)}
                  onAddNote={(n) => onAddNote(doc.id, n)}
                  onUpdateNote={(id, u, s) => onUpdateNote(doc.id, id, u, s)}
                  onDeleteNote={(id) => onDeleteNote(doc.id, id)}
                  onAddBox={(b) => onAddBox(doc.id, b)}
                  onUpdateBox={(id, u, s) => onUpdateBox(doc.id, id, u, s)}
                  onDeleteBox={(id) => onDeleteBox(doc.id, id)}
                  onAddFreeText={(t) => onAddFreeText(doc.id, t)}
                  onUpdateFreeText={(id, u, s) => onUpdateFreeText(doc.id, id, u, s)}
                  onDeleteFreeText={(id) => onDeleteFreeText(doc.id, id)}
                  onDeleteHighlight={(id) => onDeleteHighlight(doc.id, id)}
                  onUpdateHighlight={(id, u, s) => onUpdateHighlight(doc.id, id, u, s)}
                  onUpdateHighlightNote={(id, note) => onUpdateHighlightNote(doc.id, id, note)}
                  onUpdateHighlightColor={(id, color) => onUpdateHighlightColor(doc.id, id, color)}
                  onAddStroke={(s) => onAddStroke(doc.id, s)}
                  onUpdateStroke={(id, u, s) => onUpdateStroke(doc.id, id, u, s)}
                  onDeleteStroke={(id) => onDeleteStroke(doc.id, id)}
                  onActiveToolChange={onActiveToolChange}
                />
              ) : doc.viewMode === 'single' ? (
                <div className="relative flex items-center justify-center my-auto mx-auto text-left">
                  {/* Previous Page Button */}
                  <button
                    onClick={() => onPageChange(doc.id, Math.max(1, doc.currentPage - 1))}
                    disabled={doc.currentPage <= 1}
                    className="absolute left-2 top-1/2 -translate-y-1/2 z-[60000] pointer-events-auto w-9 h-9 rounded-full bg-white/95 border border-neutral-300 shadow-lg text-neutral-800 hover:bg-neutral-900 hover:text-white disabled:opacity-20 disabled:pointer-events-none transition-all flex items-center justify-center cursor-pointer"
                    title="Trang trước (←)"
                  >
                    <ChevronLeft size={20} />
                  </button>

                  <PDFPageView
                    key={`${doc.id}_${doc.currentPage}`}
                    fileId={doc.fileId}
                    visualViewportScale={1}
                    pdfDoc={doc.pdfDoc}
                    pageNumber={doc.currentPage}
                    scale={actualScale}
                    activeTool={activeTool}
                    penColor={penColor}
                    penSize={penSize}
                    penOpacity={penOpacity}
                    eraserSize={eraserSize}
                    highlightColorHex={HIGHLIGHT_COLORS[highlightColor].hex}
                    highlightColor={highlightColor}
                    boxColor={boxColor}
                    boxConfig={boxConfig}
                    onUpdateBoxConfig={(updates) => onUpdateBoxConfig(doc.id, updates)}
                    highlights={doc.highlights}
                    textNotes={doc.textNotes}
                    drawings={doc.drawings}
                    boxes={doc.boxes}
                    freeTexts={doc.freeTexts}
                    selectedIds={doc.selectedIds.length > 0 ? doc.selectedIds : undefined}
                    onSelect={(id, isShift) => onSelect(doc.id, id, isShift)}
                    onTextSelected={(pageNumber, text, rects, clientPos) =>
                      onTextSelected(doc.id, pageNumber, text, rects, clientPos)
                    }
                    onAddHighlight={(h) => onAddHighlight(doc.id, h)}
                    onAddNote={(n) => onAddNote(doc.id, n)}
                    onUpdateNote={(id, u, s) => onUpdateNote(doc.id, id, u, s)}
                    onDeleteNote={(id) => onDeleteNote(doc.id, id)}
                    onAddBox={(b) => onAddBox(doc.id, b)}
                    onUpdateBox={(id, u, s) => onUpdateBox(doc.id, id, u, s)}
                    onDeleteBox={(id) => onDeleteBox(doc.id, id)}
                    onAddFreeText={(t) => onAddFreeText(doc.id, t)}
                    onUpdateFreeText={(id, u, s) => onUpdateFreeText(doc.id, id, u, s)}
                    onDeleteFreeText={(id) => onDeleteFreeText(doc.id, id)}
                    onDeleteHighlight={(id) => onDeleteHighlight(doc.id, id)}
                    onUpdateHighlight={(id, u, s) => onUpdateHighlight(doc.id, id, u, s)}
                    onUpdateHighlightNote={(id, note) => onUpdateHighlightNote(doc.id, id, note)}
                    onUpdateHighlightColor={(id, color) => onUpdateHighlightColor(doc.id, id, color)}
                    onAddStroke={(s) => onAddStroke(doc.id, s)}
                    onUpdateStroke={(id, u, s) => onUpdateStroke(doc.id, id, u, s)}
                    onDeleteStroke={(id) => onDeleteStroke(doc.id, id)}
                    onActiveToolChange={onActiveToolChange}
                    isBookMode={false}
                    bookPageSide="single"
                    totalPages={doc.totalPages}
                  />

                  {/* Next Page Button */}
                  <button
                    onClick={() => onPageChange(doc.id, Math.min(doc.totalPages, doc.currentPage + 1))}
                    disabled={doc.currentPage >= doc.totalPages}
                    className="absolute right-2 top-1/2 -translate-y-1/2 z-[60000] pointer-events-auto w-9 h-9 rounded-full bg-white/95 border border-neutral-300 shadow-lg text-neutral-800 hover:bg-neutral-900 hover:text-white disabled:opacity-20 disabled:pointer-events-none transition-all flex items-center justify-center cursor-pointer"
                    title="Trang sau (→)"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              ) : (
                <ContinuousView
                  key={`${doc.id}_continuous`}
                  fileId={doc.fileId}
                  visualViewportScale={1}
                  pdfDoc={doc.pdfDoc}
                  totalPages={doc.totalPages}
                  scale={actualScale}
                  currentPage={doc.currentPage}
                  onPageChange={(p) => onPageChange(doc.id, p)}
                  activeTool={activeTool}
                  penColor={penColor}
                  penSize={penSize}
                  penOpacity={penOpacity}
                  eraserSize={eraserSize}
                  highlightColorHex={HIGHLIGHT_COLORS[highlightColor].hex}
                  highlightColor={highlightColor}
                  boxColor={boxColor}
                  boxConfig={boxConfig}
                  onUpdateBoxConfig={(updates) => onUpdateBoxConfig(doc.id, updates)}
                  highlights={doc.highlights}
                  textNotes={doc.textNotes}
                  drawings={doc.drawings}
                  boxes={doc.boxes}
                  freeTexts={doc.freeTexts}
                  selectedIds={doc.selectedIds.length > 0 ? doc.selectedIds : undefined}
                  onSelect={(id, isShift) => onSelect(doc.id, id, isShift)}
                  onTextSelected={(pageNumber, text, rects, clientPos) =>
                    onTextSelected(doc.id, pageNumber, text, rects, clientPos)
                  }
                  onAddHighlight={(h) => onAddHighlight(doc.id, h)}
                  onAddNote={(n) => onAddNote(doc.id, n)}
                  onUpdateNote={(id, u, s) => onUpdateNote(doc.id, id, u, s)}
                  onDeleteNote={(id) => onDeleteNote(doc.id, id)}
                  onAddBox={(b) => onAddBox(doc.id, b)}
                  onUpdateBox={(id, u, s) => onUpdateBox(doc.id, id, u, s)}
                  onDeleteBox={(id) => onDeleteBox(doc.id, id)}
                  onAddFreeText={(t) => onAddFreeText(doc.id, t)}
                  onUpdateFreeText={(id, u, s) => onUpdateFreeText(doc.id, id, u, s)}
                  onDeleteFreeText={(id) => onDeleteFreeText(doc.id, id)}
                  onDeleteHighlight={(id) => onDeleteHighlight(doc.id, id)}
                  onUpdateHighlight={(id, u, s) => onUpdateHighlight(doc.id, id, u, s)}
                  onUpdateHighlightNote={(id, note) => onUpdateHighlightNote(doc.id, id, note)}
                  onUpdateHighlightColor={(id, color) => onUpdateHighlightColor(doc.id, id, color)}
                  onAddStroke={(s) => onAddStroke(doc.id, s)}
                  onUpdateStroke={(id, u, s) => onUpdateStroke(doc.id, id, u, s)}
                  onDeleteStroke={(id) => onDeleteStroke(doc.id, id)}
                  onActiveToolChange={onActiveToolChange}
                />
              )
            ) : (
              <div className="flex flex-col items-center justify-center p-12 text-neutral-400 text-xs gap-2 min-h-[400px]">
                <FileText size={32} className="opacity-30 animate-pulse" />
                <span className="font-medium text-neutral-500">{doc.fileName}</span>
                <span className="text-[11px] text-neutral-400">Trang {doc.currentPage}/{doc.totalPages}</span>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

function areColumnPropsEqual(
  prev: PDFWorkspaceColumnProps,
  next: PDFWorkspaceColumnProps
): boolean {
  if (prev.doc !== next.doc) return false;
  if (prev.isActive !== next.isActive) return false;
  if (prev.totalVisibleDocs !== next.totalVisibleDocs) return false;
  if (prev.activeTool !== next.activeTool) return false;
  if (prev.penColor !== next.penColor) return false;
  if (prev.penSize !== next.penSize) return false;
  if (prev.penOpacity !== next.penOpacity) return false;
  if (prev.eraserSize !== next.eraserSize) return false;
  if (prev.highlightColor !== next.highlightColor) return false;
  if (prev.boxColor !== next.boxColor) return false;
  if (prev.boxConfig !== next.boxConfig) {
    if (
      prev.boxConfig?.color !== next.boxConfig?.color ||
      prev.boxConfig?.borderWidth !== next.boxConfig?.borderWidth ||
      prev.boxConfig?.borderStyle !== next.boxConfig?.borderStyle ||
      prev.boxConfig?.hasBackground !== next.boxConfig?.hasBackground
    ) {
      return false;
    }
  }
  return true;
}

export const PDFWorkspaceColumn = React.memo(PDFWorkspaceColumnComponent, areColumnPropsEqual);
