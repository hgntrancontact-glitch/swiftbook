import { highlightClip, highlightCorners, highlightDisplayRects } from '../utils/highlightGeometry';
import { HIGHLIGHT_TOOLBAR_SIZE } from '../utils/annotationUi';
import { AnnotationToolbar } from './AnnotationToolbar';
import { HighlightNoteOverlay } from './HighlightNoteOverlay';
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HighlightAnnotation, HIGHLIGHT_COLORS, HighlightColor, NormalizedRect } from '../types';
import { Trash2, MessageSquare, Edit3, X, Pin, PinOff, Eye } from 'lucide-react';

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
  const pageHighlights = React.useMemo(() => highlights.filter((h) => h.pageNumber === pageNumber).map(hl => {
    const isText = hl.selectionKind === 'text' || !!hl.text || hl.rects.some(r => !!r.rise);
    return { ...hl, selectionKind: isText ? 'text' as const : hl.selectionKind, rects: hl.selectionGeometry === 'line' ? hl.rects : highlightDisplayRects(hl.rects, isText) };
  }), [highlights, pageNumber]);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const [hoveredNoteHlId, setHoveredNoteHlId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<{ id: string; text: string } | null>(null);

  const [previewMode, setPreviewMode] = useState<'auto' | 'pinned' | 'transparent'>('auto');
  const previewIdRef = useRef(hoveredNoteHlId);
  previewIdRef.current = hoveredNoteHlId;
  const previewOwner = elevatedContainerId || `highlight-note-${pageNumber}`;
  const focusHighlight = (id: string) => {
    window.dispatchEvent(new CustomEvent('highlight-note-focus', { detail: { owner: previewOwner, id } }));
  };
  const isPinching = () => !!document.querySelector('.pdf-viewport-container[data-zoom-gesture="true"]');
  const openNotePreview = (id: string) => {
    if (isPinching()) return;
    focusHighlight(id);
    if (previewIdRef.current !== id) setPreviewMode('auto');
    setHoveredNoteHlId(id);
  };
  const closeNotePreview = () => {
    setHoveredNoteHlId(null);
    setPreviewMode('auto');
  };

  // A pinned preview belongs to one highlight, including across PDF pages/documents.
  useEffect(() => {
    const handleFocus = (event: Event) => {
      const { owner, id } = (event as CustomEvent).detail;
      if (owner !== previewOwner || id !== previewIdRef.current) {
        setHoveredNoteHlId(null);
        setPreviewMode('auto');
      }
    };
    window.addEventListener('highlight-note-focus', handleFocus);
    return () => window.removeEventListener('highlight-note-focus', handleFocus);
  }, [previewOwner]);

  useEffect(() => {
    if (!hoveredNoteHlId || !highlights.some(hl => hl.id === hoveredNoteHlId && hl.pageNumber === pageNumber && hl.note)) {
      setHoveredNoteHlId(null);
      setPreviewMode('auto');
    }
  }, [highlights, pageNumber, hoveredNoteHlId]);

  useEffect(() => {
    if (!hoveredNoteHlId || previewMode !== 'auto') return;
    const onMove = (event: MouseEvent) => {
      if (isPinching()) return;
      const target = event.target as Node;
      const overlay = [...document.querySelectorAll<HTMLElement>('[data-highlight-note-overlay]')]
        .find(el => el.dataset.highlightNoteOverlay === hoveredNoteHlId && el.dataset.highlightNoteOwner === previewOwner);
      if (overlay?.contains(target)) return;
      const highlight = highlights.find(hl => hl.id === hoveredNoteHlId);
      const scope = document.getElementById(elevatedContainerId || `elevated-annotation-container-${pageNumber}`)?.closest('[data-page-container="true"]') || document;
      if (highlight?.rects.some((_, i) => scope.querySelector(`#${CSS.escape(`hl-${hoveredNoteHlId}-rect-${i}`)}`)?.contains(target) || scope.querySelector(`#${CSS.escape(`elevated-hl-${hoveredNoteHlId}-rect-${i}`)}`)?.contains(target))) return;
      setHoveredNoteHlId(null);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [hoveredNoteHlId, previewMode, highlights, previewOwner, elevatedContainerId, pageNumber]);

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
      if (el?.closest?.('.highlight-popup-toolbar, .highlight-note-preview')) {
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
            data-highlight-rise={rect.rise || 0}
            data-highlight-height={rect.height}
            className={`absolute pointer-events-auto cursor-pointer select-none ${
              isSelected ? 'ring-2 ring-blue-500' : ''
            }`}
            style={{
              left: `${rect.x}%`,
              top: `${rect.y}%`,
              width: `${rect.width}%`,
              height: `${rect.height}%`,
              clipPath: highlightClip(rect),
            }}
            onMouseEnter={() => {
              if (hl.note && activeHighlightId !== hl.id) openNotePreview(hl.id);
            }}
            onMouseLeave={() => {
              if (previewMode === 'auto' && !isPinching()) setHoveredNoteHlId(prev => prev === hl.id ? null : prev);
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              focusHighlight(hl.id);
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
              <HighlightNoteOverlay
                anchorId={`${isElevated ? 'elevated-' : ''}hl-${hl.id}-rect-0`}
                scopeId={elevatedContainerId || `elevated-annotation-container-${pageNumber}`}
                owner={previewOwner} highlightId={hl.id} mode={previewMode}
                showPopup={hoveredNoteHlId === hl.id && activeHighlightId !== hl.id}
                onEnter={() => { if (activeHighlightId !== hl.id) openNotePreview(hl.id); }}
                onLeave={() => {
                  if (previewMode === 'auto' && !isPinching()) setHoveredNoteHlId(prev => prev === hl.id ? null : prev);
                }}
                onEdit={() => {
                  focusHighlight(hl.id);
                  closeNotePreview();
                  setActiveHighlightId(activeHighlightId === hl.id ? null : hl.id);
                }}
              >
                {/* Quick note hover tooltip preview */}
                {(
                  <div 
                    className="highlight-note-preview w-full max-w-[280px] pointer-events-auto text-xs font-['Inter',sans-serif] cursor-default"
                    data-highlight-note-preview={hl.id} data-preview-mode={previewMode}
                    style={{ maxHeight: 'var(--highlight-popup-height)', display: 'flex', flexDirection: 'column', pointerEvents: previewMode === 'transparent' ? 'none' : 'auto' }}
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => e.stopPropagation()}
                  >
                    <div className={`rounded-xl p-2 border flex flex-col min-h-0 ${previewMode === 'transparent' ? 'text-neutral-950 border-neutral-700/30 shadow-md' : 'bg-neutral-900 text-white border-neutral-700/60 shadow-2xl'}`}
                      style={previewMode === 'transparent' ? { backgroundColor: 'rgba(255,255,255,0.16)' } : undefined}>

                    <div data-highlight-note-header className="flex items-center gap-1 shrink-0 font-bold text-[#f5c41a] text-[10.5px] mb-0.5 pb-0.5 border-b border-neutral-800 pointer-events-auto">
                      <MessageSquare size={10} className="fill-[#f5c41a]" />
                      <span className={previewMode === 'transparent' ? 'text-neutral-950' : ''}>Ghi chú</span>
                      <button type="button" className="ml-auto p-0.5 rounded hover:bg-neutral-500/20 pointer-events-auto"
                        data-highlight-note-mode="true"
                        title={previewMode === 'auto' ? 'Ghim hiển thị — giữ ghi chú khi rê chuột ra ngoài' : previewMode === 'pinned' ? 'Ghim trong suốt — nhìn nội dung PDF phía dưới' : 'Tự thu gọn — thu gọn khi rê chuột ra ngoài'}
                        aria-label={previewMode === 'auto' ? 'Ghim hiển thị' : previewMode === 'pinned' ? 'Ghim trong suốt' : 'Tự thu gọn'}
                        onClick={e => {
                          e.stopPropagation();
                          setPreviewMode(mode => mode === 'auto' ? 'pinned' : mode === 'pinned' ? 'transparent' : 'auto');
                        }}>
                        {previewMode === 'auto' ? <PinOff size={12} /> : previewMode === 'pinned' ? <Pin size={12} /> : <Eye size={12} />}
                      </button>
                      <button type="button" title="Đóng ghi chú" aria-label="Đóng ghi chú" className="p-0.5 rounded hover:bg-neutral-500/20"
                        onClick={e => { e.stopPropagation(); closeNotePreview(); }}><X size={12} /></button>
                    </div>
                    <div data-highlight-note-body className="overflow-y-auto min-h-0">
                    <p className={`${previewMode === 'transparent' ? 'text-neutral-950' : 'text-neutral-200'} text-xs leading-relaxed whitespace-pre-wrap break-words`}>
                      {hl.note}
                    </p>
                    <div className="text-[10px] text-neutral-400 mt-1.5 text-right italic">
                      Nhấp đúp chuột vào highlight để sửa
                    </div>
                    </div>
                    </div>
                  </div>
                )}
              </HighlightNoteOverlay>
            )}
          </div>
        ))}

        {/* Note & Color Popover Toolbar when Double-Clicked or Right-Clicked */}
        {activeHighlightId === hl.id && hl.rects.length > 0 && (
          <AnnotationToolbar
            anchorId={`${isElevated ? 'elevated-' : ''}hl-${hl.id}-rect-0`}
            anchorIds={hl.rects.map((_, i) => `${isElevated ? 'elevated-' : ''}hl-${hl.id}-rect-${i}`)}
            scopeId={elevatedContainerId || `elevated-annotation-container-${pageNumber}`}
            preserveAnchorGap
            align="left"
            preferredAbove={false}
            scaleWithPage
            uiScale={HIGHLIGHT_TOOLBAR_SIZE}
            className="highlight-popup-toolbar bg-white rounded-xl shadow-2xl border border-neutral-200 p-3 text-neutral-800 pointer-events-auto font-['Inter',sans-serif]"
            style={{ width: 288 }}
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
                <span className="text-[11.5px] text-neutral-600 font-semibold ml-1">
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
                    <p className="text-neutral-800 text-[11.5px] leading-relaxed break-words">{hl.note}</p>
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
          </AnnotationToolbar>
        )}
      </React.Fragment>
    );
  };

  const baseHighlights = pageHighlights.filter((hl) => !isHlElevated(hl.id));
  const elevatedHighlights = pageHighlights.filter((hl) => isHlElevated(hl.id));

  return (
    <>
        {/* SVG Uniform Highlight Layer - Fixed, no seam lines, no overlapping dividing marks */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-20"
          data-annotation-highlights="true"
          style={{ mixBlendMode: 'multiply' }}
        >
          {pageHighlights.map((hl) => {
            const colorConfig = HIGHLIGHT_COLORS[hl.color] || HIGHLIGHT_COLORS.yellow;
            const displayRects = hl.selectionKind === 'text' || !!hl.text ? hl.rects : mergeContiguousRects(hl.rects);

            return (
              <g key={`hl-svg-${hl.id}`} opacity={0.42}>
                {displayRects.map((rect, idx) => (
                  <polygon
                    key={`hl-rect-${hl.id}-${idx}`}
                    points={highlightCorners(rect).map(p=>p.join(',')).join(' ')}
                    fill={colorConfig.hex}
                  />
                ))}
              </g>
            );
          })}
        </svg>

      <div className="absolute inset-0 pointer-events-none select-none overflow-visible z-20">
        {/* Interactive Fixed Base Highlight Elements */}
        {baseHighlights.map((hl) => renderHighlightInteractive(hl, false))}
      </div>

      {/* Elevated Highlight Layer: ONLY the specifically selected/active highlight is rendered above StickyNotesLayer */}
      {targetElevatedContainer &&
        elevatedHighlights.length > 0 &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="absolute inset-0 pointer-events-none select-none overflow-visible">
            {elevatedHighlights.map((hl) => renderHighlightInteractive(hl, true))}
          </div>,
          targetElevatedContainer
        )}
    </>
  );
};
