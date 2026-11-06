const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const zoomChangeStart = code.indexOf('onZoomChange={(newScale, resetFitMode) => {');
const zoomChangeEnd = code.indexOf('onActiveToolChange={setActiveTool}');

if (zoomChangeStart !== -1 && zoomChangeEnd !== -1) {
  const newZoomChange = `onZoomChange={(newScale, resetFitMode) => {
          const container = mainContainerRef.current;
          const wrapper = document.getElementById("pdf-transform-wrapper");
          
          if (!container || !wrapper) {
             setScale(newScale);
             scaleRef.current = newScale;
             return;
          }

          const currentScale = scaleRef.current || 1.0;
          const cRect = container.getBoundingClientRect();
          const wRectBefore = wrapper.getBoundingClientRect();
          
          // Lấy tâm màn hình làm focal point
          const focalX = cRect.left + cRect.width / 2;
          const focalY = cRect.top + cRect.height / 2;

          const ratioX = (focalX - wRectBefore.left) / currentScale;
          const ratioY = (focalY - wRectBefore.top) / currentScale;

          setScale(newScale);
          scaleRef.current = newScale;

          const adjustScroll = () => {
             const wRectAfter = wrapper.getBoundingClientRect();
             const newScreenX = wRectAfter.left + (ratioX * newScale);
             const newScreenY = wRectAfter.top + (ratioY * newScale);
             
             container.scrollLeft += (newScreenX - focalX);
             container.scrollTop += (newScreenY - focalY);
          };

          setTimeout(adjustScroll, 0);
          setTimeout(adjustScroll, 10);
          setTimeout(adjustScroll, 50);
        }}
        `;
  code = code.substring(0, zoomChangeStart) + newZoomChange + code.substring(zoomChangeEnd);
  fs.writeFileSync('src/App.tsx', code);
}
