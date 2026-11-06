import React, { useState, useRef, useEffect } from 'react';
import { TextNoteAnnotation, NOTE_PAPER_COLORS } from '../types';
import { findBestMatchingPage } from '../utils/pageBoundaryHelper';

import { StickyNote, Trash2, X, Check, Move } from 'lucide-react';

interface TextNotesLayerProps {
  pageNumber: number;
  notes: TextNoteAnnotation[];
  isAddNoteMode: boolean;
  onAddNote: (note: Omit<TextNoteAnnotation, 'id' | 'createdAt'>) => void;
  onUpdateNote: (id: string, updates: Partial<TextNoteAnnotation>) => void;
  
  onDeleteNote: (id: string) => void;
}

export const TextNotesLayer: React.FC<TextNotesLayerProps> = ({
  pageNumber,
  notes,
  isAddNoteMode,
  onAddNote,
  onUpdateNote,
    onDeleteNote,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);

  const getTheme = (colorIdOrHex: string | undefined) => {
    return NOTE_PAPER_COLORS.find((c) => c.id === colorIdOrHex) || 
           NOTE_PAPER_COLORS.find((c) => c.noteBg === colorIdOrHex) || 
           NOTE_PAPER_COLORS[0];
  };

  const pageNotes = notes.filter((n) => n.pageNumber === pageNumber);

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isAddNoteMode || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(2, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(2, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100));

    onAddNote({
      pageNumber,
      x,
      y,
      text: 'Ghi chú mới...',
      color: 'color-1',
      isOpen: true,
    } as any);
  };

  useEffect(() => {
    if (!draggingNoteId) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(2, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(2, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100));
      onUpdateNote(draggingNoteId, { x, y });
    };
    
    const handleMouseUp = () => {
      if (draggingNoteId) {
        const note = notes.find(n => n.id === draggingNoteId);
        if (note) {
           const el = document.getElementById(`textnote-${draggingNoteId}`);
           if (el) {
             const rect = el.getBoundingClientRect();
             const match = findBestMatchingPage(rect, pageNumber);
             if (match) {
               onUpdateNote(draggingNoteId, {
                 pageNumber: match.targetPage,
                 x: match.relXPct,
                 y: match.relYPct
               });
             }
           }
        }
      }
      setDraggingNoteId(null);
    };


    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingNoteId]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 z-20 ${
        isAddNoteMode ? 'cursor-crosshair pointer-events-auto bg-black/5' : 'pointer-events-none'
      }`}
      onClick={handleContainerClick}
    >
      {isAddNoteMode && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-neutral-900 text-white text-xs px-3 py-1 rounded-full shadow pointer-events-none flex items-center gap-1.5 z-30">
          <StickyNote size={13} />
          <span>Nhấn vào bất kỳ vị trí nào trên trang để đặt ghi chú</span>
        </div>
      )}

      {pageNotes.map((note) => {
        const isOpen = activeNoteId === note.id || (note as any).isOpen;
        const theme = getTheme(note.color);

        return (
          <div
            key={note.id}
            id={`textnote-${note.id}`}
            className="absolute pointer-events-auto select-none"
            style={{
              left: `${note.x}%`,
              top: `${note.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {!isOpen ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveNoteId(note.id);
                  setEditingText(note.text);
                }}
                className="w-7 h-7 rounded-full shadow-md flex items-center justify-center transition-transform duration-150 hover:scale-110 border-2 border-neutral-900 focus:outline-none"
                style={{ background: theme.noteBg }}
                title={`Ghi chú: ${note.text}`}
              >
                <StickyNote size={14} className="text-neutral-900" />
              </button>
            ) : (
              <div
                className="rounded-lg shadow-2xl border-2 border-neutral-900 w-64 z-40 text-xs font-['Inter',sans-serif] animate-in fade-in zoom-in-95 overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div 
                  className="flex items-center justify-between px-3 py-2 border-b border-black/15"
                  style={{ background: theme.headerBg }}
                >
                  <div
                    className="flex items-center gap-1 text-black cursor-grab active:cursor-grabbing text-[11px] font-bold"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setDraggingNoteId(note.id);
                    }}
                    title="Kéo thả để di chuyển ghi chú"
                  >
                    <Move size={12} />
                    <span>Trang {pageNumber}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onDeleteNote(note.id)}
                      className="p-1 text-black hover:text-red-700 transition-colors rounded hover:bg-black/10"
                      title="Xóa ghi chú"
                    >
                      <Trash2 size={13} />
                    </button>
                    <button
                      onClick={() => {
                        setActiveNoteId(null);
                        onUpdateNote(note.id, { text: editingText });
                      }}
                      className="p-1 text-black hover:text-neutral-900 transition-colors rounded hover:bg-black/10"
                      title="Đóng ghi chú"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>

                <div 
                  className="p-3" 
                  style={{ backgroundColor: theme.contentBg }}
                >
                  <textarea
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onBlur={() => onUpdateNote(note.id, { text: editingText })}
                    placeholder="Nhập nội dung ghi chú tại đây..."
                    rows={4}
                    className="w-full bg-transparent p-1 text-xs focus:outline-none text-neutral-900 resize-none font-['Inter',sans-serif] font-medium"
                    autoFocus
                  />
                </div>

                <div 
                  className="flex items-center justify-between px-3 py-2 border-t border-black/10"
                  style={{ background: theme.noteBg }}
                >
                  <div className="flex items-center gap-1.5">
                    {NOTE_PAPER_COLORS.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => onUpdateNote(note.id, { text: editingText, color: c.id })}
                        className={`w-4 h-4 rounded-full border transition-transform ${
                          theme.id === c.id ? 'scale-125 border-black border-2' : 'border-black/30 hover:scale-110'
                        }`}
                        style={{ background: c.noteBg }}
                        title={c.name}
                      />
                    ))}
                  </div>

                  <button
                    onClick={() => {
                      onUpdateNote(note.id, { text: editingText });
                      setActiveNoteId(null);
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-neutral-900 text-white text-[10px] font-medium hover:bg-black"
                  >
                    <Check size={10} />
                    <span>Lưu</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
