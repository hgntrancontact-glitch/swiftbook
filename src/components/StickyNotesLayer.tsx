import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { TextNoteAnnotation, NOTE_PAPER_COLORS, NoteColorTheme } from '../types';
import { MessageSquare, Trash2, Move, Minimize2, StickyNote } from 'lucide-react';
import { findBestMatchingPage, elevatePageZIndex, resetPageZIndex } from '../utils/pageBoundaryHelper';

interface StickyNotesLayerProps {
  fileId?: string;
  pageNumber: number;
  totalPages?: number;
  notes: TextNoteAnnotation[];
  isStickyToolActive: boolean;
  onAddNote: (note: Omit<TextNoteAnnotation, 'id' | 'createdAt'>) => void;
  onUpdateNote: (id: string, updates: Partial<TextNoteAnnotation>, skipHistory?: boolean) => void;
  onDeleteNote: (id: string) => void;
  onDeactivateStickyTool?: () => void;
  scale?: number;
  selectedIds?: string[];
  onSelect?: (id: string, isShift: boolean) => void;
}

export const StickyNotesLayer: React.FC<StickyNotesLayerProps> = ({
  fileId,
  pageNumber,
  totalPages,
  notes,
  isStickyToolActive,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onDeactivateStickyTool,
  scale = 1.0,
  selectedIds,
  onSelect,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const hasNotes = notes.some(note => note.pageNumber === pageNumber);
  useLayoutEffect(() => {
    const layer = containerRef.current;
    const page = layer?.closest<HTMLElement>('[data-page-container="true"]');
    const wrapper = page?.closest<HTMLElement>('[data-scale]');
    if (!hasNotes || !layer || !page || !wrapper) return;
    // A compositor transform stretches cached text pixels during pinch. Native
    // layout zoom rerasterizes the HTML note at the live size; the inverse
    // transform cancels only that extra geometry, leaving the page's zoom intact.
    const update = () => {
      const live = Number(wrapper.style.getPropertyValue('--pdf-live-zoom')) || 1;
      layer.style.width = page.style.width;
      layer.style.height = page.style.height;
      layer.style.zoom = String(live);
      layer.style.transformOrigin = '0 0';
      layer.style.transform = live === 1 ? '' : `scale(${1 / live})`;
    };
    const observer = new MutationObserver(update);
    observer.observe(wrapper, { attributes: true, attributeFilter: ['style'] });
    observer.observe(page, { attributes: true, attributeFilter: ['style'] });
    update();
    return () => {
      observer.disconnect();
      layer.style.zoom = '';
      layer.style.transform = '';
      layer.style.width = '';
      layer.style.height = '';
    };
  }, [hasNotes, pageNumber, scale]);

  const getPageEl = (targetPage: number): HTMLElement | null => {
    if (containerRef.current && targetPage === pageNumber) {
      const currentContainer = containerRef.current.closest<HTMLElement>('[data-page-container="true"]') || containerRef.current.parentElement;
      if (currentContainer) return currentContainer;
    }
    if (containerRef.current) {
      const colContainer = containerRef.current.closest('.pdf-viewport-container');
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
  };

  const [altGhost, setAltGhost] = useState<TextNoteAnnotation | null>(null);
  const altGhostRef = useRef<TextNoteAnnotation | null>(null);
  useEffect(() => { altGhostRef.current = altGhost; }, [altGhost]);

  const selectedIdsRef = useRef<string[] | undefined>(selectedIds);
  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
  const dragStartRef = useRef<{ startClientX: number; startClientY: number; startX: number; startY: number } | null>(null);
  const hasMovedRef = useRef<boolean>(false);
  const justDraggedRef = useRef<boolean>(false);

  const pageNotes = [...notes.filter((n) => n.pageNumber === pageNumber), ...(altGhost && altGhost.pageNumber === pageNumber ? [altGhost] : [])];

  // Elevation changes with note state, not on every zoom/render frame.
  const hasExpandedNote = pageNotes.some((n) => !n.isMinimized);
  useEffect(() => {
    if (hasExpandedNote) {
      elevatePageZIndex(pageNumber, fileId);
    } else if (!draggingNoteId) {
      resetPageZIndex(pageNumber, fileId);
    }
  }, [hasExpandedNote, pageNumber, draggingNoteId, fileId]);

  // Click on page container to place a single new note and switch back to Select mode
  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isStickyToolActive || !containerRef.current) return;
    const el = e.target instanceof Element ? e.target : (e.target as Node | null)?.parentElement;
    if (el?.closest?.('.sticky-note-paper, .unified-group-toolbar, .floating-submenu')) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(2, Math.min(85, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(2, Math.min(85, ((e.clientY - rect.top) / rect.height) * 100));

    onAddNote({
      pageNumber,
      x,
      y,
      text: '',
      referenceScale: scale,
      color: NOTE_PAPER_COLORS[0].contentBg,
      isMinimized: false,
    });

    // Auto switch tool back to Select mode after 1 placement
    onDeactivateStickyTool?.();
  };

  // Dragging event listeners for smooth note repositioning across pages
  useEffect(() => {
    if (!draggingNoteId || !dragStartRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dxPx = e.clientX - dragStartRef.current.startClientX;
      const dyPx = e.clientY - dragStartRef.current.startClientY;

      if (Math.abs(dxPx) > 3 || Math.abs(dyPx) > 3) {
        if (!hasMovedRef.current) {
          hasMovedRef.current = true;
          if (!(dragStartRef.current as any).historyRecorded && !altGhostRef.current) {
            (dragStartRef.current as any).historyRecorded = true;
            window.dispatchEvent(new CustomEvent('app-record-history'));
            const currentSelected = selectedIdsRef.current;
            if (currentSelected && currentSelected.length > 1 && currentSelected.includes(draggingNoteId)) {
              window.dispatchEvent(new CustomEvent('batch-translate-start'));
            }
          }
        }
      }
      if (!altGhostRef.current) {
        document.body.style.cursor = 'grabbing';
      }

      const pageEl = getPageEl(pageNumber);
      if (!pageEl) return;
      const pageRect = pageEl.getBoundingClientRect();

      const dxPct = (dxPx / pageRect.width) * 100;
      const dyPct = (dyPx / pageRect.height) * 100;

      if (altGhostRef.current && altGhostRef.current.id === draggingNoteId) {
        setAltGhost({ ...altGhostRef.current, x: dragStartRef.current.startX + dxPct, y: dragStartRef.current.startY + dyPct });
      } else {
        onUpdateNote(draggingNoteId, {
          x: dragStartRef.current.startX + dxPct,
          y: dragStartRef.current.startY + dyPct,
        }, true);
        const currentSelected = selectedIdsRef.current;
        if (currentSelected && currentSelected.length > 1 && currentSelected.includes(draggingNoteId)) {
          const lastDx = (dragStartRef.current as any).lastDispatchedDx || 0;
          const lastDy = (dragStartRef.current as any).lastDispatchedDy || 0;
          const stepDx = dxPct - lastDx;
          const stepDy = dyPct - lastDy;
          (dragStartRef.current as any).lastDispatchedDx = dxPct;
          (dragStartRef.current as any).lastDispatchedDy = dyPct;
          window.dispatchEvent(new CustomEvent('batch-translate', {
            detail: { leaderId: draggingNoteId, dxPct: stepDx, dyPct: stepDy }
          }));
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      document.body.style.cursor = '';

      if (draggingNoteId && dragStartRef.current) {
        if (altGhostRef.current && altGhostRef.current.id === draggingNoteId) {
           onAddNote(altGhostRef.current);
           const addedId = altGhostRef.current.id;
           const targetPage = altGhostRef.current.pageNumber || pageNumber;
           setAltGhost(null);
           if (onSelect) onSelect(addedId, false);
           resetPageZIndex(targetPage, fileId);
           setDraggingNoteId(null);
           dragStartRef.current = null;
           hasMovedRef.current = false;
           return;
        }

        const note = notes.find((n) => n.id === draggingNoteId);
        const originPage = note?.pageNumber || pageNumber;
        const pageEl = getPageEl(originPage);

        if (note && pageEl && hasMovedRef.current) {
          const draggedEl = document.getElementById(`sticky-${draggingNoteId}`);
          const rect = draggedEl?.getBoundingClientRect();

          if (rect) {
            const widthPct = (rect.width / pageEl.offsetWidth) * 100;
            const heightPct = (rect.height / pageEl.offsetHeight) * 100;

            const match = findBestMatchingPage(
              rect,
              originPage,
              widthPct,
              heightPct,
              fileId
            );

            if (match) {
              onUpdateNote(draggingNoteId, {
                pageNumber: match.targetPage,
                x: match.relXPct,
                y: match.relYPct,
              }, true);
            } else {
              onUpdateNote(draggingNoteId, {
                x: Math.max(0, Math.min(85, note.x)),
                y: Math.max(0, Math.min(85, note.y)),
              }, true);
            }
          }
          const currentSelected = selectedIdsRef.current;
          if (currentSelected && currentSelected.length > 1) {
            window.dispatchEvent(new CustomEvent('batch-translate-commit', { detail: { leaderId: draggingNoteId } }));
          }
        }

        resetPageZIndex(originPage, fileId);
        setDraggingNoteId(null);
        dragStartRef.current = null;
      }
      if (hasMovedRef.current) {
        justDraggedRef.current = true;
        setTimeout(() => {
          justDraggedRef.current = false;
        }, 300);
      }
      hasMovedRef.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingNoteId, pageNumber, notes, onUpdateNote, fileId]);

  const startDrag = (e: React.MouseEvent, note: TextNoteAnnotation) => {
    e.stopPropagation();

    // Option (Alt) + Left Click Drag -> Quick Duplicate!
    if (e.altKey) {
      e.preventDefault();
      const dupId = `note_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const duplicated = {
        ...note,
        id: dupId,
        createdAt: Date.now(),
      };
      setAltGhost(duplicated);
      hasMovedRef.current = true;
      dragStartRef.current = { startClientX: e.clientX, startClientY: e.clientY, startX: note.x, startY: note.y };
      setDraggingNoteId(dupId);
      document.body.style.cursor = 'copy';
      return;
    }

    if (e.shiftKey) {
      if (onSelect) {
        onSelect(note.id, true);
      }
    } else {
      const currentSelected = selectedIdsRef.current;
      if (currentSelected && currentSelected.includes(note.id) && currentSelected.length > 1) {
        // Part of multi-selection: preserve all selected items for group dragging!
      } else {
        if (onSelect) {
          onSelect(note.id, false);
        }
      }
    }

    hasMovedRef.current = false;
    dragStartRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: note.x,
      startY: note.y,
    };
    elevatePageZIndex(note.pageNumber || pageNumber, fileId);
    setDraggingNoteId(note.id);
    document.body.style.cursor = 'grabbing';
  };

  const handleNoteClick = (e: React.MouseEvent, note: TextNoteAnnotation) => {
    e.stopPropagation();
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    // Do not toggle minimized/expanded state if shiftKey was pressed or if dragging occurred!
    if (!hasMovedRef.current && !e.shiftKey) {
      onUpdateNote(note.id, { isMinimized: !note.isMinimized });
    }
  };

  return (
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      className={`absolute inset-0 select-none overflow-visible ${
        draggingNoteId
          ? 'z-[30000] pointer-events-auto'
          : isStickyToolActive
          ? 'z-40 cursor-crosshair pointer-events-auto'
          : 'z-30 pointer-events-none'
      }`}
    >
      {pageNotes.map((note) => {
        const theme: NoteColorTheme =
          NOTE_PAPER_COLORS.find(
            (c) =>
              c.contentBg === note.color ||
              c.headerBg === note.color ||
              c.noteBg === note.color ||
              c.id === note.color
          ) || NOTE_PAPER_COLORS[0];

        const isSelected = selectedIds?.includes(note.id);
        const isDragging = draggingNoteId === note.id;
        const noteCreatedAt = note.createdAt || 0;
        const noteZIndex = isDragging
          ? 30000
          : !note.isMinimized
          ? 20000
          : 100;

        return (
          <div
            key={note.id}
            id={`sticky-${note.id}`}
            onMouseEnter={() => {
              elevatePageZIndex(pageNumber);
            }}
            onMouseDown={() => {
              elevatePageZIndex(pageNumber);
            }}
            className={`sticky-note-paper absolute pointer-events-auto select-none ${
              !note.isMinimized ? 'sticky-note-expanded' : ''
            } ${
              isSelected ? 'ring-2 ring-blue-500 rounded-lg shadow-lg' : ''
            } ${
              isDragging ? 'z-[9999] transition-none shadow-2xl' : 'transition-shadow'
            }`}
            style={{
              left: `${note.x}%`,
              top: `${note.y}%`,
              zIndex: noteZIndex,
            }}
          >
            {note.isMinimized ? (
              /* Minimized Sticky Note Icon */
              <div
                onMouseDown={(e) => startDrag(e, note)}
                onClick={(e) => handleNoteClick(e, note)}
                className="rounded-full shadow-md border border-black/30 flex items-center justify-center cursor-grab active:cursor-grabbing group"
                style={{
                  background: theme.noteBg,
                  width: `${24 * scale / (note.referenceScale || 1)}px`,
                  height: `${24 * scale / (note.referenceScale || 1)}px`,
                }}
                title={
                  note.text
                    ? `Note: "${note.text.slice(0, 30)}..." (Kéo để di chuyển giữa các trang, Nhấp để mở)`
                    : 'Mở note (Kéo để di chuyển giữa các trang, Nhấp để mở)'
                }
              >
                <MessageSquare
                  size={13 * scale / (note.referenceScale || 1)}
                  className="text-black fill-black"
                />
              </div>
            ) : (
              /* Expanded 3-Layer Sticky Note Paper */
              <ExpandedStickyNote
                note={note}
                theme={theme}
                pageNumber={pageNumber}
                onUpdateNote={onUpdateNote}
                onDeleteNote={onDeleteNote}
                startDrag={startDrag}
                containerRef={containerRef}
                scale={scale}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

interface ExpandedStickyNoteProps {
  note: TextNoteAnnotation;
  theme: NoteColorTheme;
  pageNumber: number;
  onUpdateNote: (id: string, updates: Partial<TextNoteAnnotation>) => void;
  onDeleteNote: (id: string) => void;
  startDrag: (e: React.MouseEvent, note: TextNoteAnnotation) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  scale?: number;
}

const ExpandedStickyNote: React.FC<ExpandedStickyNoteProps> = ({
  note,
  theme,
  pageNumber,
  onUpdateNote,
  onDeleteNote,
  startDrag,
  containerRef,
  scale = 1.0,
}) => {
  const noteScale = scale / (note.referenceScale || 1);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const cancelTitleRef = useRef(false);
  const finishTitleEdit = () => {
    if (!cancelTitleRef.current) {
      const title = titleDraft.trim() || 'Note';
      if (title !== (note.title || 'Note')) onUpdateNote(note.id, { title });
    }
    cancelTitleRef.current = false;
    setEditingTitle(false);
  };
  const getDims = () => {
    const cont = containerRef.current;
    const page = cont?.closest<HTMLElement>('[data-page-container="true"]');
    // Read untransformed, fractional page dimensions. offsetWidth/offsetHeight
    // round to integers and make percentage-sized notes wobble at zoom commits.
    const contW = parseFloat(page?.style.width || '') || cont?.offsetWidth || 595 * scale;
    const contH = parseFloat(page?.style.height || '') || cont?.offsetHeight || 842 * scale;

    let wPx = 224 * noteScale;
    let hPx = 160 * noteScale;

    if (typeof note.width === 'number' && note.width > 0) {
      if (note.width <= 100) {
        wPx = (note.width / 100) * contW;
      } else {
        wPx = note.width * noteScale;
      }
    }
    if (typeof note.height === 'number' && note.height > 0) {
      if (note.height <= 100) {
        hPx = (note.height / 100) * contH;
      } else {
        hPx = note.height * noteScale;
      }
    }

    wPx = Math.max(160 * noteScale, Math.min(contW * 0.95, wPx));
    hPx = Math.max(100 * noteScale, Math.min(contH * 0.95, hPx));

    return {
      wPct: (wPx / contW) * 100,
      hPct: (hPx / contH) * 100,
      wPx,
      hPx,
    };
  };

  const initialDims = getDims();
  const [size, setSize] = useState({
    width: initialDims.wPx,
    height: initialDims.hPx,
  });
  const noteBoxRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const d = getDims();
    setSize({ width: d.wPx, height: d.hPx });
  }, [note.width, note.height, note.referenceScale, scale]);

  const handleResizeStart = (
    e: React.MouseEvent,
    dir: 'nw' | 'ne' | 'sw' | 'se' | 'e' | 's' | 'w' | 'n'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (!containerRef.current) return;

    elevatePageZIndex(pageNumber);

    const startX = e.clientX;
    const startY = e.clientY;
    const startW = size.width;
    const startH = size.height;
    const startNoteX = note.x;
    const startNoteY = note.y;
    const rect = containerRef.current.getBoundingClientRect();
    const parentStickyEl = document.getElementById(`sticky-${note.id}`);

    let latestW = startW;
    let latestH = startH;
    let latestNoteX = startNoteX;
    let latestNoteY = startNoteY;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      let newW = startW;
      let newH = startH;

      if (dir.includes('e')) {
        newW = Math.max(160 * noteScale, Math.min(rect.width * 0.95, startW + dx));
      } else if (dir.includes('w')) {
        newW = Math.max(160 * noteScale, Math.min(rect.width * 0.95, startW - dx));
      }

      if (dir.includes('s')) {
        newH = Math.max(100 * noteScale, Math.min(rect.height * 0.95, startH + dy));
      } else if (dir.includes('n')) {
        newH = Math.max(100 * noteScale, Math.min(rect.height * 0.95, startH - dy));
      }

      let newNoteX = startNoteX;
      let newNoteY = startNoteY;

      if (dir.includes('w')) {
        newNoteX = startNoteX - ((newW - startW) / rect.width) * 100;
      }
      if (dir.includes('n')) {
        newNoteY = startNoteY - ((newH - startH) / rect.height) * 100;
      }

      latestW = newW;
      latestH = newH;
      latestNoteX = newNoteX;
      latestNoteY = newNoteY;

      setSize({ width: newW, height: newH });
      if (parentStickyEl && (dir.includes('n') || dir.includes('w'))) {
        parentStickyEl.style.left = `${newNoteX}%`;
        parentStickyEl.style.top = `${newNoteY}%`;
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      const finalWidthPct = Number(((latestW / rect.width) * 100).toFixed(2));
      const finalHeightPct = Number(((latestH / rect.height) * 100).toFixed(2));

      onUpdateNote(note.id, {
        width: finalWidthPct,
        height: finalHeightPct,
        ...(dir.includes('n') || dir.includes('w')
          ? { x: latestNoteX, y: latestNoteY }
          : {}),
      });
      resetPageZIndex(pageNumber);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const headerH = 28 * noteScale;
  const footerH = 24 * noteScale;
  const pad = 10 * noteScale;
  const cornerR = 12 * noteScale;
  const bodyFontSize = 12 * noteScale;
  const bodyLineH = 18 * noteScale;
  const iconSize = 13;

  return (
    <div
      ref={noteBoxRef}
      className="relative shadow-2xl border border-black/20 flex flex-col font-['Inter',sans-serif] select-none"
      style={{
        width: `${size.width}px`,
        height: `${size.height}px`,
        borderRadius: `${cornerR}px`,
      }}
      onClick={(e) => {
        e.stopPropagation();
        elevatePageZIndex(pageNumber);
      }}
      onFocusCapture={() => elevatePageZIndex(pageNumber)}
    >
      {/* Corner and Edge handles for free-form resizing */}
      <div onMouseDown={(e) => handleResizeStart(e, 'nw')} className="absolute -top-1.5 -left-1.5 w-5 h-5 cursor-nwse-resize z-[100]" />
      <div onMouseDown={(e) => handleResizeStart(e, 'ne')} className="absolute -top-1.5 -right-1.5 w-5 h-5 cursor-nesw-resize z-[100]" />
      <div onMouseDown={(e) => handleResizeStart(e, 'sw')} className="absolute -bottom-1.5 -left-1.5 w-5 h-5 cursor-nesw-resize z-[100]" />
      <div onMouseDown={(e) => handleResizeStart(e, 'se')} className="absolute -bottom-1.5 -right-1.5 w-5 h-5 cursor-nwse-resize z-[100]" />
      <div onMouseDown={(e) => handleResizeStart(e, 'e')} className="absolute top-4 bottom-4 -right-1.5 w-3 cursor-ew-resize z-[100]" />
      <div onMouseDown={(e) => handleResizeStart(e, 's')} className="absolute -bottom-1.5 left-4 right-4 h-3 cursor-ns-resize z-[100]" />
      <div onMouseDown={(e) => handleResizeStart(e, 'w')} className="absolute top-4 bottom-4 -left-1.5 w-3 cursor-ew-resize z-[100]" />
      <div onMouseDown={(e) => handleResizeStart(e, 'n')} className="absolute -top-1.5 left-4 right-4 h-3 cursor-ns-resize z-[100]" />

      <div
        className="absolute inset-0 overflow-hidden pointer-events-none flex flex-col"
        style={{ borderRadius: `${cornerR}px` }}
      >
        {/* LAYER 1: Top Header Bar */}
        <div
          onMouseDown={(e) => startDrag(e, note)}
          className="pointer-events-auto flex items-center justify-between cursor-grab active:cursor-grabbing border-b border-black/10 select-none text-black shrink-0"
          style={{
            background: theme.headerBg,
            height: `${headerH}px`,
            paddingLeft: `${pad}px`,
            paddingRight: `${pad}px`,
          }}
          title="Kéo thanh tiêu đề để di chuyển giữa các trang"
        >
          <div
            className="flex items-center gap-1.5 font-bold tracking-tight min-w-0 flex-1"
            style={{ fontSize: `${11.5 * noteScale}px` }}
          >
            <Move size={iconSize} className="opacity-70" />
            {editingTitle ? (
              <input
                autoFocus aria-label="Tiêu đề giấy note" value={titleDraft}
                className="min-w-0 w-full bg-transparent border-0 outline-none"
                style={{ font: 'inherit', color: 'inherit' }}
                onFocus={e => e.currentTarget.select()}
                onMouseDown={e => e.stopPropagation()}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={finishTitleEdit}
                onKeyDown={e => {
                  e.stopPropagation();
                  if (e.key === 'Enter' || e.key === 'Escape') {
                    e.preventDefault();
                    cancelTitleRef.current = e.key === 'Escape';
                    e.currentTarget.blur();
                  }
                }}
              />
            ) : (
              <button type="button" title="Nhấp để đổi tiêu đề giấy note"
                className="truncate min-w-0 text-left cursor-text" style={{ font: 'inherit', color: 'inherit' }}
                onMouseDown={e => e.stopPropagation()}
                onClick={e => {
                  e.stopPropagation();
                  setTitleDraft(note.title || 'Note');
                  setEditingTitle(true);
                }}>
                {note.title || 'Note'}
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Minimize button (Back to icon) */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUpdateNote(note.id, { isMinimized: true });
              }}
              className="p-0.5 rounded hover:bg-black/10 transition-colors text-black/80 hover:text-black cursor-pointer"
              title="Thu nhỏ thành icon"
            >
              <Minimize2 size={iconSize} />
            </button>
            {/* Delete button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteNote(note.id);
              }}
              className="p-0.5 rounded hover:bg-red-500/20 hover:text-red-700 transition-colors text-black/80 cursor-pointer"
              title="Xóa ghi chú"
            >
              <Trash2 size={iconSize} />
            </button>
          </div>
        </div>

        {/* LAYER 2: Textarea Body Area */}
        <div
          className="pointer-events-auto flex-1 flex flex-col min-h-0"
          style={{
            background: theme.contentBg,
            padding: `${pad}px`,
          }}
        >
          <textarea
            value={note.text}
            onChange={(e) => onUpdateNote(note.id, { text: e.target.value })}
            placeholder="Nhập ghi chú tại đây..."
            className="w-full h-full bg-transparent border-0 focus:outline-none resize-none text-neutral-900 placeholder:text-neutral-500/80 selection:bg-black/15 font-sans"
            style={{
              fontSize: `${bodyFontSize}px`,
              lineHeight: `${bodyLineH}px`,
            }}
            autoFocus
          />
        </div>

        {/* LAYER 3: Bottom Palette Bar */}
        <div
          className="pointer-events-auto border-t border-black/10 flex items-center justify-between shrink-0"
          style={{
            background: theme.contentBg,
            height: `${footerH}px`,
            paddingLeft: `${pad}px`,
            paddingRight: `${pad}px`,
          }}
        >
          <div className="flex items-center gap-1.5">
            {NOTE_PAPER_COLORS.map((c) => (
              <button
                key={c.id}
                onClick={() => onUpdateNote(note.id, { color: c.contentBg })}
                className={`rounded-full border border-black/30 transition-transform cursor-pointer ${
                  theme.id === c.id ? 'scale-125 ring-1.5 ring-black/70' : 'hover:scale-110 opacity-80'
                }`}
                style={{
                  background: c.noteBg,
                  width: '14px',
                  height: '14px',
                }}
                title={`Đổi sang ${c.name}`}
              />
            ))}
          </div>

          <span
            className="text-black/50 font-medium tracking-tight"
            style={{ fontSize: '9.5px' }}
          >
            P.{pageNumber}
          </span>
        </div>
      </div>
    </div>
  );
};
