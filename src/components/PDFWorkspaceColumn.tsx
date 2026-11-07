import React, { useRef, useState, useEffect, useLayoutEffect } from 'react';
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
import { PDFPageView, pageDimensionCache } from './PDFPageView';
import { fitPageScale, viewportPages, MIN_ZOOM, MAX_ZOOM, type PageSize } from '../utils/pdfViewport';
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
  const [safeBottomInset, setSafeBottomInset] = useState(24);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(doc.scale);
  const actionsRef = useRef({ onZoomChange, onActivate });
  actionsRef.current = { onZoomChange, onActivate };
  const gestureActiveRef = useRef(false);
  if (!gestureActiveRef.current) scaleRef.current = doc.scale;
  const panRef = useRef({ x: 0, y: 0 });
  type Anchor = { element: HTMLElement; x: number; y: number; clientX: number; clientY: number };
  const pendingAnchorRef = useRef<Anchor | null>(null);
  const gestureControllerRef = useRef<{ cancel: () => void } | null>(null);
  const releaseFrameRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      const width = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const dock = document.getElementById('bottom-toolbar-dock');
      // Reserve page space above the existing floating dock. The dock itself
      // keeps its layout and position; only the viewport's fit rectangle changes.
      const bottomInset = doc.viewMode !== 'continuous' && dock
        ? Math.max(24, element.getBoundingClientRect().bottom - dock.getBoundingClientRect().top + 12)
        : parseFloat(style.paddingBottom);
      if (doc.viewMode !== 'continuous') setSafeBottomInset((previous) => Math.abs(previous - bottomInset) < 0.5 ? previous : bottomInset);
      const height = element.clientHeight - parseFloat(style.paddingTop) - bottomInset;
      setContainerSize((previous) => previous && Math.abs(previous.width - width) < 0.5 && Math.abs(previous.height - height) < 0.5
        ? previous : { width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const dock = document.getElementById('bottom-toolbar-dock');
    if (dock) observer.observe(dock);
    return () => observer.disconnect();
  }, [doc.viewMode]);

  const layoutKey = `${doc.viewMode}:${viewportPages(doc.viewMode, doc.currentPage, doc.totalPages).join(',')}`;
  const [measuredPages, setMeasuredPages] = useState<{ key: string; pages: PageSize[] } | null>(null);
  const pages = measuredPages?.key === layoutKey ? measuredPages.pages : viewportPages(doc.viewMode, doc.currentPage, doc.totalPages)
    .map((page) => pageDimensionCache.get(`${doc.fileId}_${page}`) || doc.basePageDimensions || { width: 595, height: 842 });
  useEffect(() => {
    let cancelled = false;
    const numbers = viewportPages(doc.viewMode, doc.currentPage, doc.totalPages);
    Promise.all(numbers.map(async (number) => {
      const page = await doc.pdfDoc.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      const size = { width: viewport.width, height: viewport.height };
      pageDimensionCache.set(`${doc.fileId}_${number}`, size);
      return size;
    })).then((sizes) => {
      if (!cancelled) setMeasuredPages({ key: layoutKey, pages: sizes });
    }).catch((error) => console.warn('Could not measure current PDF pages', error));
    return () => { cancelled = true; };
  }, [doc.pdfDoc, doc.fileId, layoutKey]);
  const baseScale = fitPageScale(doc.viewMode, pages, containerSize?.width || 600, containerSize?.height || 600);
  const actualScale = baseScale * doc.scale;

  const clearLiveZoom = () => {
    wrapperRef.current?.style.removeProperty('--pdf-live-zoom');
  };
  const clearPan = () => {
    panRef.current = { x: 0, y: 0 };
    if (wrapperRef.current) wrapperRef.current.style.translate = '';
  };
  const captureAnchor = (clientX: number, clientY: number): Anchor | null => {
    const container = containerRef.current;
    if (!container) return null;
    let nearest: HTMLElement | null = null;
    let distance = Infinity;
    const hit = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-page-container="true"]');
    const allPages = hit && container.contains(hit) ? [hit]
      : [...container.querySelectorAll<HTMLElement>('[data-page-container="true"]')];
    let candidates = allPages;
    if (!hit && doc.viewMode === 'continuous' && allPages.length > 4) {
      // Continuous pages are ordered. Locate the gap/page under the pointer
      // without forcing geometry reads for every page visited in a long PDF.
      let low = 0;
      let high = allPages.length;
      while (low < high) {
        const middle = (low + high) >> 1;
        if (allPages[middle].getBoundingClientRect().bottom < clientY) low = middle + 1;
        else high = middle;
      }
      candidates = allPages.slice(Math.max(0, low - 1), low + 2);
    }
    candidates.forEach((page) => {
      const rect = page.getBoundingClientRect();
      const dx = Math.max(rect.left - clientX, 0, clientX - rect.right);
      const dy = Math.max(rect.top - clientY, 0, clientY - rect.bottom);
      if (dx * dx + dy * dy < distance) { nearest = page; distance = dx * dx + dy * dy; }
    });
    const element = nearest as HTMLElement | null;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { element, x: (clientX - rect.left) / Math.max(1, rect.width), y: (clientY - rect.top) / Math.max(1, rect.height), clientX, clientY };
  };
  const restoreAnchor = (anchor: Anchor, allowPan = true) => {
    const container = containerRef.current;
    const wrapper = wrapperRef.current;
    if (!container || !wrapper || !anchor.element.isConnected) return;
    const rect = anchor.element.getBoundingClientRect();
    const dx = rect.left + anchor.x * rect.width - anchor.clientX;
    const dy = rect.top + anchor.y * rect.height - anchor.clientY;
    const oldX = container.scrollLeft;
    const oldY = container.scrollTop;
    if (allowPan) container.scrollLeft += dx;
    container.scrollTop += dy;
    if (allowPan) {
      panRef.current.x += container.scrollLeft - oldX - dx;
      panRef.current.y += container.scrollTop - oldY - dy;
      wrapper.style.translate = `${panRef.current.x}px ${panRef.current.y}px`;
    }
  };
  const alignCurrentPage = () => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollLeft = 0;
    if (doc.viewMode === 'continuous') {
      const page = container.querySelector<HTMLElement>(`[data-continuous-page="${doc.currentPage}"]`);
      if (page) container.scrollTop += page.getBoundingClientRect().top - container.getBoundingClientRect().top - parseFloat(getComputedStyle(container).paddingTop);
    } else {
      container.scrollTop = 0;
    }
  };
  const releaseGesture = () => {
    if (releaseFrameRef.current !== null) cancelAnimationFrame(releaseFrameRef.current);
    releaseFrameRef.current = requestAnimationFrame(() => {
      releaseFrameRef.current = requestAnimationFrame(() => {
        releaseFrameRef.current = null;
        const container = containerRef.current;
        if (!container || gestureActiveRef.current) return;
        delete container.dataset.zoomGesture;
        container.dispatchEvent(new Event('pdf-zoom-end'));
      });
    });
  };

  const resetKey = `${doc.id}:${doc.viewMode}:${doc.viewportRevision || 0}`;
  const previousLayoutRef = useRef({ key: '', baseScale: 0, currentPage: doc.currentPage, visibleDocs: totalVisibleDocs });
  useLayoutEffect(() => {
    const previous = previousLayoutRef.current;
    const explicitReset = previous.key !== resetKey;
    const fitResize = doc.scale <= 1 && Math.abs(previous.baseScale - baseScale) > 0.0001;
    const pageNavigation = previous.currentPage !== doc.currentPage && doc.viewMode !== 'continuous';
    const columnsChanged = previous.visibleDocs !== totalVisibleDocs;
    if (explicitReset || fitResize || pageNavigation || (columnsChanged && doc.scale <= 1)) {
      gestureControllerRef.current?.cancel();
      pendingAnchorRef.current = null;
      clearLiveZoom();
      clearPan();
      alignCurrentPage();
      releaseGesture();
    } else if (pendingAnchorRef.current) {
      const anchor = pendingAnchorRef.current;
      pendingAnchorRef.current = null;
      clearLiveZoom();
      if (doc.scale <= 1) {
        clearPan();
        alignCurrentPage();
      } else restoreAnchor(anchor);
      releaseGesture();
    }
    previousLayoutRef.current = { key: resetKey, baseScale, currentPage: doc.currentPage, visibleDocs: totalVisibleDocs };
  }, [resetKey, baseScale, doc.scale, doc.currentPage, totalVisibleDocs]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let targetScale = scaleRef.current;
    let startScale = targetScale;
    let clientX = 0;
    let clientY = 0;
    let frame: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const apply = () => {
      frame = null;
      const anchor = captureAnchor(clientX, clientY);
      wrapperRef.current?.style.setProperty('--pdf-live-zoom', String(targetScale / startScale));
      if (targetScale <= 1) {
        clearPan();
        container.scrollLeft = 0;
        if (doc.viewMode !== 'continuous') container.scrollTop = 0;
        else if (anchor) restoreAnchor(anchor, false);
      } else if (anchor) restoreAnchor(anchor);
    };
    const cancel = () => {
      if (timer) clearTimeout(timer);
      if (frame !== null) cancelAnimationFrame(frame);
      timer = null;
      frame = null;
      gestureActiveRef.current = false;
    };
    gestureControllerRef.current = { cancel };
    const finish = () => {
      if (!gestureActiveRef.current) return;
      if (timer) clearTimeout(timer);
      timer = null;
      if (frame !== null) { cancelAnimationFrame(frame); apply(); }
      pendingAnchorRef.current = captureAnchor(clientX, clientY);
      gestureActiveRef.current = false;
      if (Math.abs(targetScale - startScale) < 0.000001) {
        clearLiveZoom();
        if (targetScale <= 1) { clearPan(); alignCurrentPage(); }
        pendingAnchorRef.current = null;
        releaseGesture();
      } else {
        scaleRef.current = targetScale;
        actionsRef.current.onZoomChange(doc.id, targetScale, false);
      }
    };
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      if (!gestureActiveRef.current) {
        startScale = scaleRef.current;
        targetScale = startScale;
        gestureActiveRef.current = true;
        container.dataset.zoomGesture = 'true';
        container.dispatchEvent(new Event('pdf-zoom-start'));
        actionsRef.current.onActivate(doc.id);
      }
      targetScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, targetScale * Math.exp(-event.deltaY / 90)));
      clientX = event.clientX;
      clientY = event.clientY;
      if (frame === null) frame = requestAnimationFrame(apply);
      if (timer) clearTimeout(timer);
      timer = setTimeout(finish, 120);
    };
    container.addEventListener('wheel', wheel, { passive: false });
    container.addEventListener('gestureend', finish);
    return () => {
      cancel();
      container.removeEventListener('wheel', wheel);
      container.removeEventListener('gestureend', finish);
    };
  }, [doc.id, doc.viewMode, doc.viewportRevision]);

  useEffect(() => () => {
    if (releaseFrameRef.current !== null) cancelAnimationFrame(releaseFrameRef.current);
  }, []);

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
      className={`h-full relative flex flex-col bg-[#fafafa] transition-[box-shadow,border-color] duration-150 select-none ${
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
        className="pdf-viewport-container w-full h-full relative min-h-0 no-scrollbar box-border"
        style={{
          overflowX: 'auto',
          overflowY: 'auto',
          overscrollBehaviorX: 'contain',
          padding: doc.viewMode === 'continuous' ? '16px 24px' : `24px 24px ${safeBottomInset}px`,
          overflowAnchor: 'none',
          scrollBehavior: 'auto',
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
            ref={wrapperRef}
            id={`pdf-transform-wrapper-${doc.id}`}
            data-scale={actualScale}
            className={`flex flex-col relative shrink-0 ${doc.viewMode === 'continuous' ? 'mx-auto' : 'm-auto'}`}
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
