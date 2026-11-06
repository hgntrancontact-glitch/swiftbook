const fs = require('fs');

// 1. FreeTextLayer
let code = fs.readFileSync('src/components/FreeTextLayer.tsx', 'utf8');
code = code.replace(`ring-1 ring-[#f5c41a] rounded-[2px]'`, `'`);
if (!code.includes('altGhostRef')) {
    code = code.replace('const [altGhost, setAltGhost] = useState<FreeTextAnnotation | null>(null);', 
    'const [altGhost, setAltGhost] = useState<FreeTextAnnotation | null>(null);\n  const altGhostRef = useRef<FreeTextAnnotation | null>(null);\n  useEffect(() => { altGhostRef.current = altGhost; }, [altGhost]);');
}
code = code.replace(/if \(isAltGhost && altGhost\) \{[\s\S]*?dragRef\.current = null;\n\s*return;\n\s*\}/, `if (isAltGhost && altGhostRef.current) {
        onAddText(altGhostRef.current);
        setAltGhost(null);
        setActiveTextId(id);
        if (onSelect) onSelect(id, false);
        dragRef.current = null;
        return;
      }`);
fs.writeFileSync('src/components/FreeTextLayer.tsx', code);


// 2. BoxAnnotationsLayer
code = fs.readFileSync('src/components/BoxAnnotationsLayer.tsx', 'utf8');
if (!code.includes('altGhostRef')) {
    code = code.replace('const [altGhost, setAltGhost] = useState<BoxAnnotation | null>(null);', 
    'const [altGhost, setAltGhost] = useState<BoxAnnotation | null>(null);\n  const altGhostRef = useRef<BoxAnnotation | null>(null);\n  useEffect(() => { altGhostRef.current = altGhost; }, [altGhost]);');
}
code = code.replace(/if \(altGhost && altGhost\.id === draggingBoxId\) \{[\s\S]*?dragStartRef\.current = null;\n\s*\}/, `if (altGhostRef.current && altGhostRef.current.id === draggingBoxId) {
          onAddBox(altGhostRef.current);
          const addedId = altGhostRef.current.id;
          const targetPage = altGhostRef.current.pageNumber || pageNumber;
          setAltGhost(null);
          if (onSelect) onSelect(addedId, false);
          resetPageZIndex(targetPage);
          setDraggingBoxId(null);
          dragStartRef.current = null;
        }`);
fs.writeFileSync('src/components/BoxAnnotationsLayer.tsx', code);


// 3. DrawingCanvas
code = fs.readFileSync('src/components/DrawingCanvas.tsx', 'utf8');
if (!code.includes('altGhostRef')) {
    code = code.replace('const [altGhost, setAltGhost] = useState<DrawingStroke | null>(null);', 
    'const [altGhost, setAltGhost] = useState<DrawingStroke | null>(null);\n  const altGhostRef = useRef<DrawingStroke | null>(null);\n  useEffect(() => { altGhostRef.current = altGhost; }, [altGhost]);');
}
code = code.replace(/if \(altGhost && altGhost\.id === draggingStrokeId\) \{[\s\S]*?dragStartRef\.current = null;\n\s*\}/, `if (altGhostRef.current && altGhostRef.current.id === draggingStrokeId) {
           onAddStroke(altGhostRef.current);
           const addedId = altGhostRef.current.id;
           const targetPage = altGhostRef.current.pageNumber || pageNumber;
           setAltGhost(null);
           if (onSelect) onSelect(addedId, false);
           resetPageZIndex(targetPage);
           setDraggingStrokeId(null);
           dragStartRef.current = null;
        }`);
fs.writeFileSync('src/components/DrawingCanvas.tsx', code);


// 4. StickyNotesLayer
code = fs.readFileSync('src/components/StickyNotesLayer.tsx', 'utf8');
if (!code.includes('altGhostRef')) {
    code = code.replace('const [altGhost, setAltGhost] = useState<TextNoteAnnotation | null>(null);', 
    'const [altGhost, setAltGhost] = useState<TextNoteAnnotation | null>(null);\n  const altGhostRef = useRef<TextNoteAnnotation | null>(null);\n  useEffect(() => { altGhostRef.current = altGhost; }, [altGhost]);');
}
code = code.replace(/if \(altGhost && altGhost\.id === draggingNoteId\) \{[\s\S]*?dragStartRef\.current = null;\n\s*\}/, `if (altGhostRef.current && altGhostRef.current.id === draggingNoteId) {
           onAddNote(altGhostRef.current);
           const addedId = altGhostRef.current.id;
           const targetPage = altGhostRef.current.pageNumber || pageNumber;
           setAltGhost(null);
           if (onSelect) onSelect(addedId, false);
           resetPageZIndex(targetPage);
           setDraggingNoteId(null);
           dragStartRef.current = null;
        }`);
fs.writeFileSync('src/components/StickyNotesLayer.tsx', code);

console.log("Patched successfully");
