const fs = require('fs');

let content = fs.readFileSync('src/components/StickyNotesLayer.tsx', 'utf8');

// I will just do a string replacement for the Expanded note section.

const expandedNoteCodeRegex = /\/\* Expanded 3-Layer Sticky Note Paper \*\/[\s\S]*?(?=<\/div>\n\s*\)\}\n\s*<\/div>)/;

const newExpandedNoteCode = `/* Expanded 3-Layer Sticky Note Paper */
              <ExpandedStickyNote
                note={note}
                theme={theme}
                pageNumber={pageNumber}
                onUpdateNote={onUpdateNote}
                onDeleteNote={onDeleteNote}
                startDrag={startDrag}
                containerRef={containerRef}
              />`;

content = content.replace(expandedNoteCodeRegex, newExpandedNoteCode);

const expandedComponentCode = `

interface ExpandedStickyNoteProps {
  note: TextNoteAnnotation;
  theme: NoteColorTheme;
  pageNumber: number;
  onUpdateNote: (id: string, updates: Partial<TextNoteAnnotation>) => void;
  onDeleteNote: (id: string) => void;
  startDrag: (e: React.MouseEvent, note: TextNoteAnnotation) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const ExpandedStickyNote: React.FC<ExpandedStickyNoteProps> = ({
  note,
  theme,
  pageNumber,
  onUpdateNote,
  onDeleteNote,
  startDrag,
  containerRef,
}) => {
  const [size, setSize] = useState({ width: 224, height: 160 });

  const handleResizeStart = (e: React.MouseEvent, dir: 'nw' | 'ne' | 'sw' | 'se') => {
    e.stopPropagation();
    e.preventDefault();
    if (!containerRef.current) return;
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = size.width;
    const startHeight = size.height;
    const startNoteX = note.x;
    const startNoteY = note.y;
    const rect = containerRef.current.getBoundingClientRect();

    const onMouseMove = (moveEvent: MouseEvent) => {
      let dx = moveEvent.clientX - startX;
      let dy = moveEvent.clientY - startY;
      
      let newWidth = startWidth;
      let newHeight = startHeight;
      let newNoteX = startNoteX;
      let newNoteY = startNoteY;

      if (dir.includes('e')) {
        newWidth = startWidth + dx;
      }
      if (dir.includes('w')) {
        newWidth = startWidth - dx;
        newNoteX = startNoteX + (dx / rect.width) * 100;
      }
      if (dir.includes('s')) {
        newHeight = startHeight + dy;
      }
      if (dir.includes('n')) {
        newHeight = startHeight - dy;
        newNoteY = startNoteY + (dy / rect.height) * 100;
      }

      if (newWidth < 180) {
        if (dir.includes('w')) newNoteX = startNoteX + ((startWidth - 180) / rect.width) * 100;
        newWidth = 180;
      }
      if (newHeight < 120) {
        if (dir.includes('n')) newNoteY = startNoteY + ((startHeight - 120) / rect.height) * 100;
        newHeight = 120;
      }

      setSize({ width: newWidth, height: newHeight });
      
      if (dir.includes('n') || dir.includes('w')) {
        onUpdateNote(note.id, { x: newNoteX, y: newNoteY });
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div
      className="relative rounded-xl shadow-2xl border border-black/20 flex flex-col text-xs font-['Inter',sans-serif] animate-in fade-in zoom-in-95 duration-150"
      style={{
        width: \`\${size.width}px\`,
        height: \`\${size.height}px\`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 4 Corner handles for resizing */}
      <div onMouseDown={(e) => handleResizeStart(e, 'nw')} className="absolute top-0 left-0 w-4 h-4 cursor-nwse-resize z-[100]" />
      <div onMouseDown={(e) => handleResizeStart(e, 'ne')} className="absolute top-0 right-0 w-4 h-4 cursor-nesw-resize z-[100]" />
      <div onMouseDown={(e) => handleResizeStart(e, 'sw')} className="absolute bottom-0 left-0 w-4 h-4 cursor-nesw-resize z-[100]" />
      <div onMouseDown={(e) => handleResizeStart(e, 'se')} className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-[100]" />

      <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none flex flex-col">
        {/* LAYER 1: Top Header Bar (Gradient / Hex specified) */}
        <div
          onMouseDown={(e) => startDrag(e, note)}
          className="pointer-events-auto px-2.5 py-1.5 flex items-center justify-between cursor-grab active:cursor-grabbing border-b border-black/10 select-none text-black shrink-0"
          style={{ background: theme.headerBg }}
          title="Giữ chuột trái để di chuyển note"
        >
          <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-black">
            <Move size={13} className="text-black" />
            <span className="text-black font-extrabold">Note</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onUpdateNote(note.id, { isMinimized: true })}
              className="p-1 rounded hover:bg-black/15 text-black opacity-90 hover:opacity-100 transition-opacity"
              title="Thu nhỏ thành biểu tượng"
            >
              <Minimize2 size={13} />
            </button>
            <button
              onClick={() => onDeleteNote(note.id)}
              className="p-1 rounded hover:bg-black/15 text-black opacity-90 hover:opacity-100 hover:text-red-700 transition-opacity"
              title="Xóa note"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* LAYER 2: Main Content Area */}
        <div className="pointer-events-auto p-2.5 flex-1 flex flex-col" style={{ backgroundColor: theme.contentBg }}>
          <textarea
            autoFocus
            value={note.text}
            onChange={(e) => onUpdateNote(note.id, { text: e.target.value })}
            placeholder="Gõ nội dung ghi chú..."
            className="w-full flex-1 h-full bg-transparent border-none outline-none resize-none text-[12px] font-medium leading-relaxed text-black placeholder:text-neutral-500 placeholder:font-normal"
          />
        </div>

        {/* LAYER 3: Footer Bar ("Trang X" 100% black text) */}
        <div
          className="pointer-events-auto px-2.5 py-1.5 flex items-center justify-between border-t border-black/10 text-[9.5px] shrink-0"
          style={{ backgroundColor: theme.noteBg }}
        >
          <div className="flex items-center gap-1.5">
            {NOTE_PAPER_COLORS.map((c) => (
              <button
                key={c.id}
                onClick={() => onUpdateNote(note.id, { color: c.contentBg })}
                className={\`w-3.5 h-3.5 rounded-full border border-black/40 transition-all \${
                  theme.id === c.id
                    ? 'scale-115 border-2 border-black ring-2 ring-black/30 shadow-xs'
                    : 'hover:scale-110 opacity-80 hover:opacity-100'
                }\`}
                style={{ background: c.headerBg }}
                title={c.name}
              />
            ))}
          </div>
          <div className="flex items-center gap-1 font-bold text-black text-[10px]">
            <span className="text-black font-bold">Trang {pageNumber}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
`;

// Make sure to add `ExpandedStickyNote` outside `StickyNotesLayer`.
content += expandedComponentCode;

fs.writeFileSync('src/components/StickyNotesLayer.tsx', content);

console.log("Successfully refactored ExpandedStickyNote.");

