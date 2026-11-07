import { AnnotationToolbar } from './AnnotationToolbar';
import React, { useState, useRef, useEffect } from 'react';
import { BoxAnnotation, BoxConfig, DEFAULT_BOX_CONFIG } from '../types';
import { Trash2, Check, Square } from 'lucide-react';
import { findBestMatchingPage, elevatePageZIndex, resetPageZIndex } from '../utils/pageBoundaryHelper';

interface BoxAnnotationsLayerProps {
  fileId?: string;
  pageNumber: number;
  totalPages?: number;
  scale?: number;
  boxes: BoxAnnotation[];
  isBoxToolActive: boolean;
  boxConfig?: BoxConfig;
  onUpdateBoxConfig?: (updates: Partial<BoxConfig>) => void;
  activeColor?: string;
  onAddBox: (box: Omit<BoxAnnotation, 'id' | 'createdAt'>) => void;
  onUpdateBox: (id: string, updates: Partial<BoxAnnotation>, skipHistory?: boolean) => void;
  onDeleteBox: (id: string) => void;
  selectedIds?: string[];
  onSelect?: (id: string, isShift: boolean) => void;
}

const BOX_PRESET_COLORS = [
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#22c55e', // Green
  '#eab308', // Yellow
  '#171717', // Black
];

const BORDER_WIDTHS = [2, 3, 4, 6];

export const BoxAnnotationsLayer: React.FC<BoxAnnotationsLayerProps> = ({
  fileId,
  pageNumber,
  scale = 1,
  boxes,
  isBoxToolActive,
  boxConfig = DEFAULT_BOX_CONFIG,
  onUpdateBoxConfig,
  activeColor = '#ef4444',
  onAddBox,
  onUpdateBox,
  onDeleteBox,
  selectedIds,
  onSelect,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

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
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [draggingBoxId, setDraggingBoxId] = useState<string | null>(null);
  const [resizingBoxId, setResizingBoxId] = useState<string | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [altGhost, setAltGhost] = useState<BoxAnnotation | null>(null);
  const altGhostRef = useRef<BoxAnnotation | null>(null);
  useEffect(() => { altGhostRef.current = altGhost; }, [altGhost]);
  const justAltDuplicatedRef = useRef<boolean>(false);
  const shiftClickHandledRef = useRef<boolean>(false);

  const selectedIdsRef = useRef<string[] | undefined>(selectedIds);
  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  const dragStartRef = useRef<{ startClientX: number; startClientY: number; startX: number; startY: number } | null>(null);
  const resizeStartRef = useRef<{
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
    origWidth: number;
    origHeight: number;
    boxId: string;
  } | null>(null);
  const hasMovedRef = useRef<boolean>(false);

  const pageBoxes = [...boxes.filter((b) => b.pageNumber === pageNumber), ...(altGhost && altGhost.pageNumber === pageNumber ? [altGhost] : [])];

  // Deselect box when clicking outside
  useEffect(() => {
    const handleGlobalMouseDown = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target : (e.target as Node | null)?.parentElement;
      if (!el?.closest?.(`[id^="box-"]`) && !el?.closest?.('.box-floating-toolbar') && !el?.closest?.('.unified-group-toolbar') && !el?.closest?.('.floating-submenu')) {
        setSelectedBoxId(null);
      }
    };
    window.addEventListener('mousedown', handleGlobalMouseDown);
    return () => window.removeEventListener('mousedown', handleGlobalMouseDown);
  }, []);

  // Global mousemove & mouseup listeners for dragging/resizing across pages
  useEffect(() => {
    if (!draggingBoxId && !resizingBoxId) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      const pageEl = getPageEl(pageNumber);
      if (!pageEl) return;
      const pageRect = pageEl.getBoundingClientRect();

      // 1. Dragging Box across pages
      if (draggingBoxId && dragStartRef.current) {
        const dxPx = e.clientX - dragStartRef.current.startClientX;
        const dyPx = e.clientY - dragStartRef.current.startClientY;

        if (Math.abs(dxPx) > 3 || Math.abs(dyPx) > 3) {
          if (!hasMovedRef.current) {
            hasMovedRef.current = true;
            if (!(dragStartRef.current as any).historyRecorded && !altGhostRef.current) {
              (dragStartRef.current as any).historyRecorded = true;
              window.dispatchEvent(new CustomEvent('app-record-history'));
              const currentSelected = selectedIdsRef.current;
              if (currentSelected && currentSelected.length > 1 && currentSelected.includes(draggingBoxId)) {
                window.dispatchEvent(new CustomEvent('batch-translate-start'));
              }
            }
          }
        }
        if (!altGhostRef.current) {
          document.body.style.cursor = 'grabbing';
        }

        const dxPct = (dxPx / pageRect.width) * 100;
        const dyPct = (dyPx / pageRect.height) * 100;

        if (altGhostRef.current && altGhostRef.current.id === draggingBoxId) {
           setAltGhost({ ...altGhostRef.current, x: dragStartRef.current.startX + dxPct, y: dragStartRef.current.startY + dyPct });
        } else {
           onUpdateBox(draggingBoxId, {
             x: dragStartRef.current.startX + dxPct,
             y: dragStartRef.current.startY + dyPct,
           }, true);
           const currentSelected = selectedIdsRef.current;
           if (currentSelected && currentSelected.length > 1 && currentSelected.includes(draggingBoxId)) {
             const lastDx = (dragStartRef.current as any).lastDispatchedDx || 0;
             const lastDy = (dragStartRef.current as any).lastDispatchedDy || 0;
             const stepDx = dxPct - lastDx;
             const stepDy = dyPct - lastDy;
             (dragStartRef.current as any).lastDispatchedDx = dxPct;
             (dragStartRef.current as any).lastDispatchedDy = dyPct;
             window.dispatchEvent(new CustomEvent('batch-translate', {
               detail: { leaderId: draggingBoxId, dxPct: stepDx, dyPct: stepDy }
             }));
           }
        }
      }

      // 2. Resizing Box (4 corners + 4 edge centers)
      if (resizingBoxId && resizeStartRef.current && resizeHandle) {
        if (!hasMovedRef.current) {
          hasMovedRef.current = true;
          if (!(resizeStartRef.current as any).historyRecorded) {
            (resizeStartRef.current as any).historyRecorded = true;
            window.dispatchEvent(new CustomEvent('app-record-history'));
          }
        }
        const dxPx = e.clientX - resizeStartRef.current.startClientX;
        const dyPx = e.clientY - resizeStartRef.current.startClientY;
        const dxPct = (dxPx / pageRect.width) * 100;
        const dyPct = (dyPx / pageRect.height) * 100;

        const { origX, origY, origWidth, origHeight } = resizeStartRef.current;
        let newX = origX;
        let newY = origY;
        let newWidth = origWidth;
        let newHeight = origHeight;

        // Horizontal resizing
        if (resizeHandle.includes('e')) {
          newWidth = Math.max(1, origWidth + dxPct);
          if (newX + newWidth > 100) {
            newWidth = 100 - newX;
          }
        } else if (resizeHandle.includes('w')) {
          const proposedWidth = origWidth - dxPct;
          if (proposedWidth >= 1) {
            newX = Math.max(0, origX + dxPct);
            newWidth = origWidth - (newX - origX);
          } else {
            newWidth = 1;
            newX = origX + origWidth - 1;
          }
        }

        // Vertical resizing
        if (resizeHandle.includes('s')) {
          newHeight = Math.max(1, origHeight + dyPct);
          if (newY + newHeight > 100) {
            newHeight = 100 - newY;
          }
        } else if (resizeHandle.includes('n')) {
          const proposedHeight = origHeight - dyPct;
          if (proposedHeight >= 1) {
            newY = Math.max(0, origY + dyPct);
            newHeight = origHeight - (newY - origY);
          } else {
            newHeight = 1;
            newY = origY + origHeight - 1;
          }
        }

        onUpdateBox(resizingBoxId, {
          x: Number(newX.toFixed(2)),
          y: Number(newY.toFixed(2)),
          width: Number(newWidth.toFixed(2)),
          height: Number(newHeight.toFixed(2)),
        }, true);
      }
    };

    const handleWindowMouseUp = (e: MouseEvent) => {
      document.body.style.cursor = '';
      if (draggingBoxId && dragStartRef.current) {
        if (altGhostRef.current && altGhostRef.current.id === draggingBoxId) {
          const ghost = altGhostRef.current;
          const originPage = ghost.pageNumber || pageNumber;
          const ghostEl = document.getElementById(`box-${ghost.id}`);
          let finalPage = originPage;
          let finalX = ghost.x;
          let finalY = ghost.y;

          if (ghostEl) {
            const rect = ghostEl.getBoundingClientRect();
            const match = findBestMatchingPage(rect, originPage, ghost.width, ghost.height, fileId);
            if (match) {
              finalPage = match.targetPage;
              finalX = match.relXPct;
              finalY = match.relYPct;
            }
          }

          const finalBox: BoxAnnotation = {
            ...ghost,
            pageNumber: finalPage,
            x: Math.max(0, Math.min(100 - ghost.width, finalX)),
            y: Math.max(0, Math.min(100 - ghost.height, finalY)),
          };

          onAddBox(finalBox);
          const addedId = finalBox.id;
          setAltGhost(null);
          altGhostRef.current = null;
          if (onSelect) onSelect(addedId, false);
          setSelectedBoxId(addedId);
          resetPageZIndex(finalPage, fileId);
          setDraggingBoxId(null);
          dragStartRef.current = null;
          justAltDuplicatedRef.current = true;
          setTimeout(() => {
            justAltDuplicatedRef.current = false;
            hasMovedRef.current = false;
          }, 150);
          return;
        }

        const targetBox = boxes.find((b) => b.id === draggingBoxId);
        const originPage = targetBox?.pageNumber || pageNumber;
        const pageEl = getPageEl(originPage);

        if (targetBox && hasMovedRef.current) {
          const draggedEl = document.getElementById(`box-${draggingBoxId}`);
          const rect = draggedEl?.getBoundingClientRect();

          if (rect && pageEl) {
            const match = findBestMatchingPage(
              rect,
              originPage,
              targetBox.width,
              targetBox.height,
              fileId
            );

            if (match) {
              onUpdateBox(draggingBoxId, {
                pageNumber: match.targetPage,
                x: match.relXPct,
                y: match.relYPct,
              }, true);
            } else {
              onUpdateBox(draggingBoxId, {
                x: Math.max(0, Math.min(100 - targetBox.width, targetBox.x)),
                y: Math.max(0, Math.min(100 - targetBox.height, targetBox.y)),
              }, true);
            }
          }
          const currentSelected = selectedIdsRef.current;
          if (currentSelected && currentSelected.length > 1) {
            window.dispatchEvent(new CustomEvent('batch-translate-commit', { detail: { leaderId: draggingBoxId } }));
          }
        }

        resetPageZIndex(originPage, fileId);
        setDraggingBoxId(null);
        dragStartRef.current = null;
      }

      if (resizingBoxId) {
        const targetBox = boxes.find((b) => b.id === resizingBoxId);
        const targetPage = targetBox?.pageNumber || pageNumber;
        if (targetBox && hasMovedRef.current) {
          onUpdateBox(resizingBoxId, {
            x: targetBox.x,
            y: targetBox.y,
            width: targetBox.width,
            height: targetBox.height,
          }, true);
        }
        resetPageZIndex(targetPage, fileId);
        setResizingBoxId(null);
        setResizeHandle(null);
        resizeStartRef.current = null;
      }
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [draggingBoxId, resizingBoxId, resizeHandle, pageNumber, boxes, onUpdateBox, onAddBox, onSelect, fileId]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isBoxToolActive || !containerRef.current) return;
    if (
      (e.target as HTMLElement).closest('.box-handle') ||
      (e.target as HTMLElement).closest('.box-floating-toolbar') ||
      (e.target as HTMLElement).closest('button')
    ) {
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    setIsDrawing(true);
    setDrawStart({ x, y });
    setCurrentBox({ x, y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !drawStart || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const currentY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    const x = Math.min(drawStart.x, currentX);
    const y = Math.min(drawStart.y, currentY);
    const width = Math.abs(currentX - drawStart.x);
    const height = Math.abs(currentY - drawStart.y);

    setCurrentBox({ x, y, width, height });
  };

  const handleMouseUp = () => {
    if (isDrawing && currentBox && (currentBox.width > 2 || currentBox.height > 2)) {
      const activeBorderColor = boxConfig.color || activeColor || '#ef4444';
      const hasBg = boxConfig.hasBackground ?? true;
      onAddBox({
        pageNumber,
        x: Math.max(0, Math.min(100 - currentBox.width, currentBox.x)),
        y: Math.max(0, Math.min(100 - currentBox.height, currentBox.y)),
        width: Math.min(100, currentBox.width),
        height: Math.min(100, currentBox.height),
        color: activeBorderColor,
        borderWidth: boxConfig.borderWidth || 2,
        referenceScale: scale,
        borderStyle: boxConfig.borderStyle || 'solid',
        fillColor: hasBg ? `${activeBorderColor}25` : 'transparent',
      });
    }

    setIsDrawing(false);
    setDrawStart(null);
    setCurrentBox(null);
  };

  const startDragBox = (e: React.MouseEvent, box: BoxAnnotation) => {
    e.stopPropagation();
    hasMovedRef.current = false;
    dragStartRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: box.x,
      startY: box.y,
    };
    elevatePageZIndex(box.pageNumber || pageNumber, fileId);
    setDraggingBoxId(box.id);
    setSelectedBoxId(box.id);
    document.body.style.cursor = 'grabbing';
  };

  const startResizeBox = (e: React.MouseEvent, box: BoxAnnotation, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    hasMovedRef.current = false;
    resizeStartRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: box.x,
      origY: box.y,
      origWidth: box.width,
      origHeight: box.height,
      boxId: box.id,
    };
    elevatePageZIndex(box.pageNumber || pageNumber, fileId);
    setResizingBoxId(box.id);
    setResizeHandle(handle);
    setSelectedBoxId(box.id);
    if (onSelect) {
      onSelect(box.id, false);
    }
  };

  const isMultiSelected = Boolean(selectedIds && selectedIds.length > 1);
  const selectedBoxesOnPage = pageBoxes.filter((b) => selectedIds?.includes(b.id));
  const primaryBoxId =
    selectedBoxId && selectedIds?.includes(selectedBoxId)
      ? selectedBoxId
      : (selectedIds && selectedIds.find((id) => pageBoxes.some((b) => b.id === id))) || selectedBoxId;

  const isEditingAnyBox = Boolean(
    selectedBoxId ||
    draggingBoxId ||
    resizingBoxId ||
    isDrawing ||
    (selectedIds && selectedIds.length > 0 && pageBoxes.some((b) => selectedIds.includes(b.id)))
  );

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className={`absolute inset-0 select-none overflow-visible ${
        draggingBoxId || resizingBoxId || isDrawing
          ? 'z-[9999] pointer-events-auto'
          : isEditingAnyBox
          ? 'z-[8500] pointer-events-auto'
          : 'z-20'
      } ${
        isBoxToolActive ? 'cursor-crosshair pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      {/* Existing Boxes */}
      {pageBoxes.map((box) => {
        const isSelected = selectedIds ? selectedIds.includes(box.id) : selectedBoxId === box.id;
        const lineWidth = (box.borderWidth || 2) * scale / (box.referenceScale || 1);
        const dashUnit = scale / (box.referenceScale || 1);
        const isDragging = draggingBoxId === box.id;
        const isDashed = box.borderStyle === 'dashed';
        const hasFill = box.fillColor && box.fillColor !== 'transparent';
        const isNearTop = box.y < 12;
        const isPrimaryForToolbar = !isMultiSelected || box.id === primaryBoxId;

        // Multi-selection mixed state calculations
        const allSameColor = isMultiSelected
          ? selectedBoxesOnPage.every((b) => (b.color || '#ef4444') === (box.color || '#ef4444'))
          : true;
        const allSameWidth = isMultiSelected
          ? selectedBoxesOnPage.every((b) => (b.borderWidth || 2) === (box.borderWidth || 2))
          : true;
        const allSameStyle = isMultiSelected
          ? selectedBoxesOnPage.every((b) => (b.borderStyle || 'solid') === (box.borderStyle || 'solid'))
          : true;
        const allSameFill = isMultiSelected
          ? selectedBoxesOnPage.every((b) => {
              const bf = b.fillColor && b.fillColor !== 'transparent';
              return Boolean(bf) === Boolean(hasFill);
            })
          : true;

        return (
          <div
            key={box.id}
            id={`box-${box.id}`}
            onClick={(e) => {
              e.stopPropagation();
              if (e.shiftKey || shiftClickHandledRef.current) {
                shiftClickHandledRef.current = false;
                return;
              }
              if (justAltDuplicatedRef.current || hasMovedRef.current) {
                return;
              }
              const currentSelected = selectedIdsRef.current;
              if (currentSelected && currentSelected.length > 1 && currentSelected.includes(box.id)) {
                return;
              }
              if (onSelect) {
                onSelect(box.id, false);
              } else {
                setSelectedBoxId(box.id);
              }
            }}
            onMouseDown={(e) => {
              if (
                (e.target as HTMLElement).closest('.box-handle') ||
                (e.target as HTMLElement).closest('.box-floating-toolbar') ||
                (e.target as HTMLElement).closest('button')
              ) {
                return;
              }
              e.stopPropagation();

              // Option (Alt) + Left Click Drag -> Duplicate Box!
              if (e.altKey) {
                e.preventDefault();
                const dupId = `box_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
                const duplicated: BoxAnnotation = {
                  ...box,
                  id: dupId,
                  createdAt: Date.now(),
                };
                setAltGhost(duplicated);
                altGhostRef.current = duplicated;
                hasMovedRef.current = true;
                dragStartRef.current = { startClientX: e.clientX, startClientY: e.clientY, startX: box.x, startY: box.y };
                setDraggingBoxId(dupId);
                document.body.style.cursor = 'copy';
                return;
              }

              if (e.shiftKey) {
                shiftClickHandledRef.current = true;
                if (onSelect) {
                  onSelect(box.id, true);
                }
                setSelectedBoxId(box.id);
                return;
              }

              const currentSelected = selectedIdsRef.current;
              if (currentSelected && currentSelected.includes(box.id) && currentSelected.length > 1) {
                setSelectedBoxId(box.id);
              } else {
                if (onSelect) {
                  onSelect(box.id, false);
                }
                setSelectedBoxId(box.id);
              }
              startDragBox(e, box);
            }}
            className={`absolute pointer-events-auto group ${
              isDragging
                ? 'cursor-grabbing shadow-2xl z-[9999]'
                : isSelected
                ? 'cursor-grab active:cursor-grabbing ring-2 ring-blue-500/80 shadow-md z-[9000]'
                : 'cursor-grab active:cursor-grabbing hover:ring-1 hover:ring-black/40 z-20 transition-shadow'
            }`}
            title={
              isSelected
                ? 'Đã chọn khung (Đè/giữ chuột để di chuyển khung hoặc kéo các nút vuông để đổi kích thước)'
                : 'Nhấn vào khung để chọn, đổi màu viền, kích thước hoặc di chuyển'
            }
            style={{
              left: `${box.x}%`,
              top: `${box.y}%`,
              width: `${box.width}%`,
              height: `${box.height}%`,
              border: 'none',
              backgroundColor: box.fillColor || 'transparent',
            }}
          >
            {/* CSS borders round subpixel widths to whole pixels and disappear
                at small zoom. SVG preserves the annotation's true thickness. */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" data-annotation-box-border="true">
              <rect x={lineWidth / 2} y={lineWidth / 2}
                width={`calc(100% - ${lineWidth}px)`} height={`calc(100% - ${lineWidth}px)`}
                fill="none" stroke={box.color || '#ef4444'} strokeWidth={lineWidth}
                strokeDasharray={box.borderStyle === 'dashed' ? `${6 * dashUnit} ${4 * dashUnit}` : box.borderStyle === 'dotted' ? `${lineWidth} ${lineWidth * 1.5}` : undefined}
              />
            </svg>
            {/* Option (Alt) Clone Ghost Badge */}
            {altGhost && altGhost.id === box.id && (
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-medium px-1.5 py-0.5 rounded shadow pointer-events-none whitespace-nowrap z-50">
                Bản sao (Option/Alt)
              </div>
            )}

            {/* Floating Toolbar with smart boundary positioning & compact sleek styling */}
            {isSelected && !isMultiSelected && !isDragging && (!altGhost || altGhost.id !== box.id) && (
              <AnnotationToolbar anchorId={`box-${box.id}`} preferredAbove={!isNearTop}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className="box-floating-toolbar pointer-events-auto bg-white/98 backdrop-blur-md border border-neutral-200/90 shadow-lg rounded-lg px-2 py-1 flex items-center gap-1.5 whitespace-nowrap select-none"
              >
                {/* Border Color Swatches (5 colors: Red, Blue, Green, Yellow, Black) */}
                <div className="flex items-center gap-1 pr-1.5 border-r border-neutral-200">
                  {BOX_PRESET_COLORS.map((c) => {
                    const isChecked = allSameColor && (box.color || '#ef4444') === c;
                    return (
                      <button
                        key={c}
                        onClick={() => {
                          if (isMultiSelected && selectedBoxesOnPage.length > 1) {
                            selectedBoxesOnPage.forEach((targetBox) => {
                              const tHasFill = targetBox.fillColor && targetBox.fillColor !== 'transparent';
                              const tNewFill = tHasFill ? `${c}25` : 'transparent';
                              onUpdateBox(targetBox.id, { color: c, fillColor: tNewFill });
                            });
                          } else {
                            const newFill = hasFill ? `${c}25` : 'transparent';
                            onUpdateBox(box.id, { color: c, fillColor: newFill });
                          }
                          onUpdateBoxConfig?.({ color: c, hasBackground: hasFill });
                        }}
                        className="w-4.5 h-4.5 rounded-full border border-black/15 flex items-center justify-center transition-transform hover:scale-115 cursor-pointer shadow-2xs"
                        style={{ backgroundColor: c }}
                        title={`Đổi màu viền sang ${c}`}
                      >
                        {isChecked && (
                          <Check size={10} className={c === '#eab308' ? 'text-black' : 'text-white'} />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Border Width Selector (2px, 3px, 4px, 6px) */}
                <div className="flex items-center gap-0.5 px-1 border-r border-neutral-200">
                  {BORDER_WIDTHS.map((w) => {
                    const isActive = allSameWidth && (box.borderWidth || 2) === w;
                    return (
                      <button
                        key={w}
                        onClick={() => {
                          if (isMultiSelected && selectedBoxesOnPage.length > 1) {
                            selectedBoxesOnPage.forEach((targetBox) => {
                              onUpdateBox(targetBox.id, { borderWidth: w });
                            });
                          } else {
                            onUpdateBox(box.id, { borderWidth: w });
                          }
                          onUpdateBoxConfig?.({ borderWidth: w });
                        }}
                        className={`px-1.5 py-0.5 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-neutral-900 text-white shadow-2xs'
                            : 'text-neutral-700 hover:bg-neutral-100'
                        }`}
                        title={`Độ dày viền ${w}px`}
                      >
                        {w}px
                      </button>
                    );
                  })}
                </div>

                {/* Border Style (Solid / Dashed) */}
                <div className="flex items-center gap-1 px-0.5">
                  <button
                    onClick={() => {
                      const nextStyle = isDashed ? 'solid' : 'dashed';
                      if (isMultiSelected && selectedBoxesOnPage.length > 1) {
                        selectedBoxesOnPage.forEach((targetBox) => {
                          onUpdateBox(targetBox.id, { borderStyle: nextStyle });
                        });
                      } else {
                        onUpdateBox(box.id, { borderStyle: nextStyle });
                      }
                      onUpdateBoxConfig?.({ borderStyle: nextStyle });
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center justify-center cursor-pointer ${
                      allSameStyle && isDashed ? 'bg-neutral-900 text-white shadow-2xs' : 'text-neutral-700 hover:bg-neutral-100'
                    }`}
                    title={isDashed ? 'Chuyển sang nét liền' : 'Chuyển sang nét đứt'}
                  >
                    <span>{isDashed ? 'Đứt' : 'Liền'}</span>
                  </button>

                  {/* Fill / Background Toggle */}
                  <button
                    onClick={() => {
                      const nextHasFill = !hasFill;
                      if (isMultiSelected && selectedBoxesOnPage.length > 1) {
                        selectedBoxesOnPage.forEach((targetBox) => {
                          const targetFill = nextHasFill ? `${targetBox.color || '#ef4444'}25` : 'transparent';
                          onUpdateBox(targetBox.id, { fillColor: targetFill });
                        });
                      } else {
                        const nextFill = nextHasFill ? `${box.color || '#ef4444'}25` : 'transparent';
                        onUpdateBox(box.id, { fillColor: nextFill });
                      }
                      onUpdateBoxConfig?.({ hasBackground: nextHasFill });
                    }}
                    className={`p-1 rounded text-[11px] transition-colors cursor-pointer ${
                      allSameFill && hasFill ? 'bg-neutral-900 text-white shadow-2xs' : 'text-neutral-700 hover:bg-neutral-100'
                    }`}
                    title={hasFill ? 'Bỏ màu nền (Trong suốt)' : 'Tô màu nền nhẹ'}
                  >
                    <Square size={13} className={hasFill ? 'fill-current' : ''} />
                  </button>
                </div>
                
                <div className="w-px h-3.5 bg-neutral-200" />

                {/* Delete Button */}
                <button
                  onClick={() => {
                    if (isMultiSelected && selectedBoxesOnPage.length > 1) {
                      selectedBoxesOnPage.forEach((targetBox) => onDeleteBox(targetBox.id));
                    } else {
                      onDeleteBox(box.id);
                    }
                  }}
                  className="p-1 rounded text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors cursor-pointer shrink-0"
                  title="Xóa khung"
                >
                  <Trash2 size={13.5} />
                </button>
              </AnnotationToolbar>
            )}

            {/* 8 Smart Resize Handles (4 corners + 4 edge centers) */}
            {isSelected && (() => {
              // Smart adaptive size calculation:
              // Smaller, cleaner base size (7.5px - 8px down from old 14px)
              // Auto-adapts if box is small to prevent handle collisions, and scales gracefully with zoom
              const minDim = Math.min(box.width, box.height);
              const autoScaleFactor = Math.min(1, Math.max(0.6, minDim / 4.0));
              const baseHandleSize = 8;
              const handleSizePx = Math.max(5, Math.min(9, Math.round(baseHandleSize * autoScaleFactor)));

              const resizeHandleDefs: {
                handle: string;
                className: string;
                style: React.CSSProperties;
                title: string;
              }[] = [
                // 4 Corner Handles
                { handle: 'nw', className: 'cursor-nwse-resize', style: { left: '0%', top: '0%' }, title: 'Kéo góc trên-trái' },
                { handle: 'ne', className: 'cursor-nesw-resize', style: { left: '100%', top: '0%' }, title: 'Kéo góc trên-phải' },
                { handle: 'sw', className: 'cursor-nesw-resize', style: { left: '0%', top: '100%' }, title: 'Kéo góc dưới-trái' },
                { handle: 'se', className: 'cursor-nwse-resize', style: { left: '100%', top: '100%' }, title: 'Kéo góc dưới-phải' },
                // 4 Edge Center Handles
                { handle: 'n', className: 'cursor-ns-resize', style: { left: '50%', top: '0%' }, title: 'Kéo cạnh trên' },
                { handle: 's', className: 'cursor-ns-resize', style: { left: '50%', top: '100%' }, title: 'Kéo cạnh dưới' },
                { handle: 'w', className: 'cursor-ew-resize', style: { left: '0%', top: '50%' }, title: 'Kéo cạnh trái' },
                { handle: 'e', className: 'cursor-ew-resize', style: { left: '100%', top: '50%' }, title: 'Kéo cạnh phải' },
              ];

              return (
                <>
                  {resizeHandleDefs.map((h) => (
                    <div
                      key={h.handle}
                      onMouseDown={(e) => startResizeBox(e, box, h.handle)}
                      className={`box-handle absolute -translate-x-1/2 -translate-y-1/2 bg-white border-[1.5px] border-blue-600 rounded-[1.5px] z-50 hover:scale-125 transition-transform shadow-xs before:absolute before:-inset-2.5 before:content-[''] ${h.className}`}
                      style={{
                        ...h.style,
                        width: `${handleSizePx}px`,
                        height: `${handleSizePx}px`,
                      }}
                      title={h.title}
                    />
                  ))}
                </>
              );
            })()}
          </div>
        );
      })}



      {/* Currently Drawing Box Preview */}
      {isDrawing && currentBox && (
        <div
          className="absolute pointer-events-none"
          style={{
            borderColor: boxConfig.color || activeColor || '#ef4444',
            borderWidth: `${boxConfig.borderWidth || 2}px`,
            borderStyle: boxConfig.borderStyle || 'solid',
            backgroundColor: (boxConfig.hasBackground ?? true)
              ? `${boxConfig.color || activeColor || '#ef4444'}25`
              : 'transparent',
            left: `${currentBox.x}%`,
            top: `${currentBox.y}%`,
            width: `${currentBox.width}%`,
            height: `${currentBox.height}%`,
          }}
        />
      )}
    </div>
  );
};


