const fs = require('fs');
let code = fs.readFileSync('/app/applet/src/components/DrawingCanvas.tsx', 'utf8');

code = code.replace(
  /const canvasX =.*?\n\s*const canvasY =.*?\n/g,
  `const canvasX = (e.clientX - rect.left + (viewport ? viewport.scrollLeft : 0)) / scale;
    const canvasY = (e.clientY - rect.top + (viewport ? viewport.scrollTop : 0)) / scale;
    // @ts-ignore
    window._lastCanvasX = canvasX; // suppress unused var
    // @ts-ignore
    window._lastCanvasY = canvasY;
`
);

fs.writeFileSync('/app/applet/src/components/DrawingCanvas.tsx', code);
