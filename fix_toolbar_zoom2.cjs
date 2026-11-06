const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const zoomChangeStart = code.indexOf('onZoomChange={(newScale, resetFitMode) => {');
const zoomChangeEnd = code.indexOf('onActiveToolChange={setActiveTool}');

if (zoomChangeStart !== -1 && zoomChangeEnd !== -1) {
  const newZoomChange = `onZoomChange={(newScale, resetFitMode) => {
          const container = mainContainerRef.current;
          if (!container) {
             setScale(newScale);
             scaleRef.current = newScale;
             return;
          }
          const cRect = container.getBoundingClientRect();
          const focalX = cRect.left + cRect.width / 2;
          const focalY = cRect.top + cRect.height / 2;
          applyZoomAnchor(newScale, focalX, focalY);
        }}
        `;
  code = code.substring(0, zoomChangeStart) + newZoomChange + code.substring(zoomChangeEnd);
  fs.writeFileSync('src/App.tsx', code);
}
