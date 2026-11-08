import { canvasViewportTransform } from '../utils/pageCoordinates';
import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
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
import { HighlightOverlay } from './HighlightOverlay';
import { SimulatedSelectionLayer } from './SimulatedSelectionLayer';
import { StickyNotesLayer } from './StickyNotesLayer';
import { BoxAnnotationsLayer } from './BoxAnnotationsLayer';
import { FreeTextLayer } from './FreeTextLayer';
import { DrawingCanvas } from './DrawingCanvas';
import { AlertCircle, RefreshCw } from 'lucide-react';

import { getPageRaster, rememberPageRaster, clearPageRasters, rasterDensity, getRasterCacheUsage } from '../utils/pdfRasterCache';

interface PDFPageViewProps {
  fileId: string;
  pdfDoc: any;
  visualViewportScale?: number;
  pageNumber: number;
  scale: number;
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
  onAddStroke: (stroke: Omit<DrawingStroke, 'id' | 'createdAt'>) => string | void;
  onUpdateStroke?: (strokeId: string, updates: Partial<DrawingStroke>, skipHistory?: boolean) => void;
  onDeleteStroke: (strokeId: string) => void;
  onActiveToolChange?: (tool: ActiveTool) => void;
  isBookMode?: boolean;
  bookPageSide?: 'left' | 'right' | 'single';
  selectedIds?: string[];
  onSelect?: (id: string, isShift: boolean) => void;
  totalPages?: number;
}

export const pageDimensionCache = new Map<string, { width: number; height: number }>();
const pagePreviews = new Map<string, { pdfDoc: any; canvas: HTMLCanvasElement }>();
const PREVIEW_PIXEL_BUDGET = 12_000_000;

function rememberPagePreview(key: string, pdfDoc: any, source: HTMLCanvasElement) {
  const ratio = Math.min(1, 1200 / Math.max(source.width, source.height));
  const preview = document.createElement('canvas');
  preview.width = Math.max(1, Math.round(source.width * ratio));
  preview.height = Math.max(1, Math.round(source.height * ratio));
  preview.getContext('2d', { alpha: false })?.drawImage(source, 0, 0, preview.width, preview.height);
  const previous = pagePreviews.get(key);
  if (previous) { previous.canvas.width = 0; previous.canvas.height = 0; }
  pagePreviews.delete(key);
  pagePreviews.set(key, { pdfDoc, canvas: preview });
  let pixels = [...pagePreviews.values()].reduce((sum, entry) => sum + entry.canvas.width * entry.canvas.height, 0);
  for (const [oldKey, entry] of pagePreviews) {
    if (pixels <= PREVIEW_PIXEL_BUDGET) break;
    pixels -= entry.canvas.width * entry.canvas.height;
    entry.canvas.width = 0;
    entry.canvas.height = 0;
    pagePreviews.delete(oldKey);
  }
}

// Function to clean up all cached dimension data when a document is closed
export function clearDocCanvasCache(docId: string) {
  clearPageRasters(docId);
  for (const [key, entry] of pagePreviews) {
    if (key.startsWith(`${docId}_`)) {
      entry.canvas.width = 0;
      entry.canvas.height = 0;
      pagePreviews.delete(key);
    }
  }
  for (const key of pageDimensionCache.keys()) {
    if (key.startsWith(`${docId}_`)) {
      pageDimensionCache.delete(key);
    }
  }
}

type RenderSample = { page: number; doc: string; scale: number; queueMs: number; renderMs: number; outcome: string; active: number };
const renderSamples: RenderSample[] = [];
let peakPdfRenderSlots = 0;
let rasterCacheHits = 0;
export function getPdfRenderDiagnostics(reset = false) {
  const result = { active: activePdfRenderSlots, queued: pendingPdfRenders.length, peak: peakPdfRenderSlots, cacheHits: rasterCacheHits, rasterCache: getRasterCacheUsage(), samples: [...renderSamples] };
  if (reset) { renderSamples.length = 0; peakPdfRenderSlots = activePdfRenderSlots; rasterCacheHits = 0; }
  return result;
}
const MAX_CONCURRENT_PDF_RENDERS = 2;
let activePdfRenderSlots = 0;
type PdfRenderWaiter = {
  priority: number;
  cancelled: boolean;
  granted: boolean;
  resolve: (release: (() => void) | null) => void;
};
const pendingPdfRenders: PdfRenderWaiter[] = [];
let pumpScheduled = false;
function schedulePdfRenderQueue() {
  if (pumpScheduled) return;
  pumpScheduled = true;
  queueMicrotask(() => { pumpScheduled = false; pumpPdfRenderQueue(); });
}

function pumpPdfRenderQueue() {
  pendingPdfRenders.sort((a, b) => a.priority - b.priority);
  while (activePdfRenderSlots < MAX_CONCURRENT_PDF_RENDERS && pendingPdfRenders.length > 0) {
    const waiter = pendingPdfRenders.shift()!;
    if (waiter.cancelled) {
      waiter.resolve(null);
      continue;
    }
    waiter.granted = true;
    activePdfRenderSlots++;
    peakPdfRenderSlots = Math.max(peakPdfRenderSlots, activePdfRenderSlots);
    let released = false;
    waiter.resolve(() => {
      if (released) return;
      released = true;
      activePdfRenderSlots = Math.max(0, activePdfRenderSlots - 1);
      pumpPdfRenderQueue();
    });
  }
}

function requestPdfRenderSlot(priority: number) {
  let resolveWaiter!: (release: (() => void) | null) => void;
  const waiter: PdfRenderWaiter = {
    priority,
    cancelled: false,
    granted: false,
    resolve: (release) => resolveWaiter(release),
  };
  const promise = new Promise<(() => void) | null>((resolve) => {
    resolveWaiter = resolve;
  });
  pendingPdfRenders.push(waiter);
  // Collect this React commit's requests before granting slots. Otherwise the
  // first offscreen page in DOM order can start ahead of the visible page.
  schedulePdfRenderQueue();

  return {
    promise,
    cancel: () => {
      if (waiter.granted || waiter.cancelled) return;
      waiter.cancelled = true;
      const queuedIndex = pendingPdfRenders.indexOf(waiter);
      if (queuedIndex >= 0) pendingPdfRenders.splice(queuedIndex, 1);
      waiter.resolve(null);
      schedulePdfRenderQueue();
    },
    setPriority: (nextPriority: number) => {
      if (waiter.granted || waiter.cancelled) return;
      waiter.priority = nextPriority;
      schedulePdfRenderQueue();
    },
  };
}

const PDFPageViewComponent: React.FC<PDFPageViewProps> = ({
  pdfDoc,
  visualViewportScale = 1,
  pageNumber,
  scale,
  activeTool,
  penColor,
  penSize,
  penOpacity,
  eraserSize,
  highlightColorHex,
  highlightColor,
  boxColor = '#ef4444',
  boxConfig,
  onUpdateBoxConfig,
  highlights,
  textNotes,
  drawings,
  boxes,
  freeTexts,
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
  isBookMode = false,
  bookPageSide = 'single',
  selectedIds,
  onSelect,
  fileId,
}) => {
  const canvasRefs = useRef<[HTMLCanvasElement | null, HTMLCanvasElement | null]>([null, null]);
  const frontCanvasIndexRef = useRef(0);
  const [frontCanvasIndex, setFrontCanvasIndex] = useState(0);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);

  const docId = fileId;
  const cachedDimension =
    pageDimensionCache.get(`${docId}_${pageNumber}`) ||
    pageDimensionCache.get(`${docId}_default`);

  const [baseDimension, setBaseDimension] = useState<{ width: number; height: number }>(() => {
    if (cachedDimension) {
      return { width: cachedDimension.width, height: cachedDimension.height };
    }
    return { width: 595, height: 842 };
  });

  // Calculate layout dimensions for CSS container
  const activeBaseDim = cachedDimension || baseDimension;
  const effectiveWidth = Math.max(1, activeBaseDim.width * scale);
  const effectiveHeight = Math.max(1, activeBaseDim.height * scale);

  const hasRenderedOnceRef = useRef<boolean>(false);
  const lastRenderedScaleRef = useRef<number>(0);
  const frontDensityRef = useRef(0);
  const updatePriorityRef = useRef<() => void>(() => {});
  const documentVisibleRef = useRef(true);
  const [isNearViewport, setIsNearViewport] = useState(true);
  const renderPriorityRef = useRef(1);
  const [rasterScale, setRasterScale] = useState(scale);
  const desiredScaleRef = useRef(rasterScale);
  const activeRenderRef = useRef(false);
  const renderCompletionRef = useRef<Promise<void>>(Promise.resolve());
  const rasterRequestRef = useRef<{ pdfDoc: any; page: number; scale: number; cancelled: boolean; done: boolean; cancel: () => void } | null>(null);
  const mountedRef = useRef(true);
  desiredScaleRef.current = scale;
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [renderCount, setRenderCount] = useState(0);
  const renderTaskRef = useRef<any>(null);
  const pinchActiveRef = useRef(false);
  const renderSlotHandleRef = useRef<ReturnType<typeof requestPdfRenderSlot> | null>(null);
  const renderSlotReleaseRef = useRef<(() => void) | null>(null);
  const [isSelectingText, setIsSelectingText] = useState(false);
  const renderInputRef = useRef({ pdfDoc, pageNumber, docId });
  renderInputRef.current = { pdfDoc, pageNumber, docId };

  // Mode changes remount page components. Restore a bounded preview immediately
  // rather than discarding an already decoded page and showing a blank surface.
  useLayoutEffect(() => {
    frontDensityRef.current = 0;
    lastRenderedScaleRef.current = 0;
    const full = getPageRaster(`${docId}_${pageNumber}`, pdfDoc);
    const cached = pagePreviews.get(`${docId}_${pageNumber}`);
    const front = canvasRefs.current[frontCanvasIndexRef.current];
    if (!front) return;
    const bitmap = full?.bitmap || (cached?.pdfDoc === pdfDoc ? cached.canvas : null);
    if (!bitmap) return;
    front.width = bitmap.width;
    front.height = bitmap.height;
    front.getContext('2d', { alpha: false })?.drawImage(bitmap, 0, 0);
    frontDensityRef.current = full?.density || 0;
    front.dataset.rasterDensity = String(frontDensityRef.current);
    const sharpEnough = full && full.density >= rasterDensity(full.size, scale) - 0.0001;
    hasRenderedOnceRef.current = true;
    lastRenderedScaleRef.current = sharpEnough ? scale : 0;
    if (sharpEnough) { front.dataset.renderedScale = String(scale); rasterCacheHits++; }
    setIsLoading(false);
  }, [pdfDoc, docId, pageNumber]);

  useEffect(() => {
    const container = pageContainerRef.current?.closest<HTMLElement>('.pdf-viewport-container');
    if (!container) return;
    pinchActiveRef.current = container.dataset.zoomGesture === 'true';
    const start = () => {
      pinchActiveRef.current = true;
      rasterRequestRef.current?.cancel();
      renderSlotHandleRef.current?.cancel();
      renderTaskRef.current?.cancel();
    };
    const end = () => {
      if (!pinchActiveRef.current) return;
      pinchActiveRef.current = false;
      setRenderCount((count) => count + 1);
    };
    const visibility = () => {
      documentVisibleRef.current = container.dataset.renderVisible !== 'false';
      if (documentVisibleRef.current) {
        if (!activeRenderRef.current) setRenderCount((count) => count + 1);
      } else { rasterRequestRef.current?.cancel(); renderSlotHandleRef.current?.cancel(); renderTaskRef.current?.cancel(); }
    };
    container.addEventListener('pdf-viewport-visibility', visibility);
    container.addEventListener('pdf-zoom-start', start);
    container.addEventListener('pdf-zoom-end', end);
    return () => {
      container.removeEventListener('pdf-viewport-visibility', visibility);
      container.removeEventListener('pdf-zoom-start', start);
      container.removeEventListener('pdf-zoom-end', end);
    };
  }, []);

  // Keep only the current front bitmap per visited page. The hidden buffer is
  // released after each atomic swap instead of doubling memory across a long PDF.
  useLayoutEffect(() => {
    const staleCanvas = canvasRefs.current[frontCanvasIndex === 0 ? 1 : 0];
    if (staleCanvas && !activeRenderRef.current) {
      staleCanvas.width = 1;
      staleCanvas.height = 1;
    }
  }, [frontCanvasIndex]);

  // Keep layout zoom immediate, but rasterize once the trackpad gesture settles.
  // This avoids repeatedly cancelling a costly render for every pinch event.
  useEffect(() => {
    if (!isNearViewport && hasRenderedOnceRef.current) return;
    const frame = requestAnimationFrame(() => setRasterScale(scale));
    return () => cancelAnimationFrame(frame);
  }, [scale, isNearViewport]);

  // Keep previously rendered pages visible when scrolling back, but defer their
  // expensive high-resolution rerasterization until they approach the viewport.
  useEffect(() => {
    const pageElement = pageContainerRef.current;
    if (!pageElement) return;
    const scrollRoot = pageElement.closest<HTMLElement>('.pdf-viewport-container');
    if (typeof IntersectionObserver === 'undefined') return;

    const updatePriority = (notify = true) => {
        const pageRect = pageElement.getBoundingClientRect();
        const rootRect = scrollRoot?.getBoundingClientRect();
        const rootTop = Math.max(0, rootRect?.top ?? 0);
        const rootBottom = Math.min(window.innerHeight, rootRect?.bottom ?? window.innerHeight);
        const rootLeft = Math.max(0, rootRect?.left ?? 0);
        const rootRight = Math.min(window.innerWidth, rootRect?.right ?? window.innerWidth);
        const isVisible =
          pageRect.bottom > rootTop &&
          pageRect.top < rootBottom &&
          pageRect.right > rootLeft &&
          pageRect.left < rootRight;
        const verticalDistance = pageRect.bottom < rootTop
          ? rootTop - pageRect.bottom
          : pageRect.top > rootBottom ? pageRect.top - rootBottom : 0;
        documentVisibleRef.current = rootRight > rootLeft && rootBottom > rootTop;
        const activeDocument = scrollRoot?.closest('[data-workspace-doc]')?.getAttribute('data-active') === 'true';
        const priority = isVisible
          ? activeDocument ? 0 : 1
          : 10 + verticalDistance / Math.max(1, rootBottom - rootTop);
        const wasVisible = renderPriorityRef.current <= 1;
        renderPriorityRef.current = priority;
        renderSlotHandleRef.current?.setPriority(priority);
        if (notify && isVisible && !wasVisible && hasRenderedOnceRef.current && !activeRenderRef.current) {
          setRenderCount((count) => count + 1);
        }
    };
    updatePriorityRef.current = () => updatePriority(false);
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsNearViewport(entry.isIntersecting);
        updatePriority();
      },
      { root: scrollRoot, rootMargin: '1000px 0px', threshold: 0 }
    );
    const visibleObserver = new IntersectionObserver(() => updatePriority(), { root: scrollRoot, threshold: 0 });
    observer.observe(pageElement);
    visibleObserver.observe(pageElement);
    return () => { observer.disconnect(); visibleObserver.disconnect(); };
  }, [pageNumber, fileId]);

  // Cancel render work when the page component itself is removed.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      rasterRequestRef.current?.cancel();
      renderSlotHandleRef.current?.cancel();
      try {
        renderTaskRef.current?.cancel();
      } catch {}
    };
  }, []);

  // Global mouseup listener to reset text selection cursor back to default arrow
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsSelectingText(false);
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  // Signals can repeat for the same target (visibility, zoom-end, near-page IO).
  // Keep one request per page/scale instead of cancelling valid work on each
  // signal. Only a changed target, gesture, hidden page or unmount cancels it.
  useEffect(() => {
    if (!isNearViewport || pinchActiveRef.current || !pdfDoc || Math.abs(rasterScale - desiredScaleRef.current) > 0.001) {
      rasterRequestRef.current?.cancel();
      return;
    }
    if (hasRenderedOnceRef.current && frontDensityRef.current >= rasterDensity(activeBaseDim, rasterScale) - 0.0001) {
      rasterRequestRef.current?.cancel();
      lastRenderedScaleRef.current = rasterScale;
      const front = canvasRefs.current[frontCanvasIndexRef.current];
      if (front) {
        front.dataset.renderedScale = String(rasterScale);
        front.dataset.rasterDensity = String(frontDensityRef.current);
      }
      rasterCacheHits++;
      return;
    }
    const running = rasterRequestRef.current;
    if (running && !running.done && !running.cancelled && running.pdfDoc === pdfDoc && running.page === pageNumber && Math.abs(running.scale - rasterScale) < 0.001) return;
    running?.cancel();
    let cancelled = false;
    let task: any = null;
    let handle: ReturnType<typeof requestPdfRenderSlot> | null = null;
    let release: (() => void) | null = null;
    let queuedAt = 0;
    let startedAt = 0;
    let outcome = 'cancelled';
    const previousWork = renderCompletionRef.current;
    const request = { pdfDoc, page: pageNumber, scale: rasterScale, cancelled: false, done: false,
      cancel: () => { cancelled = true; request.cancelled = true; handle?.cancel(); task?.cancel(); } };
    rasterRequestRef.current = request;
    const finishRequest = () => {
      request.done = true;
      if (rasterRequestRef.current === request) rasterRequestRef.current = null;
    };
    const obsolete = () => cancelled || !mountedRef.current || pinchActiveRef.current || !documentVisibleRef.current ||
      renderInputRef.current.pdfDoc !== pdfDoc || renderInputRef.current.pageNumber !== pageNumber ||
      Math.abs(desiredScaleRef.current - rasterScale) > 0.001;
    const work = async () => {
      await previousWork;
      updatePriorityRef.current();
      if (obsolete() || (hasRenderedOnceRef.current && renderPriorityRef.current >= 10)) { finishRequest(); return; }
      activeRenderRef.current = true;
      try {
        if (!hasRenderedOnceRef.current) setIsLoading(true);
        setHasError(false);
        queuedAt = performance.now();
        handle = requestPdfRenderSlot(renderPriorityRef.current);
        renderSlotHandleRef.current = handle;
        release = await handle.promise;
        if (renderSlotHandleRef.current === handle) renderSlotHandleRef.current = null;
        if (!release || obsolete()) return;
        renderSlotReleaseRef.current = release;
        startedAt = performance.now();
        const page = await pdfDoc.getPage(pageNumber);
        if (obsolete()) return;
        const base = page.getViewport({ scale: 1 });
        const size = { width: base.width, height: base.height };
        setBaseDimension(size);
        pageDimensionCache.set(`${docId}_${pageNumber}`, size);
        if (!pageDimensionCache.has(`${docId}_default`)) pageDimensionCache.set(`${docId}_default`, size);
        const density = rasterDensity(size, rasterScale);
        const viewport = page.getViewport({ scale: density });
        const backIndex = frontCanvasIndexRef.current === 0 ? 1 : 0;
        const back = canvasRefs.current[backIndex];
        if (!back) return;
        back.width = Math.max(1, Math.round(viewport.width));
        back.height = Math.max(1, Math.round(viewport.height));
        const context = back.getContext('2d', { alpha: false });
        if (!context) throw new Error('Could not create PDF canvas context');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, back.width, back.height);
        task = page.render({ canvasContext: context, viewport, transform: canvasViewportTransform(viewport, back) });
        renderTaskRef.current = task;
        await task.promise;
        if (obsolete()) return;
        rememberPagePreview(`${docId}_${pageNumber}`, pdfDoc, back);
        rememberPageRaster(`${docId}_${pageNumber}`, pdfDoc, back, density, size);
        frontDensityRef.current = density;
        outcome = 'committed';
        back.dataset.renderedScale = String(rasterScale);
        back.dataset.rasterDensity = String(density);
        frontCanvasIndexRef.current = backIndex;
        lastRenderedScaleRef.current = rasterScale;
        hasRenderedOnceRef.current = true;
        setFrontCanvasIndex(backIndex);
        setIsLoading(false);
        setHasError(false);
      } catch (error: any) {
        if (!obsolete() && error?.name !== 'RenderingCancelledException') {
          console.error(`Error rendering page ${pageNumber}:`, error);
          setHasError(true);
          setErrorMessage(error.message || String(error));
          setIsLoading(false);
        }
      } finally {
        if (queuedAt) {
          renderSamples.push({ page: pageNumber, doc: docId, scale: rasterScale,
            queueMs: (startedAt || performance.now()) - queuedAt,
            renderMs: startedAt ? performance.now() - startedAt : 0, outcome, active: activePdfRenderSlots });
          if (renderSamples.length > 200) renderSamples.shift();
        }
        activeRenderRef.current = false;
        if (renderTaskRef.current === task) renderTaskRef.current = null;
        if (renderSlotHandleRef.current === handle) renderSlotHandleRef.current = null;
        if (renderSlotReleaseRef.current === release) renderSlotReleaseRef.current = null;
        release?.();
        finishRequest();
      }
    };
    renderCompletionRef.current = work();
  }, [pdfDoc, pageNumber, rasterScale, renderCount, visualViewportScale, isNearViewport]);

  const lastRightClickRef = useRef<{ time: number; x: number; y: number } | null>(null);

  // Helper to extract text selection bounds on current PDF page with 1:1 line precision
  const getPageSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return null;

    const text = selection.toString().trim();
    if (!text) return null;

    if (selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);

    const pageContainer = pageContainerRef.current;
    if (!pageContainer) return null;

    // Verify if selection belongs to this page container
    if (
      !pageContainer.contains(range.commonAncestorContainer) &&
      !pageContainer.contains(range.startContainer) &&
      !pageContainer.contains(range.endContainer)
    ) {
      return null;
    }

    const pageRect = pageContainer.getBoundingClientRect();
    const rawClientRects = Array.from(range.getClientRects());

    // 1. Filter out invalid rects or rects outside pageRect bounds
    const validClientRects = rawClientRects.filter((r) => {
      if (r.width <= 1 || r.height <= 1) return false;
      const intersects =
        r.right > pageRect.left &&
        r.left < pageRect.right &&
        r.bottom > pageRect.top &&
        r.top < pageRect.bottom;
      return intersects;
    });

    if (validClientRects.length === 0) return null;

    // 2. Convert to percentage rects constrained strictly to page bounds [0, 100]
    const rawNormalized: NormalizedRect[] = validClientRects
      .map((r) => {
        const leftRel = Math.max(0, r.left - pageRect.left);
        const topRel = Math.max(0, r.top - pageRect.top);
        const rightRel = Math.min(pageRect.width, r.right - pageRect.left);
        const bottomRel = Math.min(pageRect.height, r.bottom - pageRect.top);

        const width = Math.max(0, rightRel - leftRel);
        const height = Math.max(0, bottomRel - topRel);

        return {
          x: (leftRel / pageRect.width) * 100,
          y: (topRel / pageRect.height) * 100,
          width: (width / pageRect.width) * 100,
          height: (height / pageRect.height) * 100,
        };
      })
      .filter((r) => r.width > 0.05 && r.height > 0.05);

    if (rawNormalized.length === 0) return null;

    // 3. Group rects into lines to form tight 1:1 line bounding boxes (Smart Highlight precision)
    const lines: NormalizedRect[][] = [];
    const sorted = [...rawNormalized].sort((a, b) => a.y - b.y || a.x - b.x);

    for (const rect of sorted) {
      let addedToLine = false;
      for (const line of lines) {
        const lineY = line[0].y;
        const lineH = line[0].height;
        if (Math.abs(rect.y - lineY) < Math.max(0.8, lineH * 0.4)) {
          line.push(rect);
          addedToLine = true;
          break;
        }
      }
      if (!addedToLine) {
        lines.push([rect]);
      }
    }

    // 4. Consolidate each line cluster into a single line rectangle
    const rawLineRects: NormalizedRect[] = lines.map((line) => {
      const minX = Math.min(...line.map((r) => r.x));
      const minY = Math.min(...line.map((r) => r.y));
      const maxRight = Math.max(...line.map((r) => r.x + r.width));
      const maxBottom = Math.max(...line.map((r) => r.y + r.height));

      const lineW = maxRight - minX;
      const lineH = maxBottom - minY;

      return {
        x: minX,
        y: minY,
        width: Math.min(100 - minX, lineW),
        height: Math.min(100 - minY, lineH),
      };
    });

    // Merge vertically contiguous rectangles to eliminate horizontal seam lines
    const finalRects: NormalizedRect[] = [];
    const sortedLineRects = [...rawLineRects].sort((a, b) => a.y - b.y);

    if (sortedLineRects.length > 0) {
      let current = { ...sortedLineRects[0] };
      for (let i = 1; i < sortedLineRects.length; i++) {
        const next = sortedLineRects[i];
        const currentBottom = current.y + current.height;
        const currentRight = current.x + current.width;
        const nextRight = next.x + next.width;

        const touchesVertically = next.y <= currentBottom + 1.2;
        const similarX = Math.abs(current.x - next.x) < 8;
        const similarRight = Math.abs(currentRight - nextRight) < 8;
        const horizontallyOverlaps = Math.max(current.x, next.x) < Math.min(currentRight, nextRight);

        if (touchesVertically && (similarX || similarRight || horizontallyOverlaps)) {
          const newX = Math.min(current.x, next.x);
          const newY = Math.min(current.y, next.y);
          const newR = Math.max(currentRight, nextRight);
          const newB = Math.max(currentBottom, next.y + next.height);
          current = {
            x: newX,
            y: newY,
            width: newR - newX,
            height: newB - newY,
          };
        } else {
          finalRects.push(current);
          current = { ...next };
        }
      }
      finalRects.push(current);
    }

    return { text, rects: finalRects, range, selection };
  }, [pageNumber]);

  // Double Right-Click Quick Highlight Handler
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      let selInfo = getPageSelection();
      const clickX = e.clientX;
      const clickY = e.clientY;

      if (!selInfo) {
        // If no text selection, check if right clicked on a text node in the document to allow double-right-click on words
        let range: Range | null = null;
        const docAny = document as any;
        if (docAny.caretRangeFromPoint) {
          range = docAny.caretRangeFromPoint(clickX, clickY);
        } else if (docAny.caretPositionFromPoint) {
          const pos = docAny.caretPositionFromPoint(clickX, clickY);
          if (pos?.offsetNode) {
            range = document.createRange();
            range.setStart(pos.offsetNode, pos.offset);
            range.setEnd(pos.offsetNode, pos.offset);
          }
        }

        if (range && range.startContainer && pageContainerRef.current?.contains(range.startContainer)) {
          const textContent = range.startContainer.textContent;
          if (textContent && textContent.trim()) {
            e.preventDefault();
            e.stopPropagation();
            const now = Date.now();
            const prev = lastRightClickRef.current;
            const isDouble =
              prev &&
              now - prev.time < 600 &&
              Math.abs(clickX - prev.x) < 60 &&
              Math.abs(clickY - prev.y) < 60;
            lastRightClickRef.current = { time: now, x: clickX, y: clickY };

            if (isDouble) {
              const sel = window.getSelection();
              if (sel) {
                sel.removeAllRanges();
                sel.addRange(range);
                try {
                  (sel as any).modify?.('move', 'backward', 'word');
                  (sel as any).modify?.('extend', 'forward', 'word');
                } catch {
                  // ignore
                }
                selInfo = getPageSelection();
              }
            }
          }
        }
      }

      if (!selInfo) {
        // No text selected on this page -> allow default browser context menu
        return;
      }

      // Check if mouse click position is on or near the selected text
      const rangeRects = Array.from(selInfo.range.getClientRects());
      const isInsideSelection = rangeRects.some(
        (r: DOMRect) =>
          clickX >= r.left - 40 &&
          clickX <= r.right + 40 &&
          clickY >= r.top - 25 &&
          clickY <= r.bottom + 25
      );

      if (!isInsideSelection && rangeRects.length > 0) {
        return;
      }

      // Prevent default browser context menu on selected text completely
      e.preventDefault();
      e.stopPropagation();

      const now = Date.now();
      const prev = lastRightClickRef.current;

      // Double Right-Click detection (2 contextmenu events within 600ms)
      const isDoubleRightClick =
        prev &&
        now - prev.time < 600 &&
        Math.abs(clickX - prev.x) < 60 &&
        Math.abs(clickY - prev.y) < 60;

      lastRightClickRef.current = { time: now, x: clickX, y: clickY };

      if (isDoubleRightClick) {
        // Trigger Highlight immediately using remembered color or default yellow
        const colorToUse: HighlightColor = highlightColor || 'yellow';

        const newHighlight: HighlightAnnotation = {
          id: `hl_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          pageNumber,
          text: selInfo.text,
          color: colorToUse,
          rects: selInfo.rects,
          createdAt: Date.now(),
        };

        if (onAddHighlight) {
          onAddHighlight(newHighlight);
        }

        // Remove temporary text selection highlight immediately
        selInfo.selection.removeAllRanges();
        lastRightClickRef.current = null;
      }
    },
    [getPageSelection, highlightColor, highlightColorHex, pageNumber, onAddHighlight]
  );

  // Left-Click Mouse Up for Text Selection Toolbar
  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return; // Only trigger for left click

      setTimeout(() => {
        const selInfo = getPageSelection();
        if (selInfo && onTextSelected) {
          const rect = selInfo.range.getBoundingClientRect();
          onTextSelected(
            pageNumber,
            selInfo.text,
            selInfo.rects,
            { x: rect.left + rect.width / 2, y: rect.top }
          );
        }
      }, 20);
    },
    [getPageSelection, onTextSelected, pageNumber]
  );

  // Book spine styles
  const bookSpineClass =
    isBookMode && bookPageSide === 'left'
      ? 'paper-stack-left rounded-none'
      : isBookMode && bookPageSide === 'right'
      ? 'paper-stack-right rounded-none'
      : 'paper-stack-single rounded-none';

  return (
    <div
      className={`relative shrink-0 [&:has([data-highlight-note-open=true])]:z-[60000] p-0 bg-white border-0 rounded-none ${bookSpineClass} overflow-visible [&:has(.cursor-grabbing)]:z-50 [&:has([class*='z-[500]'])]:z-50 [&:has([class*='z-[8000]'])]:z-50 [&:has([class*='z-[9999]'])]:z-50 [&:has([class*='z-[20000]'])]:z-50 [&:has([class*='z-[30000]'])]:z-50 [&:has([class*='z-[35000]'])]:z-50`}
      data-pdf-page-slot="true"
      style={{
        '--pdf-page-width': `${effectiveWidth}px`,
        '--pdf-page-height': `${effectiveHeight}px`,
        width: 'calc(var(--pdf-page-width) * var(--pdf-live-zoom, 1))',
        height: 'calc(var(--pdf-page-height) * var(--pdf-live-zoom, 1))',
      } as React.CSSProperties}
    >
      <div
        ref={pageContainerRef}
        id={fileId ? `page-container-${fileId}-${pageNumber}` : `page-container-${pageNumber}`}
        data-page-container="true"
        data-doc-id={fileId || ''}
        data-page-number={pageNumber}
        onContextMenu={handleContextMenu}
        onMouseUp={handleMouseUp}
        onClick={(e) => {
          if (e.button === 0 && !e.shiftKey && onSelect) {
            const el = e.target instanceof Element ? e.target : (e.target as Node | null)?.parentElement;
            const isAnnotation = Boolean(
              el?.closest?.(
                '.free-text-item-container, .box-floating-toolbar, [id^="box-"], .sticky-note-paper, [id^="sticky-"], [id^="hl-"], #smart-shape-handles, .stroke-vector-group, button, input, textarea, .ft-toolbar, .ft-link-card-popover, .unified-group-toolbar, .floating-submenu'
              )
            );
            if (!isAnnotation) {
              onSelect('', false);
            }
          }
        }}
        className={`relative bg-white cursor-default overflow-visible`}
        style={{
          width: `${effectiveWidth}px`,
          height: `${effectiveHeight}px`,
          transform: 'scale(var(--pdf-live-zoom, 1))',
          transformOrigin: '0 0',
        }}
      >
        {/* Loading Skeleton only on very first load before initial render */}
        {isLoading && !hasRenderedOnceRef.current && (
          <div className="absolute inset-0 bg-neutral-100/90 backdrop-blur-2xs flex flex-col items-center justify-center text-neutral-600 gap-2 z-10">
            <div className="w-8 h-8 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-semibold">Đang tải trang {pageNumber}...</span>
          </div>
        )}

      {/* Error state with retry button */}
      {hasError && !isLoading && (
        <div className="absolute inset-0 bg-neutral-50 flex flex-col items-center justify-center text-neutral-700 gap-2 z-10 p-4 text-center">
          <AlertCircle size={28} className="text-red-500 mb-1" />
          <p className="text-xs font-semibold">Không thể tải trang {pageNumber}</p>
          {errorMessage && <p className="text-[10px] text-neutral-500 max-w-[80%] break-words">{errorMessage}</p>}
          <button
            onClick={() => setRenderCount((c) => c + 1)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 text-white rounded text-xs hover:bg-black transition-colors"
          >
            <RefreshCw size={12} />
            <span>Thử tải lại trang</span>
          </button>
        </div>
      )}

      {/* PDF Rendering Canvas */}
      {[0, 1].map((bufferIndex) => (
        <canvas
          key={`pdf-canvas-buffer-${bufferIndex}`}
          ref={(element) => { canvasRefs.current[bufferIndex as 0 | 1] = element; }}
          aria-hidden="true"
          className="absolute inset-0 block w-full h-full"
          style={{
            visibility: frontCanvasIndex === bufferIndex ? 'visible' : 'hidden',
            pointerEvents: 'none',
          }}
        />
      ))}

      {/* Interactive Text Layer for Highlighting & Selection */}
      <div
        ref={textLayerRef}
        onMouseDown={() => setIsSelectingText(true)}
        className={`pdf-text-layer pointer-events-none`}
        style={{
          width: `${effectiveWidth}px`,
          height: `${effectiveHeight}px`,
        }}
      />

      {/* Simulated Selection Layer */}
      <SimulatedSelectionLayer
        pdfDoc={pdfDoc}
        isNearViewport={isNearViewport && !isLoading}
        pageNumber={pageNumber}
        scale={scale}
        isActive={activeTool === 'select'}
        highlightColor={highlightColor || 'yellow'}
        onAddHighlight={(hl) => onAddHighlight && onAddHighlight(hl)}
      />

      {/* Highlight Overlay */}
      <HighlightOverlay
        pageNumber={pageNumber}
        highlights={highlights}
        onDeleteHighlight={onDeleteHighlight}
        onUpdateHighlight={onUpdateHighlight}
        onUpdateHighlightNote={onUpdateHighlightNote}
        onUpdateHighlightColor={onUpdateHighlightColor}
        selectedIds={selectedIds}
        onSelect={onSelect}
        onAddHighlight={onAddHighlight}
        elevatedContainerId={fileId ? `elevated-annotation-container-${fileId}-${pageNumber}` : `elevated-annotation-container-${pageNumber}`}
      />

      {/* Freehand & Smart Drawing Overlay */}
      <DrawingCanvas
        scale={scale}
        fileId={fileId}
        pageNumber={pageNumber}
        width={effectiveWidth}
        height={effectiveHeight}
        isDrawingMode={
          activeTool === 'pen' ||
          activeTool === 'highlighter' ||
          activeTool === 'smart_pen' ||
          activeTool === 'smart_highlighter'
        }
        isHighlighter={activeTool === 'highlighter' || activeTool === 'smart_highlighter'}
        isSmartPen={activeTool === 'smart_pen'}
        isSmartHighlighter={activeTool === 'smart_highlighter'}
        isEraserMode={activeTool === 'eraser'}
        penColor={penColor}
        penSize={penSize}
        penOpacity={penOpacity}
        eraserSize={eraserSize}
        strokes={drawings}
        onAddStroke={onAddStroke}
        onUpdateStroke={onUpdateStroke}
        onDeleteStroke={onDeleteStroke}
        selectedIds={selectedIds}
        onSelect={onSelect}
        elevatedContainerId={fileId ? `elevated-annotation-container-${fileId}-${pageNumber}` : `elevated-annotation-container-${pageNumber}`}
      />

      {/* Box / Rectangle Annotations Layer (Khoanh ô vuông kéo giãn/thu gọn) */}
      <BoxAnnotationsLayer
        fileId={fileId}
        pageNumber={pageNumber}
        totalPages={pdfDoc?.numPages}
        scale={scale}
        boxes={boxes}
        isBoxToolActive={activeTool === 'box'}
        activeColor={boxColor}
        boxConfig={boxConfig}
        onUpdateBoxConfig={onUpdateBoxConfig}
        onAddBox={onAddBox}
        onUpdateBox={onUpdateBox}
        onDeleteBox={onDeleteBox}
        selectedIds={selectedIds}
        onSelect={onSelect}
      />

      {/* Free Text Direct Insertion Layer (Nhập text trực tiếp lên sách) */}
      <FreeTextLayer
        fileId={fileId}
        pageNumber={pageNumber}
        totalPages={pdfDoc?.numPages}
        freeTexts={freeTexts}
        isTextToolActive={activeTool === 'text'}
        onAddText={onAddFreeText}
        onUpdateText={onUpdateFreeText}
        onDeleteText={onDeleteFreeText}
        onDeactivateTextTool={() => onActiveToolChange?.('select')}
        scale={scale}
        selectedIds={selectedIds}
        onSelect={onSelect}
      />

      {/* Sticky Notes Paper Layer (Giấy note nhỏ di động kéo thả tự do) */}
      <StickyNotesLayer
        fileId={fileId}
        pageNumber={pageNumber}
        totalPages={pdfDoc?.numPages}
        notes={textNotes}
        isStickyToolActive={activeTool === 'sticky'}
        onAddNote={onAddNote}
        onUpdateNote={onUpdateNote}
        onDeleteNote={onDeleteNote}
        onDeactivateStickyTool={() => onActiveToolChange?.('select')}
        scale={scale}
        selectedIds={selectedIds}
        onSelect={onSelect}
      />

      {/* Elevated Annotation Overlay Container: Sits directly above StickyNotesLayer (z-[25000]) for isolated elevation of selected Pen/Highlight */}
      <div
        id={fileId ? `elevated-annotation-container-${fileId}-${pageNumber}` : `elevated-annotation-container-${pageNumber}`}
        className="absolute inset-0 select-none overflow-visible z-[25000] pointer-events-none"
      />

      </div>
      {/* Screen-space overlay: follow the page slot, never the canvas transform. */}
      <div
        data-page-label={pageNumber}
        aria-hidden="true"
        className="absolute z-[50000] bottom-1 left-1/2 -translate-x-1/2 h-[18px] leading-[18px] min-w-6 text-center text-[10px] text-neutral-400 font-mono tabular-nums select-none pointer-events-none bg-white/80 px-1 rounded shadow-2xs"
      >
        {pageNumber}
      </div>
    </div>
  );
};

function pdfjsLibUtilTransform(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function areEqual(prevProps: PDFPageViewProps, nextProps: PDFPageViewProps) {
  if (
    prevProps.fileId !== nextProps.fileId ||
    prevProps.pageNumber !== nextProps.pageNumber ||
    prevProps.scale !== nextProps.scale ||
    prevProps.activeTool !== nextProps.activeTool ||
    prevProps.penColor !== nextProps.penColor ||
    prevProps.penSize !== nextProps.penSize ||
    prevProps.penOpacity !== nextProps.penOpacity ||
    prevProps.eraserSize !== nextProps.eraserSize ||
    prevProps.highlightColorHex !== nextProps.highlightColorHex ||
    prevProps.boxColor !== nextProps.boxColor ||
    prevProps.isBookMode !== nextProps.isBookMode ||
    prevProps.bookPageSide !== nextProps.bookPageSide ||
    prevProps.visualViewportScale !== nextProps.visualViewportScale ||
    prevProps.pdfDoc !== nextProps.pdfDoc
  ) {
    return false;
  }

  // Fast boxConfig check
  if (prevProps.boxConfig !== nextProps.boxConfig) {
    if (
      prevProps.boxConfig?.color !== nextProps.boxConfig?.color ||
      prevProps.boxConfig?.borderWidth !== nextProps.boxConfig?.borderWidth ||
      prevProps.boxConfig?.borderStyle !== nextProps.boxConfig?.borderStyle ||
      prevProps.boxConfig?.hasBackground !== nextProps.boxConfig?.hasBackground
    ) {
      return false;
    }
  }

  // Fast selectedIds check
  if (prevProps.selectedIds !== nextProps.selectedIds) {
    const prevLen = prevProps.selectedIds?.length || 0;
    const nextLen = nextProps.selectedIds?.length || 0;
    if (prevLen !== nextLen) return false;
    if (prevLen > 0) {
      for (let i = 0; i < prevLen; i++) {
        if (prevProps.selectedIds![i] !== nextProps.selectedIds![i]) return false;
      }
    }
  }

  const p = prevProps.pageNumber;

  // Annotation updates are immutable. Comparing only a few fields (or point
  // counts) skipped coordinate, opacity and size changes, leaving hit targets
  // and displayed geometry at the previous position after a drag.
  for (const key of ['highlights', 'textNotes', 'drawings', 'boxes', 'freeTexts'] as const) {
    if (prevProps[key] === nextProps[key]) continue;
    const before = prevProps[key].filter(item => item.pageNumber === p);
    const after = nextProps[key].filter(item => item.pageNumber === p);
    if (before.length !== after.length || before.some((item, i) => item !== after[i])) return false;
  }

  return true;
}

export const PDFPageView = React.memo(PDFPageViewComponent, areEqual);
