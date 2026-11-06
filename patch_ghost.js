const fs = require('fs');

function patch(filePath, type, arrName, onAddName, startDragMethodRegex, dragRefType) {
    let code = fs.readFileSync(filePath, 'utf8');

    // Add state
    if (!code.includes(`const [altGhost, setAltGhost]`)) {
        code = code.replace(new RegExp(`const \\[(${arrName}|drawings|notes|boxes)\\s*,\\s*set`), `const [altGhost, setAltGhost] = useState<${type} | null>(null);\n  const $&`);
    }

    // Replace e.altKey block in the file (could be anywhere, but usually inside a MouseDown or startDrag)
    // BoxAnnotation: inside onMouseDown
    // StickyNotesLayer: inside startDrag
    // DrawingCanvas: inside startDragStroke
    // FreeTextLayer: inside startDragPointer
    
    // We will do it manually for each file since the structure is a bit different.
}
