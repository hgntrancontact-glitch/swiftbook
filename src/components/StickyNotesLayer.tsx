import {STICKY_NOTE_DESIGN as PAPER,noteSwatchColor} from '../utils/stickyNoteDesign';
import { createStickyNote } from '../utils/stickyNoteCreation';
import {stickyNoteGeometry} from '../utils/stickyNoteGeometry';
import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { TextNoteAnnotation, NOTE_PAPER_COLORS, NoteColorTheme, getNoteColorTheme } from '../types';
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
      layer.querySelectorAll<HTMLElement>('[data-sticky-note-icon]').forEach(icon => { icon.style.zoom = String(1 / live); });
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

    const page=containerRef.current.closest<HTMLElement>('[data-page-container="true"]');
    const userZoom=Number(page?.closest<HTMLElement>('[data-user-zoom]')?.dataset.userZoom || 1);
    const created=createStickyNote(pageNumber,x,y,scale,userZoom);
    const fitted=stickyNoteGeometry(created,rect.width,rect.height,scale/created.referenceScale!);
    onAddNote({...created,x:fitted.x,y:fitted.y});

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
    const pageRect=getPageEl(note.pageNumber)?.getBoundingClientRect();
    const paperRect=document.getElementById(`sticky-${note.id}`)?.getBoundingClientRect();
    dragStartRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: pageRect && paperRect?(paperRect.left-pageRect.left)/pageRect.width*100:note.x,
      startY: pageRect && paperRect?(paperRect.top-pageRect.top)/pageRect.height*100:note.y,
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
        const theme: NoteColorTheme = getNoteColorTheme(note.color);

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
            id={`sticky-${note.id}`} data-annotation-id={note.id}
            onMouseEnter={() => {
              elevatePageZIndex(pageNumber);
            }}
            onMouseDown={() => {
              elevatePageZIndex(pageNumber);
            }}
            className={`sticky-note-paper noto-ui absolute pointer-events-auto select-none ${
              !note.isMinimized ? 'sticky-note-expanded' : ''
            } ${
              isSelected ? 'rounded-xl' : ''
            } ${
              isDragging ? 'z-[9999] transition-none' : ''
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
                data-sticky-note-icon={note.id}
                onMouseDown={(e) => startDrag(e, note)}
                onClick={(e) => handleNoteClick(e, note)}
                className="rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing group"
                style={{
                  background: theme.noteBg,
                  zoom: 1,
                  width: '24px',
                  height: '24px',
                }}
                title={
                  note.text
                    ? `Note: "${note.text.slice(0, 30)}..." (Kéo để di chuyển giữa các trang, Nhấp để mở)`
                    : 'Mở note (Kéo để di chuyển giữa các trang, Nhấp để mở)'
                }
              >
                <MessageSquare
                  size={13}
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
                isDragging={isDragging}
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
  isDragging?:boolean;
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
  isDragging=false,
}) => {
  const noteScale = scale / (note.referenceScale || 1);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const cancelTitleRef = useRef(false);
  const noteBoxRef = useRef<HTMLDivElement>(null);
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
    const page = noteBoxRef.current?.closest<HTMLElement>('[data-page-container="true"]') || cont?.closest<HTMLElement>('[data-page-container="true"]');
    // Read untransformed, fractional page dimensions. offsetWidth/offsetHeight
    // round to integers and make percentage-sized notes wobble at zoom commits.
    const contW = parseFloat(page?.style.width || '') || cont?.offsetWidth || 595 * scale;
    const contH = parseFloat(page?.style.height || '') || cont?.offsetHeight || 842 * scale;

    return stickyNoteGeometry(note,contW,contH,noteScale);
  };

  const initialDims = getDims();
  const [size, setSize] = useState({
    width: initialDims.width,
    height: initialDims.height,
    scale: initialDims.scale,
  });
  const resizingRef=useRef(false);

  useLayoutEffect(() => {
    const update=()=>{
      const d = getDims();
      setSize(previous=>previous.width===d.width && previous.height===d.height && previous.scale===d.scale?previous:{width:d.width,height:d.height,scale:d.scale});
    };
    update();
    const page=noteBoxRef.current?.closest<HTMLElement>('[data-page-container="true"]');
    if(!page) return;
    const observer=new ResizeObserver(update);
    observer.observe(page);
    return ()=>observer.disconnect();
  }, [note.width, note.height, note.referenceScale, scale]);
  useLayoutEffect(()=>{
    const parent=noteBoxRef.current?.parentElement;
    if(!parent || isDragging || resizingRef.current) return;
    // Keep restored notes on their own page without rewriting saved coordinates.
    parent.style.left=`clamp(0px, ${note.x}%, calc(100% - ${size.width}px))`;
    parent.style.top=`clamp(0px, ${note.y}%, calc(100% - ${size.height}px))`;
  },[note.x,note.y,size.width,size.height,isDragging]);

  const handleResizeStart = (
    e: React.MouseEvent,
    dir: 'nw' | 'ne' | 'sw' | 'se' | 'e' | 's' | 'w' | 'n'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (!containerRef.current) return;
    resizingRef.current=true;

    elevatePageZIndex(pageNumber);

    const startX = e.clientX;
    const startY = e.clientY;
    const startW = size.width;
    const startH = size.height;
    const fitted=getDims();
    const startNoteX = fitted.x;
    const startNoteY = fitted.y;
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
        newW = Math.min(rect.width * 0.95, Math.max(160 * size.scale, startW + dx));
      } else if (dir.includes('w')) {
        newW = Math.min(rect.width * 0.95, Math.max(160 * size.scale, startW - dx));
      }

      if (dir.includes('s')) {
        newH = Math.min(rect.height * 0.95, Math.max(100 * size.scale, startH + dy));
      } else if (dir.includes('n')) {
        newH = Math.min(rect.height * 0.95, Math.max(100 * size.scale, startH - dy));
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

      setSize({ width: newW, height: newH, scale:size.scale });
      if (parentStickyEl && (dir.includes('n') || dir.includes('w'))) {
        parentStickyEl.style.left = `${newNoteX}%`;
        parentStickyEl.style.top = `${newNoteY}%`;
      }
    };

    const onMouseUp = () => {
      resizingRef.current=false;
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

  const headerH = PAPER.header;
  const footerH = PAPER.footer;
  const pad = PAPER.padding;
  const cornerR = PAPER.radius;
  const bodyFontSize = PAPER.bodyFont;
  const bodyLineH = PAPER.lineHeight;
  const iconSize = PAPER.icon;

  return (
    <div
      ref={noteBoxRef}
      data-note-paper className="relative flex flex-col noto-ui select-none"
      style={{
        // One native layout scale for the entire paper, including all controls.
        // Stored dimensions remain in page space; no per-child scaling accumulates.
        zoom: size.scale,
        width: `${size.width / size.scale}px`,
        height: `${size.height / size.scale}px`,
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
          className="pointer-events-auto flex items-center justify-between cursor-grab active:cursor-grabbing select-none text-black shrink-0"
          style={{
            background: theme.headerBg,
            borderBottom: `${PAPER.separator}px solid #000`,
            height: `${headerH}px`,
            paddingLeft: `${pad}px`,
            paddingRight: `${pad}px`,
          }}
          title="Kéo thanh tiêu đề để di chuyển giữa các trang"
        >
          <div
            className="flex items-center gap-1.5 font-normal min-w-0 flex-1"
            style={{ fontSize: `${PAPER.titleFont}px` }}
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
            className="w-full h-full bg-transparent border-0 focus:outline-none resize-none text-neutral-900 placeholder:text-neutral-400 selection:bg-black/15"
            style={{
              fontSize: `${bodyFontSize}px`,
              lineHeight: `${bodyLineH}px`,
            }}
            autoFocus
          />
        </div>

        {/* LAYER 3: Bottom Palette Bar */}
        <div
          className="pointer-events-auto flex items-center justify-between shrink-0"
          style={{
            background: theme.contentBg,
            borderTop: `${PAPER.separator}px solid #000`,
            height: `${footerH}px`,
            paddingLeft: `${pad}px`,
            paddingRight: `${pad}px`,
          }}
        >
          <div className="flex items-center" style={{gap:PAPER.dotGap}}>
            {NOTE_PAPER_COLORS.map((c) => (
              <button
                key={c.id}
                onClick={() => onUpdateNote(note.id, { color: c.contentBg })}
                className="rounded-full border-0 cursor-pointer"
                aria-label={`Màu giấy ${c.name}`} aria-pressed={theme.id===c.id}
                style={{background:noteSwatchColor(c.noteBg,theme.id===c.id),width:PAPER.dot,height:PAPER.dot}}
                title={`Đổi sang ${c.name}`}
              />
            ))}
          </div>

          <span
            className="text-black font-normal"
            style={{ fontSize: `${PAPER.pageFont}px` }}
          >
            P.{pageNumber}
          </span>
        </div>
      </div>
    </div>
  );
};
