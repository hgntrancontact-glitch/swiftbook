import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HighlightAnnotation, HIGHLIGHT_COLORS, HighlightColor, NormalizedRect } from '../types';
import { Trash2, MessageSquare, Edit3, X } from 'lucide-react';

// Helper to merge contiguous/overlapping line rects into unified solid blocks without seam lines
function mergeContiguousRects(rects: NormalizedRect[]): NormalizedRect[] {
  if (!rects || rects.length <= 1) return rects || [];

  const sorted = [...rects].sort((a, b) => a.y - b.y);
  const merged: NormalizedRect[] = [];

  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const currentBottom = current.y + current.height;
    const touchesVertically = next.y <= currentBottom + 0.6;

    const currentRight = current.x + current.width;
    const nextRight = next.x + next.width;
    const similarX = Math.abs(current.x - next.x) < 8;
    const similarRight = Math.abs(currentRight - nextRight) < 8;
    const horizontallyOverlaps = Math.max(current.x, next.x) < Math.min(currentRight, nextRight);

    if (touchesVertically && (similarX || similarRight || horizontallyOverlaps)) {
      const newX = Math.min(current.x, next.x);
      const newY = Math.min(current.y, next.y);
      const newRight = Math.max(currentRight, nextRight);
      const newBottom = Math.max(currentBottom, next.y + next.height);

      current = {
        x: newX,
        y: newY,
        width: newRight - newX,
        height: newBottom - newY,
      };
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);
  return merged;
}

interface HighlightOverlayProps {
  pageNumber: number;
  highlights: HighlightAnnotation[];
  onDeleteHighlight: (id: string) => void;
  onUpdateHighlight?: (id: string, updates: Partial<HighlightAnnotation>, skipHistory?: boolean) => void;
  onUpdateHighlightNote?: (id: string, note: string) => void;
  onUpdateHighlightColor?: (id: string, color: HighlightColor) => void;
  onAddHighlight?: (highlight: HighlightAnnotation) => void;
  selectedIds?: string[];
  onSelect?: (id: string, isShift: boolean) => void;
  elevatedContainerId?: string;
}

export const HighlightOverlay: React.FC<HighlightOverlayProps> = ({
  pageNumber,
  highlights,
  onDeleteHighlight,
  onUpdateHighlightNote,
  onUpdateHighlightColor,
  selectedIds,
  onSelect,
  elevatedContainerId,
}) => {
  const pageHighlights = highlights.filter((h) => h.pageNumber === pageNumber);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const [hoveredNoteHlId, setHoveredNoteHlId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<{ id: string; text: string } | null>(null);

  const [mountedContainer, setMountedContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = document.getElementById(elevatedContainerId || `elevated-annotation-container-${pageNumber}`);
    if (el) setMountedContainer(el);
  }, [pageNumber, elevatedContainerId]);
  const targetElevatedContainer = mountedContainer || (typeof document !== 'undefined' ? document.getElementById(elevatedContainerId || `elevated-annotation-container-${pageNumber}`) : null);

  const isHlElevated = (hlId: string) => {
    if (selectedIds && selectedIds.includes(hlId)) return true;
    if (activeHighlightId === hlId) return true;
    return false;
  };

  // Close highlight toolbar when clicking outside (left or right click)
  useEffect(() => {
    if (!activeHighlightId) return;

    const handleGlobalClickAway = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target : (e.target as Node | null)?.parentElement;
      if (el?.closest?.('.highlight-popup-toolbar')) {
        return;
      }
      setActiveHighlightId(null);
      setEditingNote(null);
      setHoveredNoteHlId(null);
    };

    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleGlobalClickAway);
      window.addEventListener('contextmenu', handleGlobalClickAway);
    }, 100);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', handleGlobalClickAway);
      window.removeEventListener('contextmenu', handleGlobalClickAway);
    };
  }, [activeHighlightId]);

  if (pageHighlights.length === 0) return null;

  const renderHighlightInteractive = (hl: HighlightAnnotation, isElevated: boolean) => {
    const colorConfig = HIGHLIGHT_COLORS[hl.color] || HIGHLIGHT_COLORS.yellow;
    const isSelected = selectedIds?.includes(hl.id);

    return (
      <React.Fragment key={`${isElevated ? 'elevated-' : 'base-'}${hl.id}`}>
        {hl.rects.map((rect, idx) => (
          <div
            key={`${isElevated ? 'elevated-' : 'base-'}${hl.id}-interactive-${idx}`}
            id={`${isElevated ? 'elevated-' : ''}hl-${hl.id}-rect-${idx}`}
            className={`absolute pointer-events-auto cursor-pointer select-none ${
              isSelected ? 'ring-2 ring-blue-500 bg-blue-500/10' : ''
            }`}
            style={{
              left: `${rect.x}%`,
              top: `${rect.y}%`,
              width: `${rect.width}%`,
              height: `${rect.height}%`,
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              if (e.button === 0 && onSelect) {
                onSelect(hl.id, e.shiftKey);
              }
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setHoveredNoteHlId(null);
              setActiveHighlightId(activeHighlightId === hl.id ? null : hl.id);
            }}
            onContextMenu={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setHoveredNoteHlId(null);
              setActiveHighlightId(activeHighlightId === hl.id ? null : hl.id);
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
            title={
              hl.note
                ? `Ghi chú: ${hl.note} (Nhấp đúp hoặc chuột phải để sửa/đổi màu)`
                : `Highlight (${colorConfig.name}) - Nhấp đúp hoặc chuột phải để thêm ghi chú/đổi màu`
            }
          >
            {/* Visual indicator icon if there's an attached note */}
            {idx === 0 && hl.note && (
              <div
                className="absolute -top-3.5 -right-2.5 z-30 pointer-events-auto"
                onMouseEnter={(e) => {
                  e.stopPropagation();
                  if (activeHighlightId !== hl.id) {
                    setHoveredNoteHlId(hl.id);
                  }
                }}
                onMouseLeave={(e) => {
                  e.stopPropagation();
                  setHoveredNoteHlId((prev) => (prev === hl.id ? null : prev));
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setHoveredNoteHlId(null);
                  setActiveHighlightId(activeHighlightId === hl.id ? null : hl.id);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setHoveredNoteHlId(null);
                  setActiveHighlightId(activeHighlightId === hl.id ? null : hl.id);
                }}
                onContextMenu={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setHoveredNoteHlId(null);
                  setActiveHighlightId(activeHighlightId === hl.id ? null : hl.id);
                }}
              >
                <button
                  type="button"
                  className="w-5 h-5 bg-[#f5c41a] hover:bg-[#e5a84c] text-neutral-950 font-bold rounded-full shadow-md text-[10px] flex items-center justify-center border-2 border-white cursor-pointer transition-transform hover:scale-110 active:scale-95"
                  title="Xem/Sửa ghi chú"
                  onClick={(e) => {
                    e.stopPropagation();
                    setHoveredNoteHlId(null);
                    setActiveHighlightId(activeHighlightId === hl.id ? null : hl.id);
                  }}
                  onContextMenu={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setHoveredNoteHlId(null);
                    setActiveHighlightId(activeHighlightId === hl.id ? null : hl.id);
                  }}
                >
                  <MessageSquare size={10} className="fill-neutral-950 stroke-neutral-950" />
                </button>

                {/* Quick note hover tooltip preview */}
                {hoveredNoteHlId === hl.id && activeHighlightId !== hl.id && (
                  <div 
                    className="absolute bottom-full right-0 mb-1.5 w-64 max-w-[280px] bg-neutral-900 text-white rounded-xl p-2.5 shadow-2xl border border-neutral-700/60 z-[99999] pointer-events-none text-xs font-['Inter',sans-serif] animate-in fade-in zoom-in-95 duration-150"
                  >
                    <div className="flex items-center gap-1.5 font-bold text-[#f5c41a] text-[11px] mb-1 pb-1 border-b border-neutral-800">
                      <MessageSquare size={11} className="fill-[#f5c41a]" />
                      <span>Ghi chú</span>
                    </div>
                    <p className="text-neutral-200 text-xs leading-relaxed whitespace-pre-wrap break-words">
                      {hl.note}
                    </p>
                    <div className="text-[10px] text-neutral-400 mt-1.5 text-right italic">
                      Nhấp đúp chuột vào highlight để sửa
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Note & Color Popover Toolbar when Double-Clicked or Right-Clicked */}
        {activeHighlightId === hl.id && hl.rects.length > 0 && (
          <div
            className="highlight-popup-toolbar absolute z-[99999] bg-white rounded-xl shadow-2xl border border-neutral-200 p-3 w-72 text-neutral-800 pointer-events-auto animate-in fade-in zoom-in-95 duration-150 font-['Inter',sans-serif]"
            style={{
              left: `${Math.min(Math.max(hl.rects[0].x, 3), 65)}%`,
              top: `${Math.min(hl.rects[0].y + hl.rects[0].height + 2, 80)}%`,
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
          >
            <div className="flex items-center justify-between pb-2 border-b border-neutral-100 mb-2">
              {/* Color chooser in popup */}
              <div className="flex items-center gap-1.5 font-medium">
                {(['yellow', 'green', 'pink', 'red', 'gray'] as HighlightColor[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      if (onUpdateHighlightColor) {
                        onUpdateHighlightColor(hl.id, c);
                      }
                    }}
                    className={`w-4 h-4 rounded-full transition-transform cursor-pointer ${
                      hl.color === c ? 'scale-125 ring-2 ring-neutral-900' : 'opacity-60 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: HIGHLIGHT_COLORS[c].hex }}
                    title={`Đổi sang màu ${HIGHLIGHT_COLORS[c].name}`}
                  />
                ))}
                <span className="text-[11px] text-neutral-600 font-semibold ml-1">
                  {colorConfig.name}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    onDeleteHighlight(hl.id);
                    setActiveHighlightId(null);
                  }}
                  className="text-neutral-400 hover:text-red-600 transition-colors p-1 rounded hover:bg-neutral-100 cursor-pointer"
                  title="Xóa Highlight này"
                >
                  <Trash2 size={13} />
                </button>
                <button
                  onClick={() => setActiveHighlightId(null)}
                  className="text-neutral-400 hover:text-neutral-700 p-1 rounded hover:bg-neutral-100 cursor-pointer"
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            {editingNote?.id === hl.id ? (
              <div className="mt-2 space-y-2">
                <textarea
                  value={editingNote.text}
                  onChange={(e) => setEditingNote({ id: hl.id, text: e.target.value })}
                  placeholder="Nhập nội dung ghi chú..."
                  className="w-full text-xs p-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none h-18"
                  autoFocus
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    onClick={() => setEditingNote(null)}
                    className="px-2.5 py-1 text-[11px] rounded text-neutral-600 hover:bg-neutral-100 font-medium cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={() => {
                      if (onUpdateHighlightNote) {
                        onUpdateHighlightNote(hl.id, editingNote.text);
                      }
                      setEditingNote(null);
                    }}
                    className="px-2.5 py-1 text-[11px] rounded bg-neutral-900 text-white hover:bg-black font-medium cursor-pointer"
                  >
                    Lưu
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {hl.note ? (
                  <div className="group relative bg-amber-50/70 p-2 rounded-lg border border-amber-200/50 mb-2">
                    <p className="text-neutral-800 text-[11px] leading-relaxed break-words">{hl.note}</p>
                    <button
                      onClick={() => setEditingNote({ id: hl.id, text: hl.note || '' })}
                      className="mt-1.5 text-[10px] text-amber-700 hover:text-amber-900 font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 size={10} />
                      <span>Chỉnh sửa ghi chú</span>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingNote({ id: hl.id, text: '' })}
                    className="w-full py-1.5 px-2 text-[11px] text-neutral-600 bg-neutral-50 hover:bg-neutral-100 rounded-lg border border-neutral-200/70 font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <MessageSquare size={12} />
                    <span>Thêm ghi chú cho Highlight</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </React.Fragment>
    );
  };

  const baseHighlights = pageHighlights.filter((hl) => !isHlElevated(hl.id));
  const elevatedHighlights = pageHighlights.filter((hl) => isHlElevated(hl.id));

  return (
    <>
      {/* Base Highlight Layer: Strictly kept at z-20 underneath StickyNotesLayer (z-30) */}
      <div
        className="absolute inset-0 pointer-events-none select-none overflow-visible z-20"
        style={{
          transformStyle: 'preserve-3d',
          WebkitBackfaceVisibility: 'hidden',
          transform: 'translateZ(0px)',
        }}
      >
        {/* SVG Uniform Highlight Layer - Fixed, no seam lines, no overlapping dividing marks */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
          style={{ mixBlendMode: 'multiply' }}
        >
          {baseHighlights.map((hl) => {
            const colorConfig = HIGHLIGHT_COLORS[hl.color] || HIGHLIGHT_COLORS.yellow;
            const displayRects = mergeContiguousRects(hl.rects);

            return (
              <g key={`hl-svg-${hl.id}`} opacity={0.42}>
                {displayRects.map((rect, idx) => (
                  <rect
                    key={`hl-rect-${hl.id}-${idx}`}
                    x={rect.x}
                    y={rect.y}
                    width={rect.width}
                    height={rect.height}
                    fill={colorConfig.hex}
                  />
                ))}
              </g>
            );
          })}
        </svg>

        {/* Interactive Fixed Base Highlight Elements */}
        {baseHighlights.map((hl) => renderHighlightInteractive(hl, false))}
      </div>

      {/* Elevated Highlight Layer: ONLY the specifically selected/active highlight is rendered above StickyNotesLayer */}
      {targetElevatedContainer &&
        elevatedHighlights.length > 0 &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="absolute inset-0 pointer-events-none select-none overflow-visible">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
              style={{ mixBlendMode: 'multiply' }}
            >
              {elevatedHighlights.map((hl) => {
                const colorConfig = HIGHLIGHT_COLORS[hl.color] || HIGHLIGHT_COLORS.yellow;
                const displayRects = mergeContiguousRects(hl.rects);

                return (
                  <g key={`elevated-hl-svg-${hl.id}`} opacity={0.42}>
                    {displayRects.map((rect, idx) => (
                      <rect
                        key={`elevated-hl-rect-${hl.id}-${idx}`}
                        x={rect.x}
                        y={rect.y}
                        width={rect.width}
                        height={rect.height}
                        fill={colorConfig.hex}
                      />
                    ))}
                  </g>
                );
              })}
            </svg>

            {elevatedHighlights.map((hl) => renderHighlightInteractive(hl, true))}
          </div>,
          targetElevatedContainer
        )}
    </>
  );
};
