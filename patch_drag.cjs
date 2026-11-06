const fs = require('fs');

function patchComponent(file, compName, arrName, stateType, idPrefix) {
    let content = fs.readFileSync(file, 'utf8');

    // 1. Add altGhost state
    const useStateregex = new RegExp(`const \\[(${arrName}|drawings|notes|boxes)\\s*,\\s*set`);
    if (!content.includes('const [altGhost, setAltGhost]')) {
        content = content.replace(useStateregex, `const [altGhost, setAltGhost] = useState<${stateType} | null>(null);\n  const $&`);
    }

    // 2. Patch Alt logic in startDrag (can be startDrag, startDragBox, startDragStroke)
    // We will look for "if (e.altKey) {"
    // It currently creates dupId, duplicatedX, calls onAdd(duplicated), onSelect, setSelected, setDragging.
    // We will replace the body of if (e.altKey) { ... } with our ghost logic.
    const altRegex = /if\s*\(e\.altKey\)\s*\{[\s\S]*?(?=hasMovedRef|if\s*\(onSelect\)|dragStartRef|dragRef)/;
    
    content = content.replace(altRegex, (match) => {
       if (match.includes('setAltGhost')) return match; // already patched
       
       let xUpdate = 'x: Math.min(85, itemToDup.x + 2)';
       let yUpdate = 'y: Math.min(85, itemToDup.y + 2)';
       if (stateType === 'DrawingStroke') {
          return `if (e.altKey) {
      e.preventDefault();
      const dupId = \`${idPrefix}_\${Date.now()}_\${Math.random().toString(36).substr(2, 6)}\`;
      const duplicated = {
        ...stroke,
        id: dupId,
        createdAt: Date.now(),
      };
      setAltGhost(duplicated);
      hasMovedRef.current = true;
      dragStartRef.current = { startClientX: e.clientX, startClientY: e.clientY, startPoints: JSON.parse(JSON.stringify(stroke.points)) };
      setDraggingStrokeId(dupId);
      document.body.style.cursor = 'copy';
      return;
    }\n    `;
       } else if (stateType === 'BoxAnnotation') {
          return `if (e.altKey) {
      e.preventDefault();
      const dupId = \`${idPrefix}_\${Date.now()}_\${Math.random().toString(36).substr(2, 6)}\`;
      const duplicated = {
        ...box,
        id: dupId,
        createdAt: Date.now(),
      };
      setAltGhost(duplicated);
      hasMovedRef.current = true;
      dragStartRef.current = { startClientX: e.clientX, startClientY: e.clientY, startX: box.x, startY: box.y };
      setDraggingBoxId(dupId);
      document.body.style.cursor = 'copy';
      return;
    }\n    `;
       } else if (stateType === 'TextNoteAnnotation') {
          return `if (e.altKey) {
      e.preventDefault();
      const dupId = \`${idPrefix}_\${Date.now()}_\${Math.random().toString(36).substr(2, 6)}\`;
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
    }\n    `;
       }
       return match;
    });

    fs.writeFileSync(file, content);
}

patchComponent('src/components/DrawingCanvas.tsx', 'DrawingCanvas', 'drawings', 'DrawingStroke', 'stroke');
patchComponent('src/components/BoxAnnotationsLayer.tsx', 'BoxAnnotationsLayer', 'boxes', 'BoxAnnotation', 'box');
patchComponent('src/components/StickyNotesLayer.tsx', 'StickyNotesLayer', 'notes', 'TextNoteAnnotation', 'note');

