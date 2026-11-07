import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  ActiveTool,
  HighlightColor,
  ViewMode,
  NormalizedRect,
  HighlightAnnotation,
  TextNoteAnnotation,
  BoxAnnotation,
  BoxConfig,
  DEFAULT_BOX_CONFIG,
  FreeTextAnnotation,
  DrawingStroke,
  CustomTOCItem,
  AutoTOCItem,
  PDFDocumentState,
  SavedBook,
  HIGHLIGHT_COLORS,
  WorkspaceDoc,
  HistorySnapshot,
} from "./types";
import { pdfjsLib } from "./utils/pdfWorker";
import {
  saveDocumentState,
  loadDocumentState,
  getLastOpenedFileId,
  clearDocumentState,
  exportDocumentDataJSON,
  importDocumentDataJSON,
  saveBookToLibrary,
  isBookSavedInLibrary,
  getSavedBooks,
  savePdfFileToForage,
  loadPdfFileFromForage,
} from "./utils/storage";
import { generateSamplePdfBytes, SAMPLE_PDF_NAME } from "./utils/samplePdf";
import { convertAnyFileToPdfBytes } from "./utils/fileConverter";
import {
  CustomBookConfig,
  createBlankBookPdfBytes,
  appendBlankPageToPdfBytes,
} from "./utils/customBookGenerator";
import {
  findBestMatchingPage,
  elevatePageZIndex,
  resetPageZIndex,
} from "./utils/pageBoundaryHelper";
import { Toolbar } from "./components/Toolbar";
import { TabBar } from "./components/TabBar";
import { PDFWorkspaceColumn } from "./components/PDFWorkspaceColumn";
import { clearDocCanvasCache, pageDimensionCache } from "./components/PDFPageView";
import { Sidebar } from "./components/Sidebar";
import { LarkFloatingToolbar } from "./components/LarkFloatingToolbar";
import { UnifiedSelectionToolbar } from "./components/UnifiedSelectionToolbar";
import { SaveBookModal } from "./components/SaveBookModal";
import { LibraryModal } from "./components/LibraryModal";
import { ExportModal } from "./components/ExportModal";
import { ImageOrderModal } from "./components/ImageOrderModal";
import { ShortcutsWidget } from "./components/ShortcutsWidget";
import {
  Upload,
  AlertCircle,
  EyeOff,
  ChevronDown,
} from "lucide-react";

// Equality check for history snapshots
const areSnapshotsEqual = (a: HistorySnapshot, b: HistorySnapshot): boolean => {
  if (
    a.highlights.length !== b.highlights.length ||
    a.drawings.length !== b.drawings.length ||
    a.boxes.length !== b.boxes.length ||
    a.freeTexts.length !== b.freeTexts.length ||
    a.textNotes.length !== b.textNotes.length
  ) {
    return false;
  }
  return JSON.stringify(a) === JSON.stringify(b);
};

export function App() {
  // Multi-PDF Workspace State
  const [openDocs, setOpenDocs] = useState<WorkspaceDoc[]>([]);
  const [activeDocId, setActiveDocId] = useState<string>("");
  const [isLoadingDoc, setIsLoadingDoc] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Active Document derived from activeDocId (or first open doc)
  const activeDoc = useMemo(() => {
    if (!openDocs || openDocs.length === 0) return null;
    return openDocs.find((d) => d.id === activeDocId) || openDocs[0] || null;
  }, [openDocs, activeDocId]);

  // Documents currently visible (not hidden via EyeOff)
  const visibleDocs = useMemo(() => {
    return openDocs.filter((d) => !d.isHidden);
  }, [openDocs]);

  // Keep activeDocId in sync when docs change
  useEffect(() => {
    if (openDocs.length === 0) {
      if (activeDocId !== "") setActiveDocId("");
      return;
    }
    const currentStillExists = openDocs.some((d) => d.id === activeDocId);
    if (!currentStillExists) {
      const firstVisible = openDocs.find((d) => !d.isHidden) || openDocs[0];
      setActiveDocId(firstVisible.id);
    }
  }, [openDocs, activeDocId]);

  // Shared Tool State (Toolbar & Floating Toolbar)
  const [activeTool, setActiveTool] = useState<ActiveTool>("select");
  const [penColor, setPenColor] = useState<string>("#ef4444");
  const [penSize, setPenSize] = useState<number>(4);
  const [highlighterSize, setHighlighterSize] = useState<number>(14);
  const [penOpacity, setPenOpacity] = useState<number>(1);
  const [eraserSize, setEraserSize] = useState<number>(20);
  const [eraserPos, setEraserPos] = useState<{ x: number; y: number } | null>(null);
  const [highlightColor, setHighlightColor] = useState<HighlightColor>("yellow");
  const [boxColor, setBoxColor] = useState<string>("#ef4444");
  const [boxConfig, setBoxConfig] = useState<BoxConfig>(DEFAULT_BOX_CONFIG);

  // Sidebar & Modal states
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isSaveBookModalOpen, setIsSaveBookModalOpen] = useState<boolean>(false);
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isImageOrderModalOpen, setIsImageOrderModalOpen] = useState<boolean>(false);
  const [pendingImageFiles, setPendingImageFiles] = useState<File[]>([]);
  const [isEmptyStateUploadMenuOpen, setIsEmptyStateUploadMenuOpen] = useState<boolean>(false);
  const emptyStateUploadMenuRef = useRef<HTMLDivElement>(null);

  // Close empty state upload menu on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        emptyStateUploadMenuRef.current &&
        !emptyStateUploadMenuRef.current.contains(e.target as Node)
      ) {
        setIsEmptyStateUploadMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Eraser floating cursor tracker
  useEffect(() => {
    if (activeTool !== "eraser") {
      setEraserPos(null);
      return;
    }
    const handleMouseMove = (e: MouseEvent) => {
      setEraserPos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [activeTool]);

  // Multi-PDF Workspace Container Ref & Smooth Bi-directional Horizontal Wheel
  const multiPdfContainerRef = useRef<HTMLDivElement>(null);
  const workspacePairIndexRef = useRef(0);

  const scrollWorkspaceToDoc = useCallback((docId: string) => {
    requestAnimationFrame(() => {
      const container = multiPdfContainerRef.current;
      if (!container) return;
      const columns = Array.from(
        container.querySelectorAll<HTMLElement>(':scope > [data-workspace-doc]')
      ).filter((column) => column.style.display !== 'none');
      const selectedIndex = columns.findIndex((column) => column.dataset.workspaceDoc === docId);
      if (selectedIndex < 0 || columns.length < 2) return;
      const pairIndex = Math.max(0, Math.min(columns.length - 2, selectedIndex === 0 ? 0 : selectedIndex - 1));
      workspacePairIndexRef.current = pairIndex;
      container.scrollTo({ left: pairIndex * (container.clientWidth / 2), behavior: 'smooth' });
    });
  }, []);

  useEffect(() => {
    const container = multiPdfContainerRef.current;
    if (!container) return;

    let rafId: number | null = null;
    let accumulatedDelta = 0;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let previousWidth = container.clientWidth;
    const maxPairIndex = Math.max(0, visibleDocs.length - 2);
    const clampPairIndex = (index: number) =>
      Math.max(0, Math.min(maxPairIndex, index));

    const settleToNearestPair = () => {
      const step = container.clientWidth / 2;
      if (step <= 0) return;
      const nextIndex = clampPairIndex(Math.round(container.scrollLeft / step));
      workspacePairIndexRef.current = nextIndex;
      const alignedLeft = nextIndex * step;
      if (Math.abs(container.scrollLeft - alignedLeft) > 1) {
        container.scrollLeft = alignedLeft;
      }
    };

    const flushScroll = () => {
      rafId = null;
      if (accumulatedDelta !== 0 && container) {
        container.scrollLeft += accumulatedDelta;
        accumulatedDelta = 0;
      }
    };

    const handleWorkspaceWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return; // Zoom is handled per PDF column

      const target = e.target instanceof Element ? e.target : null;
      const pdfViewport = target?.closest<HTMLElement>(".pdf-viewport-container");
      const horizontalDelta = e.deltaX || (e.shiftKey ? e.deltaY : 0);
      const pdfHasHorizontalOverflow = Boolean(
        pdfViewport && pdfViewport.scrollWidth > pdfViewport.clientWidth + 1
      );

      // A horizontally overflowing PDF owns the gesture. Its own wheel handler
      // keeps it from chaining into the workspace.
      if (pdfHasHorizontalOverflow && horizontalDelta !== 0) return;

      // Only convert Shift + vertical wheel on mouse into horizontal workspace scroll
      if (e.shiftKey && Math.abs(e.deltaY) > 0) {
        accumulatedDelta += e.deltaY;
        e.preventDefault();
        if (rafId === null) {
          rafId = requestAnimationFrame(flushScroll);
        }
      }
    };

    const handleWorkspaceScroll = () => {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(settleToNearestPair, 140);
    };

    const resizeObserver = new ResizeObserver(() => {
      const width = container.clientWidth;
      if (Math.abs(width - previousWidth) < 1) return;
      previousWidth = width;
      const step = width / 2;
      const nextIndex = clampPairIndex(workspacePairIndexRef.current);
      workspacePairIndexRef.current = nextIndex;
      container.scrollLeft = nextIndex * step;
    });

    container.addEventListener("wheel", handleWorkspaceWheel, { passive: false });
    container.addEventListener("scroll", handleWorkspaceScroll, { passive: true });
    resizeObserver.observe(container);
    return () => {
      container.removeEventListener("wheel", handleWorkspaceWheel);
      container.removeEventListener("scroll", handleWorkspaceScroll);
      resizeObserver.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [visibleDocs.length]);

  // Color & Tool Handlers
  const handleHighlightColorChange = useCallback((color: HighlightColor) => {
    setHighlightColor(color);
  }, []);

  const mapHexToHighlightColor = useCallback((hex: string): HighlightColor | null => {
    const lower = hex.toLowerCase();
    if (lower === "#ef4444" || lower === "#dc2626" || lower.includes("red")) return "red";
    if (lower === "#eab308" || lower === "#ffd700" || lower.includes("yellow")) return "yellow";
    if (lower === "#22c55e" || lower === "#10b981" || lower.includes("green") || lower === "#00ff66") return "green";
    if (lower === "#ec4899" || lower === "#ff2d95" || lower.includes("pink")) return "pink";
    if (lower === "#9ca3af" || lower === "#4b5563" || lower.includes("gray")) return "gray";
    return null;
  }, []);

  const handlePenColorChange = useCallback((color: string) => {
    setPenColor(color);
    const matched = mapHexToHighlightColor(color);
    if (matched) {
      handleHighlightColorChange(matched);
    }
  }, [handleHighlightColorChange, mapHexToHighlightColor]);

  const handleSetBoxColor = useCallback((color: string) => {
    setBoxColor(color);
    setBoxConfig((prev) => ({ ...prev, color }));
  }, []);

  const activePenSize =
    activeTool === "highlighter" || activeTool === "smart_highlighter"
      ? highlighterSize
      : penSize;

  const handlePenSizeChange = useCallback(
    (size: number) => {
      if (activeTool === "highlighter" || activeTool === "smart_highlighter") {
        setHighlighterSize(size);
      } else {
        setPenSize(size);
      }
    },
    [activeTool]
  );

  // Helper to update a document in openDocs
  const updateDoc = useCallback((docId: string, updater: (d: WorkspaceDoc) => WorkspaceDoc) => {
    setOpenDocs((prev) => prev.map((doc) => (doc.id === docId ? updater(doc) : doc)));
  }, []);

  // History snapshot recording for a document (Undo/Redo isolation)
  const recordDocHistory = useCallback((docId: string) => {
    setOpenDocs((prev) =>
      prev.map((doc) => {
        if (doc.id !== docId) return doc;
        const currentSnapshot: HistorySnapshot = {
          highlights: [...doc.highlights],
          drawings: [...doc.drawings],
          boxes: [...doc.boxes],
          freeTexts: [...doc.freeTexts],
          textNotes: [...doc.textNotes],
        };
        const lastPast = doc.pastStates[doc.pastStates.length - 1];
        if (lastPast && areSnapshotsEqual(lastPast, currentSnapshot)) {
          return doc;
        }
        const newPast = [...doc.pastStates, currentSnapshot];
        if (newPast.length > 50) newPast.shift();
        return {
          ...doc,
          pastStates: newPast,
          futureStates: [],
        };
      })
    );
  }, []);

  // Undo / Redo for Active PDF only
  const handleUndo = useCallback(() => {
    if (!activeDoc || activeDoc.pastStates.length === 0) return;
    const targetId = activeDoc.id;
    setOpenDocs((prev) =>
      prev.map((doc) => {
        if (doc.id !== targetId || doc.pastStates.length === 0) return doc;
        const currentSnapshot: HistorySnapshot = {
          highlights: [...doc.highlights],
          drawings: [...doc.drawings],
          boxes: [...doc.boxes],
          freeTexts: [...doc.freeTexts],
          textNotes: [...doc.textNotes],
        };
        const past = [...doc.pastStates];
        const previous = past.pop()!;
        return {
          ...doc,
          pastStates: past,
          futureStates: [currentSnapshot, ...doc.futureStates],
          highlights: previous.highlights,
          drawings: previous.drawings,
          boxes: previous.boxes,
          freeTexts: previous.freeTexts,
          textNotes: previous.textNotes,
        };
      })
    );
  }, [activeDoc]);

  const handleRedo = useCallback(() => {
    if (!activeDoc || activeDoc.futureStates.length === 0) return;
    const targetId = activeDoc.id;
    setOpenDocs((prev) =>
      prev.map((doc) => {
        if (doc.id !== targetId || doc.futureStates.length === 0) return doc;
        const currentSnapshot: HistorySnapshot = {
          highlights: [...doc.highlights],
          drawings: [...doc.drawings],
          boxes: [...doc.boxes],
          freeTexts: [...doc.freeTexts],
          textNotes: [...doc.textNotes],
        };
        const future = [...doc.futureStates];
        const next = future.shift()!;
        return {
          ...doc,
          pastStates: [...doc.pastStates, currentSnapshot],
          futureStates: future,
          highlights: next.highlights,
          drawings: next.drawings,
          boxes: next.boxes,
          freeTexts: next.freeTexts,
          textNotes: next.textNotes,
        };
      })
    );
  }, [activeDoc]);

  // Core Document Loader with Smart De-duplication & Copy detection
  const loadPdfFromData = useCallback(
    async (
      data: Uint8Array,
      name: string,
      id: string,
      size: number
    ): Promise<void> => {
      // 1. Check if document is already open in workspace (De-duplication)
      let matchedDoc: WorkspaceDoc | undefined;
      setOpenDocs((currentDocs) => {
        matchedDoc = currentDocs.find(
          (d) => d.fileId === id || (d.fileSize === size && d.fileName === name)
        );
        return currentDocs;
      });

      if (matchedDoc) {
        // Bring existing document to focus and unhide if hidden
        setActiveDocId(matchedDoc.id);
        scrollWorkspaceToDoc(matchedDoc.id);
        if (matchedDoc.isHidden) {
          setOpenDocs((prev) =>
            prev.map((d) => (d.id === matchedDoc!.id ? { ...d, isHidden: false } : d))
          );
        }
        return;
      }

      setIsLoadingDoc(true);
      setLoadError(null);

      try {
        const copyForPdfJs = data.slice(0);
        const loadingTask = (pdfjsLib as any).getDocument({
          data: copyForPdfJs,
          cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/`,
          cMapPacked: true,
          stopAtErrors: false,
          ignoreErrors: true,
          standardFontDataUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/`,
          enableXfa: true,
          useSystemFonts: true,
        });

        const doc = await loadingTask.promise;
        const page1 = await doc.getPage(1);
        const viewport = page1.getViewport({ scale: 1.0 });
        pageDimensionCache.set(`${id}_default`, { width: viewport.width, height: viewport.height });
        pageDimensionCache.set(`${id}_1`, { width: viewport.width, height: viewport.height });

        // Save bytes to forage in background
        savePdfFileToForage(id, data).catch((err) =>
          console.warn("Background localforage save warning:", err)
        );

        // Load saved state from storage if exists
        const savedState = loadDocumentState(id);

        const newDoc: WorkspaceDoc = {
          id: id,
          fileId: id,
          fileName: name,
          fileSize: size,
          pdfDoc: doc,
          // PDF.js receives its own transferable copy above; keep the original
          // bytes here instead of duplicating a large PDF again in memory.
          pdfBytes: data,
          basePageDimensions: {
            width: viewport.width,
            height: viewport.height,
          },
          bookConfig: savedState?.bookConfig || null,
          totalPages: doc.numPages,
          currentPage: savedState?.currentPage
            ? Math.max(1, Math.min(doc.numPages, savedState.currentPage))
            : 1,
          viewMode: savedState?.viewMode || (doc.numPages === 1 ? "single" : "double"),
          scale: 1.0,
          fitMode: true,
          highlights: savedState?.highlights || [],
          textNotes: savedState?.textNotes || [],
          drawings: savedState?.drawings || [],
          boxes: savedState?.boxes || [],
          freeTexts: savedState?.freeTexts || [],
          customTOC: savedState?.customTOC || [],
          autoTOC: [],
          selectedIds: [],
          selectionState: null,
          pastStates: [],
          futureStates: [],
          isHidden: false,
          lastReadAt: Date.now(),
        };

        setOpenDocs((prev) => {
          // Double check de-duplication inside setter
          const exists = prev.some((d) => d.id === newDoc.id);
          if (exists) {
            return prev.map((d) => (d.id === newDoc.id ? { ...d, isHidden: false } : d));
          }
          return [...prev, newDoc];
        });

        setActiveDocId(newDoc.id);
        scrollWorkspaceToDoc(newDoc.id);
        setPenColor("#ef4444");
        setHighlightColor("yellow");

        // The first page can be viewed immediately; outline extraction can be
        // expensive on large PDFs, so finish it without blocking the workspace.
        window.setTimeout(() => {
          void (async () => {
            try {
              const outline = await doc.getOutline();
              if (outline?.length) {
                const mappedTOC = await mapPdfOutline(doc, outline);
                if (mappedTOC.length) {
                  updateDoc(newDoc.id, (current) => ({ ...current, autoTOC: mappedTOC }));
                }
              }
            } catch {
              // A missing or malformed outline does not prevent reading the PDF.
            }
          })();
        }, 0);
      } catch (err: any) {
        console.error("Error loading PDF document:", err);
        setLoadError(
          "Không thể mở file PDF này. Vui lòng kiểm tra lại định dạng file hoặc thử tải file PDF khác."
        );
      } finally {
        setIsLoadingDoc(false);
      }
    },
    [scrollWorkspaceToDoc, updateDoc]
  );

  // Restore last opened book on initial mount
  useEffect(() => {
    let isMounted = true;
    const restoreLastBook = async () => {
      try {
        const lastId = getLastOpenedFileId();
        if (lastId) {
          const forageBytes = await loadPdfFileFromForage(lastId);
          if (forageBytes && forageBytes.byteLength > 0 && isMounted) {
            const savedState = loadDocumentState(lastId);
            const savedBooks = getSavedBooks();
            const bookInfo = savedBooks.find((b) => b.id === lastId);
            const fileNameToUse = savedState?.fileName || bookInfo?.name || "Tài liệu.pdf";
            await loadPdfFromData(forageBytes, fileNameToUse, lastId, forageBytes.byteLength);
          }
        }
      } catch (err) {
        console.warn("Could not restore last opened document:", err);
      } finally {
        if (isMounted) {
          setIsLoadingDoc(false);
        }
      }
    };

    restoreLastBook();
    return () => {
      isMounted = false;
    };
  }, [loadPdfFromData]);

  // Auto-save all open documents independently
  useEffect(() => {
    if (openDocs.length === 0) return;
    const saveTimer = window.setTimeout(() => {
      openDocs.forEach((doc) => {
        if (!doc.pdfDoc || !doc.fileId) return;
        saveDocumentState({
          fileId: doc.fileId,
          fileName: doc.fileName,
          fileSize: doc.fileSize,
          totalPages: doc.totalPages,
          currentPage: doc.currentPage,
          viewMode: doc.viewMode,
          zoom: doc.scale,
          highlights: doc.highlights,
          textNotes: doc.textNotes,
          drawings: doc.drawings,
          boxes: doc.boxes,
          freeTexts: doc.freeTexts,
          customTOC: doc.customTOC,
          bookConfig: doc.bookConfig || undefined,
          lastReadAt: doc.lastReadAt,
        });
      });
    }, 500);
    return () => window.clearTimeout(saveTimer);
  }, [openDocs]);

  // Tab Action: Toggle Hide (EyeOff / Eye)
  const handleToggleHideDoc = useCallback((id: string) => {
    setOpenDocs((prev) => {
      const updated = prev.map((d) =>
        d.id === id ? { ...d, isHidden: !d.isHidden } : d
      );
      const target = updated.find((d) => d.id === id);

      if (target && target.isHidden && activeDocId === id) {
        const firstVisible = updated.find((d) => !d.isHidden);
        if (firstVisible) {
          setActiveDocId(firstVisible.id);
        }
      } else if (target && !target.isHidden) {
        setActiveDocId(id);
      }
      return updated;
    });
  }, [activeDocId]);

  // Tab Action: Close Document (X)
  const handleCloseDoc = useCallback((id: string) => {
    // 1. Locate the document to close before state change
    const docToClose = openDocs.find((d) => d.id === id);

    // 2. Immediately remove from openDocs so UI responds with 0ms delay
    setOpenDocs((prev) => {
      const filtered = prev.filter((d) => d.id !== id);
      if (activeDocId === id) {
        if (filtered.length > 0) {
          const nextActive = filtered.find((d) => !d.isHidden) || filtered[0];
          setActiveDocId(nextActive.id);
        } else {
          setActiveDocId("");
        }
      }
      return filtered;
    });

    // 3. Defer heavy state saving, cache cleanup, and worker destruction
    // to the next tick so the UI does not freeze or drop frames
    if (docToClose) {
      setTimeout(() => {
        try {
          saveDocumentState({
            fileId: docToClose.fileId,
            fileName: docToClose.fileName,
            fileSize: docToClose.fileSize,
            totalPages: docToClose.totalPages,
            currentPage: docToClose.currentPage,
            viewMode: docToClose.viewMode,
            zoom: docToClose.scale,
            highlights: docToClose.highlights,
            textNotes: docToClose.textNotes,
            drawings: docToClose.drawings,
            boxes: docToClose.boxes,
            freeTexts: docToClose.freeTexts,
            customTOC: docToClose.customTOC,
            bookConfig: docToClose.bookConfig || undefined,
            lastReadAt: Date.now(),
          });
        } catch (saveErr) {
          console.warn("Deferred save on close warning:", saveErr);
        }

        clearDocCanvasCache(docToClose.fileId);

        try {
          docToClose.pdfDoc?.destroy?.();
        } catch (destroyErr) {
          console.warn("Deferred pdfDoc destroy warning:", destroyErr);
        }
      }, 30);
    }
  }, [openDocs, activeDocId]);

  const handleActivateDoc = useCallback((id: string) => {
    setActiveDocId(id);
  }, []);

  const handleSelectTabDoc = useCallback((id: string) => {
    setActiveDocId(id);
    scrollWorkspaceToDoc(id);
  }, [scrollWorkspaceToDoc]);

  const handleReorderDocs = useCallback((sourceId: string, targetId: string, insertBefore: boolean) => {
    setOpenDocs((prev) => {
      const sourceIndex = prev.findIndex((doc) => doc.id === sourceId);
      const targetIndex = prev.findIndex((doc) => doc.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(sourceIndex, 1);
      const adjustedTargetIndex = targetIndex - (sourceIndex < targetIndex ? 1 : 0);
      const insertionIndex = adjustedTargetIndex + (insertBefore ? 0 : 1);
      next.splice(insertionIndex, 0, moved);
      return next;
    });
    setActiveDocId(sourceId);
    scrollWorkspaceToDoc(sourceId);
  }, [scrollWorkspaceToDoc]);

  // Handle User File Upload
  const handleFileUpload = async (
    fileInput: File | File[],
    skipSort: boolean = false
  ) => {
    try {
      const rawList = Array.isArray(fileInput) ? fileInput : [fileInput];
      const isImage = (f: File) =>
        f.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp|gif)$/i.test(f.name);

      if (!skipSort && rawList.length > 1 && rawList.some(isImage)) {
        setPendingImageFiles(rawList);
        setIsImageOrderModalOpen(true);
        return;
      }

      setIsLoadingDoc(true);
      setLoadError(null);

      let targetInput = fileInput;
      if (Array.isArray(fileInput) && fileInput.length > 1) {
        const firstPdf = fileInput.find(
          (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
        );
        if (firstPdf && fileInput.length === 1) {
          targetInput = firstPdf;
        }
      }

      const { bytes, fileName: processedName } = await convertAnyFileToPdfBytes(
        targetInput,
        skipSort
      );

      let safeId = "";
      if (Array.isArray(targetInput)) {
        safeId = `doc_multi_images_${targetInput.length}_${targetInput[0].size}_${Date.now()}`;
      } else {
        safeId = `doc_${targetInput.name.replace(/[^a-zA-Z0-9]/g, "_")}_${targetInput.size}`;
      }

      await loadPdfFromData(bytes, processedName, safeId, bytes.byteLength);
    } catch (err: any) {
      console.error("File upload/conversion error:", err);
      setLoadError(
        err?.message || "Không thể đọc hoặc xử lý tệp tin. Vui lòng thử lại."
      );
      setIsLoadingDoc(false);
    }
  };

  const handleConfirmOrderedImages = async (orderedFiles: File[]) => {
    setIsImageOrderModalOpen(false);
    if (!orderedFiles || orderedFiles.length === 0) return;
    await handleFileUpload(orderedFiles, true);
  };

  // Load sample book
  const handleLoadSample = async () => {
    const bytes = generateSamplePdfBytes();
    await loadPdfFromData(
      bytes,
      SAMPLE_PDF_NAME,
      "sample-book-guide",
      bytes.length
    );
  };

  // Create new blank book
  const handleCreateBook = async (config: CustomBookConfig) => {
    try {
      setIsLoadingDoc(true);
      setLoadError(null);

      const bytes = await createBlankBookPdfBytes(config, 1);
      const newId = `custom_book_${Date.now()}`;
      const newName = `Sách mới.pdf`;

      await loadPdfFromData(bytes, newName, newId, bytes.byteLength);
      updateDoc(newId, (d) => ({
        ...d,
        bookConfig: config,
        viewMode: "double",
      }));
    } catch (err: any) {
      console.error("Error creating blank book:", err);
      setLoadError("Không thể khởi tạo trang sách. Vui lòng thử lại.");
    } finally {
      setIsLoadingDoc(false);
    }
  };

  // Add blank page to active custom book
  const handleAddPage = async () => {
    if (!activeDoc) return;
    try {
      setIsLoadingDoc(true);
      let existingBytes = activeDoc.pdfBytes;
      if (!existingBytes || existingBytes.byteLength === 0) {
        existingBytes = await loadPdfFileFromForage(activeDoc.fileId);
      }
      if (!existingBytes) {
        setLoadError("Không tìm thấy dữ liệu tệp tin để thêm trang mới.");
        return;
      }

      let config = activeDoc.bookConfig;
      if (!config && activeDoc.basePageDimensions) {
        config = {
          orientation:
            activeDoc.basePageDimensions.width > activeDoc.basePageDimensions.height
              ? "landscape"
              : "portrait",
          bgColor: "#FFFFFF",
        };
      }

      const updatedBytes = await appendBlankPageToPdfBytes(
        existingBytes.slice(0),
        config as any
      );

      savePdfFileToForage(activeDoc.fileId, updatedBytes.slice(0)).catch((err) =>
        console.warn("Error updating forage book bytes:", err)
      );

      const copyForPdfJs = updatedBytes.slice(0);
      const loadingTask = (pdfjsLib as any).getDocument({
        data: copyForPdfJs,
        cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/`,
        cMapPacked: true,
        stopAtErrors: false,
        ignoreErrors: true,
        standardFontDataUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/`,
        enableXfa: true,
        useSystemFonts: true,
      });

      const newDoc = await loadingTask.promise;
      const newTotal = newDoc.numPages;

      updateDoc(activeDoc.id, (d) => ({
        ...d,
        pdfDoc: newDoc,
        pdfBytes: updatedBytes.slice(0),
        totalPages: newTotal,
        currentPage: newTotal,
        fileSize: updatedBytes.byteLength,
      }));
    } catch (err: any) {
      console.error("Error adding page to custom book:", err);
      setLoadError("Không thể thêm trang mới. Vui lòng thử lại.");
    } finally {
      setIsLoadingDoc(false);
    }
  };

  // Reset all tabs to upload screen
  const handleResetToUpload = () => {
    try {
      localStorage.removeItem("pdf_reader_last_opened_id");
      setOpenDocs([]);
      setActiveDocId("");
      setIsSidebarOpen(false);
      setLoadError(null);
    } catch (err) {
      console.error("Error resetting to upload:", err);
    }
  };

  // Open book from Library
  const handleSelectBook = async (book: SavedBook) => {
    try {
      setIsLibraryModalOpen(false);
      // If already open, focus it
      const existing = openDocs.find((d) => d.fileId === book.id);
      if (existing) {
        setActiveDocId(existing.id);
        if (existing.isHidden) {
          setOpenDocs((prev) =>
            prev.map((d) => (d.id === existing.id ? { ...d, isHidden: false } : d))
          );
        }
        return;
      }

      setIsLoadingDoc(true);
      const data = await loadPdfFileFromForage(book.id);
      if (data && data.byteLength > 0) {
        await loadPdfFromData(data, book.name, book.id, data.byteLength);
      } else {
        setLoadError(
          "Không tìm thấy dữ liệu tệp tin. Có thể tệp tin đã bị xóa khỏi bộ nhớ đệm trình duyệt."
        );
        setIsLoadingDoc(false);
      }
    } catch (err) {
      console.error("Error opening book from library:", err);
      setIsLoadingDoc(false);
    }
  };

  // Trigger file dialog
  const triggerUpload = (acceptStr: string, multiple: boolean) => {
    setIsEmptyStateUploadMenuOpen(false);
    const input = document.createElement("input");
    input.type = "file";
    input.accept = acceptStr;
    input.multiple = multiple;
    input.onchange = (e) => {
      const rawFiles = (e.target as HTMLInputElement).files;
      if (!rawFiles || rawFiles.length === 0) return;
      const rawList = Array.from(rawFiles);
      handleFileUpload(rawList.length === 1 ? rawList[0] : rawList);
    };
    input.click();
  };

  // Drag-and-drop & paste files onto window
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const dtFiles = e.dataTransfer?.files;
      if (!dtFiles || dtFiles.length === 0) return;
      const rawList = Array.from(dtFiles);
      handleFileUpload(rawList.length === 1 ? rawList[0] : rawList);
    };
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  // Keyboard navigation & tool shortcuts
  const lastToolShortcutPressRef = useRef<{ key: string; time: number } | null>(null);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable ||
        Boolean(target.closest('[contenteditable="true"]'))
      ) {
        return;
      }

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;

      // Z resets the selected PDF's user zoom to 100% (fit scale).
      if (e.key.toLowerCase() === "z") {
        if (activeDoc) {
          e.preventDefault();
          updateDoc(activeDoc.id, (doc) => ({ ...doc, scale: 1.0, fitMode: true, viewportRevision: (doc.viewportRevision || 0) + 1 }));
        }
        return;
      }

      // Page Navigation on activeDoc
      if (activeDoc) {
        if (e.key === "ArrowLeft" || e.key === "PageUp") {
          e.preventDefault();
          updateDoc(activeDoc.id, (d) => ({
            ...d,
            currentPage: Math.max(1, d.currentPage - 1),
          }));
        } else if (e.key === "ArrowRight" || e.key === "PageDown") {
          e.preventDefault();
          updateDoc(activeDoc.id, (d) => ({
            ...d,
            currentPage: Math.min(d.totalPages, d.currentPage + 1),
          }));
        }
      }

      // Quick Tool Hotkeys
      const key = e.key.toLowerCase();
      if (key === "v") {
        setActiveTool("select");
        e.preventDefault();
        return;
      }
      if (key === "p" || key === "h") {
        const now = Date.now();
        const previous = lastToolShortcutPressRef.current;
        const isDoublePress =
          previous?.key === key && now - previous.time <= 400;

        setActiveTool(
          key === "p"
            ? isDoublePress ? "smart_pen" : "pen"
            : isDoublePress ? "smart_highlighter" : "highlighter"
        );
        lastToolShortcutPressRef.current = isDoublePress ? null : { key, time: now };
        e.preventDefault();
        return;
      }
      else if (key === "x") setActiveTool("eraser");
      else if (key === "t") setActiveTool("text");
      else if (key === "n") setActiveTool("sticky");
      else if (key === "b" || key === "d") setActiveTool("box");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeDoc, handleUndo, handleRedo, updateDoc]);

  // Page, Zoom & ViewMode Handlers per document
  const handlePageChange = useCallback((docId: string, page: number) => {
    setOpenDocs((prev) => {
      const current = prev.find((doc) => doc.id === docId);
      if (!current) return prev;
      const nextPage = Math.max(1, Math.min(current.totalPages, page));
      if (current.currentPage === nextPage) return prev;
      return prev.map((doc) => doc.id === docId ? { ...doc, currentPage: nextPage } : doc);
    });
  }, []);

  const handleZoomChange = useCallback((docId: string, scale: number, resetFitMode?: boolean) => {
    const nextScale = resetFitMode ? 1.0 : Math.min(50, Math.max(0.2, scale));
    updateDoc(docId, (d) => ({
      ...d,
      scale: nextScale,
      fitMode: Boolean(resetFitMode),
      viewportRevision: resetFitMode ? (d.viewportRevision || 0) + 1 : d.viewportRevision,
    }));
  }, [updateDoc]);

  const handleViewModeChange = useCallback((docId: string, mode: ViewMode) => {
    updateDoc(docId, (d) => ({ ...d, viewMode: mode, scale: 1.0, fitMode: true, viewportRevision: (d.viewportRevision || 0) + 1 }));
  }, [updateDoc]);

  const handleUpdateBoxConfig = useCallback((docId: string, updates: Partial<BoxConfig>) => {
    setBoxConfig((prev) => ({ ...prev, ...updates }));
    if (updates.color) setBoxColor(updates.color);
  }, []);

  // Text selection handler
  const handleTextSelected = useCallback(
    (
      docId: string,
      pageNumber: number,
      text: string,
      rects: NormalizedRect[],
      clientPos: { x: number; y: number }
    ) => {
      setActiveDocId(docId);
      updateDoc(docId, (d) => ({
        ...d,
        selectionState: {
          pageNumber,
          text,
          rects,
          position: clientPos,
        },
      }));
    },
    [updateDoc]
  );

  // Direct Annotations Add/Update/Delete Handlers (per document)
  const handleAddHighlightDirect = useCallback(
    (docId: string, highlight: HighlightAnnotation) => {
      setActiveDocId(docId);
      recordDocHistory(docId);
      updateDoc(docId, (d) => ({
        ...d,
        highlights: [...d.highlights, highlight],
        selectionState: null,
      }));
      if (highlight.color) handleHighlightColorChange(highlight.color);
      window.getSelection()?.removeAllRanges();
    },
    [recordDocHistory, updateDoc, handleHighlightColorChange]
  );

  const handleUpdateHighlight = useCallback(
    (docId: string, id: string, updates: Partial<HighlightAnnotation>, skipHistory?: boolean) => {
      if (!skipHistory) recordDocHistory(docId);
      updateDoc(docId, (d) => ({
        ...d,
        highlights: d.highlights.map((h) => (h.id === id ? { ...h, ...updates } : h)),
      }));
    },
    [recordDocHistory, updateDoc]
  );

  const handleUpdateHighlightNote = useCallback(
    (docId: string, id: string, note: string) => {
      recordDocHistory(docId);
      updateDoc(docId, (d) => ({
        ...d,
        highlights: d.highlights.map((h) => (h.id === id ? { ...h, note } : h)),
      }));
    },
    [recordDocHistory, updateDoc]
  );

  const handleUpdateHighlightColor = useCallback(
    (docId: string, id: string, color: HighlightColor) => {
      recordDocHistory(docId);
      updateDoc(docId, (d) => ({
        ...d,
        highlights: d.highlights.map((h) => (h.id === id ? { ...h, color } : h)),
      }));
      handleHighlightColorChange(color);
    },
    [recordDocHistory, updateDoc, handleHighlightColorChange]
  );

  const handleDeleteHighlight = useCallback(
    (docId: string, id: string) => {
      recordDocHistory(docId);
      updateDoc(docId, (d) => ({
        ...d,
        highlights: d.highlights.filter((h) => h.id !== id),
      }));
    },
    [recordDocHistory, updateDoc]
  );

  const handleAddNote = useCallback(
    (docId: string, note: Omit<TextNoteAnnotation, "id" | "createdAt">) => {
      setActiveDocId(docId);
      recordDocHistory(docId);
      const newNote: TextNoteAnnotation = {
        ...note,
        id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        createdAt: Date.now(),
      };
      updateDoc(docId, (d) => ({ ...d, textNotes: [...d.textNotes, newNote] }));
    },
    [recordDocHistory, updateDoc]
  );

  const handleUpdateNote = useCallback(
    (docId: string, id: string, updates: Partial<TextNoteAnnotation>, skipHistory?: boolean) => {
      if (!skipHistory) recordDocHistory(docId);
      updateDoc(docId, (d) => ({
        ...d,
        textNotes: d.textNotes.map((n) => (n.id === id ? { ...n, ...updates } : n)),
      }));
    },
    [recordDocHistory, updateDoc]
  );

  const handleDeleteNote = useCallback(
    (docId: string, id: string) => {
      recordDocHistory(docId);
      updateDoc(docId, (d) => ({
        ...d,
        textNotes: d.textNotes.filter((n) => n.id !== id),
      }));
    },
    [recordDocHistory, updateDoc]
  );

  const handleAddBox = useCallback(
    (docId: string, box: Omit<BoxAnnotation, "id" | "createdAt">) => {
      setActiveDocId(docId);
      recordDocHistory(docId);
      const newBox: BoxAnnotation = {
        ...box,
        id: `box_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        createdAt: Date.now(),
      };
      updateDoc(docId, (d) => ({ ...d, boxes: [...d.boxes, newBox] }));
    },
    [recordDocHistory, updateDoc]
  );

  const handleUpdateBox = useCallback(
    (docId: string, id: string, updates: Partial<BoxAnnotation>, skipHistory?: boolean) => {
      if (!skipHistory) recordDocHistory(docId);
      updateDoc(docId, (d) => ({
        ...d,
        boxes: d.boxes.map((b) => (b.id === id ? { ...b, ...updates } : b)),
      }));
    },
    [recordDocHistory, updateDoc]
  );

  const handleDeleteBox = useCallback(
    (docId: string, id: string) => {
      recordDocHistory(docId);
      updateDoc(docId, (d) => ({
        ...d,
        boxes: d.boxes.filter((b) => b.id !== id),
      }));
    },
    [recordDocHistory, updateDoc]
  );

  const handleAddFreeText = useCallback(
    (docId: string, textData: Omit<FreeTextAnnotation, "id" | "createdAt"> & { id?: string }) => {
      setActiveDocId(docId);
      recordDocHistory(docId);
      const newText: FreeTextAnnotation = {
        ...textData,
        id: textData.id || `text_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        createdAt: Date.now(),
      };
      updateDoc(docId, (d) => ({ ...d, freeTexts: [...d.freeTexts, newText] }));
    },
    [recordDocHistory, updateDoc]
  );

  const handleUpdateFreeText = useCallback(
    (docId: string, id: string, updates: Partial<FreeTextAnnotation>, skipHistory?: boolean) => {
      if (!skipHistory) recordDocHistory(docId);
      updateDoc(docId, (d) => ({
        ...d,
        freeTexts: d.freeTexts.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      }));
    },
    [recordDocHistory, updateDoc]
  );

  const handleDeleteFreeText = useCallback(
    (docId: string, id: string) => {
      recordDocHistory(docId);
      updateDoc(docId, (d) => ({
        ...d,
        freeTexts: d.freeTexts.filter((t) => t.id !== id),
      }));
    },
    [recordDocHistory, updateDoc]
  );

  const handleAddStroke = useCallback(
    (docId: string, stroke: Omit<DrawingStroke, "id" | "createdAt">): string => {
      setActiveDocId(docId);
      recordDocHistory(docId);
      const newId = `stroke_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const newStroke: DrawingStroke = {
        ...stroke,
        id: newId,
        createdAt: Date.now(),
      };
      updateDoc(docId, (d) => ({ ...d, drawings: [...d.drawings, newStroke] }));
      return newId;
    },
    [recordDocHistory, updateDoc]
  );

  const handleUpdateStroke = useCallback(
    (docId: string, id: string, updates: Partial<DrawingStroke>, skipHistory?: boolean) => {
      if (!skipHistory) recordDocHistory(docId);
      updateDoc(docId, (d) => ({
        ...d,
        drawings: d.drawings.map((s) => (s.id === id ? { ...s, ...updates } : s)),
      }));
    },
    [recordDocHistory, updateDoc]
  );

  const handleDeleteStroke = useCallback(
    (docId: string, id: string) => {
      recordDocHistory(docId);
      updateDoc(docId, (d) => ({
        ...d,
        drawings: d.drawings.filter((s) => s.id !== id),
      }));
    },
    [recordDocHistory, updateDoc]
  );

  const handleSelect = useCallback(
    (docId: string, id: string, isShift: boolean) => {
      setActiveDocId(docId);
      updateDoc(docId, (d) => {
        if (!id) return { ...d, selectedIds: [] };
        const exists = d.selectedIds.includes(id);
        const newSelected = isShift
          ? exists
            ? d.selectedIds.filter((i) => i !== id)
            : [...d.selectedIds, id]
          : [id];
        return { ...d, selectedIds: newSelected };
      });
    },
    [updateDoc]
  );

  const handleClearSelection = useCallback(
    (docId: string) => {
      updateDoc(docId, (d) => ({ ...d, selectedIds: [] }));
    },
    [updateDoc]
  );

  // Custom TOC Handlers for activeDoc
  const handleAddCustomTOCItem = (
    title: string,
    pageNumber: number,
    level: 1 | 2 | 3,
    parentId?: string | null
  ) => {
    if (!activeDoc) return;
    const newItem: CustomTOCItem = {
      id: `toc_${Date.now()}`,
      title,
      pageNumber,
      level,
      parentId: parentId || null,
      createdAt: Date.now(),
    };
    updateDoc(activeDoc.id, (d) => ({ ...d, customTOC: [...d.customTOC, newItem] }));
  };

  const handleUpdateCustomTOCItem = (id: string, title: string, pageNumber: number) => {
    if (!activeDoc) return;
    updateDoc(activeDoc.id, (d) => ({
      ...d,
      customTOC: d.customTOC.map((it) => (it.id === id ? { ...it, title, pageNumber } : it)),
    }));
  };

  const handleDeleteCustomTOCItem = (id: string) => {
    if (!activeDoc) return;
    updateDoc(activeDoc.id, (d) => ({
      ...d,
      customTOC: d.customTOC.filter((it) => it.id !== id && it.parentId !== id),
    }));
  };

  const handleMoveCustomTOCItem = (id: string, direction: "up" | "down") => {
    if (!activeDoc) return;
    updateDoc(activeDoc.id, (d) => {
      const idx = d.customTOC.findIndex((it) => it.id === id);
      if (idx === -1) return d;
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= d.customTOC.length) return d;
      const newTOC = [...d.customTOC];
      const temp = newTOC[idx];
      newTOC[idx] = newTOC[targetIdx];
      newTOC[targetIdx] = temp;
      return { ...d, customTOC: newTOC };
    });
  };

  const handleReorderCustomTOC = (fromC1Id: string, toC1Id: string) => {
    if (!activeDoc || fromC1Id === toC1Id) return;
    updateDoc(activeDoc.id, (d) => {
      const c1List = d.customTOC.filter((it) => it.level === 1 || !it.parentId);
      const fromIndex = c1List.findIndex((it) => it.id === fromC1Id);
      const toIndex = c1List.findIndex((it) => it.id === toC1Id);
      if (fromIndex === -1 || toIndex === -1) return d;
      const newTOC = [...d.customTOC];
      const [moved] = newTOC.splice(fromIndex, 1);
      newTOC.splice(toIndex, 0, moved);
      return { ...d, customTOC: newTOC };
    });
  };

  const handleClearAllAnnotations = () => {
    if (!activeDoc) return;
    if (window.confirm("Bạn có chắc chắn muốn xóa toàn bộ ghi chú trên sách này?")) {
      updateDoc(activeDoc.id, (d) => ({
        ...d,
        highlights: [],
        textNotes: [],
        drawings: [],
        boxes: [],
        freeTexts: [],
      }));
    }
  };

  const handleExportData = () => {
    if (!activeDoc) return;
    const docState: PDFDocumentState = {
      fileId: activeDoc.fileId,
      fileName: activeDoc.fileName,
      fileSize: activeDoc.fileSize,
      totalPages: activeDoc.totalPages,
      currentPage: activeDoc.currentPage,
      viewMode: activeDoc.viewMode,
      zoom: activeDoc.scale,
      highlights: activeDoc.highlights,
      textNotes: activeDoc.textNotes,
      drawings: activeDoc.drawings,
      boxes: activeDoc.boxes,
      freeTexts: activeDoc.freeTexts,
      customTOC: activeDoc.customTOC,
      lastReadAt: Date.now(),
    };
    const jsonStr = exportDocumentDataJSON(docState);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeDoc.fileName.replace(/\.pdf$/i, "")}_annotations.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportData = (file: File) => {
    if (!activeDoc) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const parsed = importDocumentDataJSON(content);
      if (parsed) {
        updateDoc(activeDoc.id, (d) => ({
          ...d,
          highlights: parsed.highlights || d.highlights,
          textNotes: parsed.textNotes || d.textNotes,
          drawings: parsed.drawings || d.drawings,
          boxes: parsed.boxes || d.boxes,
          freeTexts: parsed.freeTexts || d.freeTexts,
          customTOC: parsed.customTOC || d.customTOC,
        }));
        alert("Đã nhập dữ liệu ghi chú thành công!");
      } else {
        alert("File JSON không hợp lệ!");
      }
    };
    reader.readAsText(file);
  };

  const totalAnnotations = activeDoc
    ? activeDoc.highlights.length +
      activeDoc.textNotes.length +
      activeDoc.drawings.length +
      activeDoc.boxes.length +
      activeDoc.freeTexts.length
    : 0;

  return (
    <div className="h-screen max-h-screen bg-neutral-100 flex flex-col text-neutral-900 font-['Inter',sans-serif] antialiased select-none overflow-hidden">
      {/* Top Application Toolbar */}
      <Toolbar
        fileName={activeDoc?.fileName || ""}
        currentPage={activeDoc?.currentPage || 1}
        totalPages={activeDoc?.totalPages || 0}
        viewMode={activeDoc?.viewMode || "double"}
        scale={activeDoc?.scale || 1.0}
        activeTool={activeTool}
        penColor={penColor}
        penSize={activePenSize}
        highlightColor={highlightColor}
        boxColor={boxColor}
        isSidebarOpen={isSidebarOpen}
        totalAnnotations={totalAnnotations}
        isCustomBookCreated={Boolean(activeDoc?.bookConfig || activeDoc?.pdfDoc)}
        onCreateBook={handleCreateBook}
        onAddPage={handleAddPage}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        onFileUpload={handleFileUpload}
        onLoadSample={handleLoadSample}
        onResetToSample={handleResetToUpload}
        onOpenSaveBookModal={() => setIsSaveBookModalOpen(true)}
        onOpenLibraryModal={() => setIsLibraryModalOpen(true)}
        onPageChange={(p) => activeDoc && handlePageChange(activeDoc.id, p)}
        onViewModeChange={(mode) => activeDoc && handleViewModeChange(activeDoc.id, mode)}
        onZoomChange={(newScale, resetFit) =>
          activeDoc && handleZoomChange(activeDoc.id, newScale, resetFit)
        }
        onActiveToolChange={setActiveTool}
        onPenColorChange={handlePenColorChange}
        onPenSizeChange={handlePenSizeChange}
        onHighlightColorChange={handleHighlightColorChange}
        onBoxColorChange={handleSetBoxColor}
        onOpenExportModal={() => setIsExportModalOpen(true)}
      />

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden relative min-h-0">
        {/* Mobile/Tablet Backdrop when Sidebar is Open */}
        {isSidebarOpen && !!activeDoc?.pdfDoc && (
          <div
            className="md:hidden fixed inset-0 top-[38px] bg-transparent z-25"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Left Sidebar (Mục lục đa cấp & Ghi chú của activeDoc) */}
        <Sidebar
          isOpen={isSidebarOpen && !!activeDoc?.pdfDoc}
          onClose={() => setIsSidebarOpen(false)}
          currentPage={activeDoc?.currentPage || 1}
          totalPages={activeDoc?.totalPages || 0}
          customTOC={activeDoc?.customTOC || []}
          autoTOC={activeDoc?.autoTOC || []}
          highlights={activeDoc?.highlights || []}
          textNotes={activeDoc?.textNotes || []}
          boxes={activeDoc?.boxes || []}
          freeTexts={activeDoc?.freeTexts || []}
          drawings={activeDoc?.drawings || []}
          onPageSelect={(p) => {
            if (activeDoc) {
              handlePageChange(activeDoc.id, p);
              const targetEl =
                document.getElementById(`page-container-${activeDoc.id}-${p}`) ||
                document.getElementById(`page-container-${p}`);
              if (targetEl) {
                targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
              }
            }
          }}
          onAddCustomTOCItem={handleAddCustomTOCItem}
          onUpdateCustomTOCItem={handleUpdateCustomTOCItem}
          onDeleteCustomTOCItem={handleDeleteCustomTOCItem}
          onMoveCustomTOCItem={handleMoveCustomTOCItem}
          onReorderCustomTOC={handleReorderCustomTOC}
          onDeleteHighlight={(id) => activeDoc && handleDeleteHighlight(activeDoc.id, id)}
          onDeleteNote={(id) => activeDoc && handleDeleteNote(activeDoc.id, id)}
          onDeleteBox={(id) => activeDoc && handleDeleteBox(activeDoc.id, id)}
          onDeleteFreeText={(id) => activeDoc && handleDeleteFreeText(activeDoc.id, id)}
          onClearAllAnnotations={handleClearAllAnnotations}
          onExportData={handleExportData}
          onImportData={handleImportData}
        />

        {/* Center Viewer Canvas Area */}
        <div className="flex-1 relative overflow-hidden bg-[#fafafa] flex flex-col min-h-0">
          {/* Tab Bar directly above the viewing area */}
          {openDocs.length > 0 && (
            <TabBar
              docs={openDocs}
              activeDocId={activeDocId}
              onSelectDoc={handleSelectTabDoc}
              onToggleHide={handleToggleHideDoc}
              onCloseDoc={handleCloseDoc}
              onReorderDocs={handleReorderDocs}
            />
          )}

          {isLoadingDoc && openDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center w-full h-full">
              <div className="inline-flex flex-col items-center justify-center gap-3 p-8 my-auto mx-auto bg-white rounded-xl shadow-lg border border-neutral-200">
                <div className="w-10 h-10 border-3 border-neutral-900 border-t-transparent rounded-full animate-spin" />
                <div className="text-center">
                  <p className="text-sm font-semibold text-neutral-900">
                    Đang chuẩn bị cuốn sách...
                  </p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Hệ thống đang tải các trang PDF
                  </p>
                </div>
              </div>
            </div>
          ) : loadError && openDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center w-full h-full">
              <div className="inline-flex flex-col items-center justify-center gap-3 p-8 my-auto bg-white rounded-xl shadow-lg border border-red-200 max-w-md text-center">
                <AlertCircle size={36} className="text-red-500" />
                <p className="text-sm font-semibold text-neutral-900">{loadError}</p>
                <button
                  onClick={handleLoadSample}
                  className="mt-2 px-4 py-2 bg-neutral-900 text-white rounded-lg text-xs font-semibold hover:bg-black transition-colors"
                >
                  Mở lại sách mẫu
                </button>
              </div>
            </div>
          ) : openDocs.length === 0 ? (
            /* Empty State: Upload or Create Book */
            <div className="flex flex-col items-center justify-center w-full h-full">
              <div className="inline-flex flex-col items-center justify-center gap-6 p-12 my-auto bg-white rounded-2xl shadow-xl border border-neutral-200 max-w-lg text-center animate-in fade-in zoom-in-95">
                <div className="w-20 h-20 bg-[#f5c41a]/10 rounded-full flex items-center justify-center mb-2">
                  <Upload size={40} className="text-[#f5c41a]" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-neutral-900 mb-2">
                    Tải tệp tin lên
                  </h2>
                  <p className="text-sm text-neutral-500 mb-6">
                    Chọn tệp PDF hoặc Ảnh (PNG, JPG) từ thiết bị.
                  </p>
                </div>
                <div
                  className="relative inline-flex flex-col items-center"
                  ref={emptyStateUploadMenuRef}
                >
                  <button
                    onClick={() => setIsEmptyStateUploadMenuOpen((prev) => !prev)}
                    className="cursor-pointer bg-[#f5c41a] hover:bg-[#e5b512] text-neutral-950 font-bold px-7 py-2.5 rounded-xl shadow-md transition-all hover:-translate-y-0.5 inline-flex items-center gap-2 select-none"
                  >
                    <Upload size={16} />
                    <span>Tải lên tệp</span>
                    <ChevronDown
                      size={14}
                      className={`transition-transform duration-150 ${
                        isEmptyStateUploadMenuOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {isEmptyStateUploadMenuOpen && (
                    <div className="absolute left-1/2 -translate-x-1/2 top-[calc(100%+6px)] w-full min-w-[130px] bg-white rounded-xl shadow-xl border border-neutral-200 py-1 z-[99999] animate-in fade-in zoom-in-95 duration-100 flex flex-col overflow-hidden text-left">
                      <button
                        onClick={() => triggerUpload(".pdf,application/pdf", false)}
                        className="w-full px-4 py-2 text-left text-xs font-semibold text-neutral-800 hover:bg-neutral-100 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Tải PDF
                      </button>
                      <button
                        onClick={() =>
                          triggerUpload(".png,.jpg,.jpeg,image/png,image/jpeg", true)
                        }
                        className="w-full px-4 py-2 text-left text-xs font-semibold text-neutral-800 hover:bg-neutral-100 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Tải Ảnh
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : visibleDocs.length === 0 ? (
            /* All PDFs Hidden View */
            <div className="flex flex-col items-center justify-center w-full h-full p-8 text-center select-none">
              <div className="p-8 bg-white rounded-2xl shadow-lg border border-neutral-200 max-w-md flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500">
                  <EyeOff size={24} />
                </div>
                <h3 className="text-base font-bold text-neutral-900">
                  Tất cả PDF đang được ẩn
                </h3>
                <p className="text-xs text-neutral-500 leading-relaxed">
                  Nhấp vào biểu tượng mắt trên thanh tab để hiển thị lại tài liệu của bạn.
                </p>
                <button
                  onClick={() => {
                    setOpenDocs((prev) => prev.map((d) => ({ ...d, isHidden: false })));
                  }}
                  className="mt-2 px-4 py-2 bg-neutral-900 text-white rounded-lg text-xs font-semibold hover:bg-black transition-colors cursor-pointer"
                >
                  Hiển thị tất cả
                </button>
              </div>
            </div>
          ) : (
            /* Multi-PDF Side-by-Side Horizontal Scroll Container */
            <div
              ref={multiPdfContainerRef}
              id="multi-pdf-workspace-container"
              className={`flex-1 flex flex-row items-stretch h-full overflow-x-auto relative min-h-0 select-none ${
                visibleDocs.length > 1 ? "custom-scrollbar" : "no-scrollbar"
              }`}
              style={{
                overscrollBehaviorX: "contain",
                scrollSnapType: visibleDocs.length > 1 ? "x mandatory" : "none",
              }}
            >
              {openDocs.map((doc) => (
                <PDFWorkspaceColumn
                  key={doc.id}
                  doc={doc}
                  isActive={doc.id === activeDocId}
                  totalVisibleDocs={visibleDocs.length}
                  activeTool={activeTool}
                  penColor={penColor}
                  penSize={activePenSize}
                  penOpacity={penOpacity}
                  eraserSize={eraserSize}
                  highlightColor={highlightColor}
                  boxColor={boxColor}
                  boxConfig={boxConfig}
                  onActivate={handleActivateDoc}
                  onPageChange={handlePageChange}
                  onZoomChange={handleZoomChange}
                  onUpdateBoxConfig={handleUpdateBoxConfig}
                  onTextSelected={handleTextSelected}
                  onAddHighlight={handleAddHighlightDirect}
                  onAddNote={handleAddNote}
                  onUpdateNote={handleUpdateNote}
                  onDeleteNote={handleDeleteNote}
                  onAddBox={handleAddBox}
                  onUpdateBox={handleUpdateBox}
                  onDeleteBox={handleDeleteBox}
                  onAddFreeText={handleAddFreeText}
                  onUpdateFreeText={handleUpdateFreeText}
                  onDeleteFreeText={handleDeleteFreeText}
                  onDeleteHighlight={handleDeleteHighlight}
                  onUpdateHighlight={handleUpdateHighlight}
                  onUpdateHighlightNote={handleUpdateHighlightNote}
                  onUpdateHighlightColor={handleUpdateHighlightColor}
                  onAddStroke={handleAddStroke}
                  onUpdateStroke={handleUpdateStroke}
                  onDeleteStroke={handleDeleteStroke}
                  onActiveToolChange={setActiveTool}
                  onSelect={handleSelect}
                  onClearSelection={handleClearSelection}
                />
              ))}
            </div>
          )}

          {/* Lark Floating Toolbar (Always Available above canvas for Active PDF) */}
          {activeDoc?.pdfDoc && (
            <div
              id="bottom-toolbar"
              className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-[99999] pointer-events-none transition-all duration-150 ${
                !isLibraryModalOpen && !isSaveBookModalOpen && !isExportModalOpen
                  ? "visible opacity-100"
                  : "invisible opacity-0 pointer-events-none"
              }`}
            >
              <div className="pointer-events-auto">
                <LarkFloatingToolbar
                  activeTool={activeTool}
                  penColor={penColor}
                  penSize={activePenSize}
                  penOpacity={penOpacity}
                  eraserSize={eraserSize}
                  onActiveToolChange={setActiveTool}
                  onPenColorChange={handlePenColorChange}
                  onPenSizeChange={handlePenSizeChange}
                  onPenOpacityChange={setPenOpacity}
                  onEraserSizeChange={setEraserSize}
                />
              </div>
            </div>
          )}

          {/* Unified Cross-Page Selection Toolbar for Active Document */}
          <UnifiedSelectionToolbar
            selectedIds={activeDoc?.selectedIds || []}
            freeTexts={activeDoc?.freeTexts || []}
            boxes={activeDoc?.boxes || []}
            boxConfig={boxConfig}
            onUpdateText={(id, u, s) =>
              activeDoc && handleUpdateFreeText(activeDoc.id, id, u, s)
            }
            onDeleteText={(id) => activeDoc && handleDeleteFreeText(activeDoc.id, id)}
            onUpdateBox={(id, u, s) =>
              activeDoc && handleUpdateBox(activeDoc.id, id, u, s)
            }
            onDeleteBox={(id) => activeDoc && handleDeleteBox(activeDoc.id, id)}
            onUpdateBoxConfig={(u) =>
              activeDoc && handleUpdateBoxConfig(activeDoc.id, u)
            }
            isModalOpen={
              isLibraryModalOpen ||
              isSaveBookModalOpen ||
              isExportModalOpen ||
              isImageOrderModalOpen
            }
          />
        </div>
      </div>

      {/* Library Modal (Kho Sách) */}
      <LibraryModal
        isOpen={isLibraryModalOpen}
        onClose={() => setIsLibraryModalOpen(false)}
        onSelectBook={handleSelectBook}
        onUploadFile={handleFileUpload}
        openBookIds={openDocs.map((d) => d.fileId)}
      />

      {/* Save Book Modal (Lưu vào Kho Sách) */}
      <SaveBookModal
        isOpen={isSaveBookModalOpen}
        onClose={() => setIsSaveBookModalOpen(false)}
        fileName={activeDoc?.fileName || ""}
        fileId={activeDoc?.fileId || ""}
        totalPages={activeDoc?.totalPages || 0}
        currentPage={activeDoc?.currentPage || 1}
        bookConfig={activeDoc?.bookConfig}
        onSaveBookTitle={(newTitle, targetFileId) => {
          const idToUpdate = targetFileId || activeDoc?.fileId;
          if (idToUpdate) {
            updateDoc(idToUpdate, (d) => ({
              ...d,
              fileName: newTitle.endsWith(".pdf") ? newTitle : `${newTitle}.pdf`,
            }));
          }
        }}
        openDocs={openDocs.map((d) => ({
          id: d.id,
          fileId: d.fileId,
          fileName: d.fileName,
          totalPages: d.totalPages,
          currentPage: d.currentPage,
          bookConfig: d.bookConfig,
        }))}
      />

      {/* Export / Download Pages Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        pdfDoc={activeDoc?.pdfDoc}
        bookTitle={activeDoc?.fileName || ""}
        totalPages={activeDoc?.totalPages || 0}
        currentPage={activeDoc?.currentPage || 1}
        highlights={activeDoc?.highlights || []}
        textNotes={activeDoc?.textNotes || []}
        drawings={activeDoc?.drawings || []}
        boxes={activeDoc?.boxes || []}
        freeTexts={activeDoc?.freeTexts || []}
        screenScale={activeDoc ? activeDoc.scale : 1.0}
      />

      {/* Image Ordering Modal */}
      <ImageOrderModal
        isOpen={isImageOrderModalOpen}
        files={pendingImageFiles}
        onClose={() => setIsImageOrderModalOpen(false)}
        onConfirm={handleConfirmOrderedImages}
      />

      {/* Floating Eraser Cursor */}
      {activeTool === "eraser" && eraserPos && (
        <div
          className="pointer-events-none fixed rounded-full border-2 border-red-500 bg-red-400/25 -translate-x-1/2 -translate-y-1/2 z-[999999] shadow-xs transition-transform duration-75"
          style={{
            left: `${eraserPos.x}px`,
            top: `${eraserPos.y}px`,
            width: `${eraserSize}px`,
            height: `${eraserSize}px`,
          }}
        />
      )}

      <ShortcutsWidget />
    </div>
  );
}

export default App;

// Helper to map PDF outline into AutoTOC items
async function mapPdfOutline(doc: any, outline: any[]): Promise<AutoTOCItem[]> {
  const result: AutoTOCItem[] = [];
  for (const item of outline) {
    let pageNumber = 1;
    if (item.dest) {
      try {
        let dest = item.dest;
        if (typeof dest === "string") {
          dest = await doc.getDestination(dest);
        }
        if (Array.isArray(dest) && dest[0]) {
          const pageIndex = await doc.getPageIndex(dest[0]);
          pageNumber = pageIndex + 1;
        }
      } catch {
        pageNumber = 1;
      }
    }
    const subItems =
      item.items && item.items.length > 0
        ? await mapPdfOutline(doc, item.items)
        : undefined;

    result.push({
      title: item.title,
      pageNumber,
      items: subItems,
    });
  }
  return result;
}
