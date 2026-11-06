const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const startMarker = 'const applyZoom = useCallback((newScale: number, focalX: number, focalY: number) => {';
const endMarker = 'const handleRenderSettled = useCallback(() => {';

const startIndex = code.indexOf(startMarker);
const endIndex = code.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
    console.error("Markers not found");
    process.exit(1);
}

const replacement = `
  const zoomDebounceTimeout = useRef<any>(null);
  const visualScaleRef = useRef<number>(1.0);
  const transformOriginRef = useRef<{x: number, y: number}>({x: 0, y: 0});
  const isPinchingRef = useRef<boolean>(false);

  // Xử lý Pinch-to-Zoom mượt mà trên Trackpad bằng GPU Transform
  useEffect(() => {
    const container = mainContainerRef.current;
    if (!container) return;

    const commitZoom = (clientX: number, clientY: number) => {
      const wrapper = document.getElementById("pdf-transform-wrapper");
      if (!wrapper || !isPinchingRef.current) return;

      const currentReactScale = scaleRef.current || 1.0;
      const finalScale = Math.max(1.0, Math.min(6.0, currentReactScale * visualScaleRef.current));

      // Calculate the ratio of the focal point relative to the pre-rendered wrapper size
      const wRectBefore = wrapper.getBoundingClientRect();
      const ratioX = (clientX - wRectBefore.left) / currentReactScale;
      const ratioY = (clientY - wRectBefore.top) / currentReactScale;

      // Commit React State
      isPinchingRef.current = false;
      visualScaleRef.current = 1.0;
      setScale(finalScale);
      scaleRef.current = finalScale;
      
      // Reset CSS Transform immediately
      wrapper.style.transform = 'none';
      wrapper.style.transformOrigin = 'center center';
      wrapper.style.willChange = 'auto';

      // Adjust Scroll after DOM update
      const adjustScroll = () => {
        const wRectAfter = wrapper.getBoundingClientRect();
        const newScreenX = wRectAfter.left + (ratioX * finalScale);
        const newScreenY = wRectAfter.top + (ratioY * finalScale);
        
        container.scrollLeft += (newScreenX - clientX);
        container.scrollTop += (newScreenY - clientY);
      };

      // Firefox/Chrome need slight delay for React to finish rendering DOM dimensions
      setTimeout(adjustScroll, 0);
      setTimeout(adjustScroll, 10);
      setTimeout(adjustScroll, 50);
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault(); // Ngăn zoom toàn trang trình duyệt
        
        const wrapper = document.getElementById("pdf-transform-wrapper");
        if (!wrapper) return;

        if (!isPinchingRef.current) {
           isPinchingRef.current = true;
           const rect = wrapper.getBoundingClientRect();
           // Cố định origin ngay tại điểm trỏ chuột so với wrapper
           transformOriginRef.current = {
              x: e.clientX - rect.left,
              y: e.clientY - rect.top
           };
           wrapper.style.transformOrigin = \`\${transformOriginRef.current.x}px \${transformOriginRef.current.y}px\`;
           wrapper.style.willChange = 'transform';
        }

        const zoomDelta = -e.deltaY * 0.01;
        const factor = Math.exp(zoomDelta);

        const currentReactScale = scaleRef.current || 1.0;
        const potentialScale = currentReactScale * visualScaleRef.current * factor;
        
        // Clamp scale to [1.0, 6.0]
        if (potentialScale < 1.0) {
            visualScaleRef.current = 1.0 / currentReactScale;
        } else if (potentialScale > 6.0) {
            visualScaleRef.current = 6.0 / currentReactScale;
        } else {
            visualScaleRef.current *= factor;
        }

        // Apply hardware-accelerated CSS transform instantly (60fps)
        wrapper.style.transform = \`scale(\${visualScaleRef.current})\`;

        // Debounce before committing to React State (which causes heavy re-renders)
        if (zoomDebounceTimeout.current) clearTimeout(zoomDebounceTimeout.current);
        zoomDebounceTimeout.current = setTimeout(() => commitZoom(e.clientX, e.clientY), 150);
      }
    };

    const handleGesture = (e: Event) => {
      e.preventDefault();
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    container.addEventListener("gesturestart", handleGesture as any, { passive: false });
    container.addEventListener("gesturechange", handleGesture as any, { passive: false });
    container.addEventListener("gestureend", handleGesture as any, { passive: false });

    return () => {
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("gesturestart", handleGesture as any);
      container.removeEventListener("gesturechange", handleGesture as any);
      container.removeEventListener("gestureend", handleGesture as any);
      if (zoomDebounceTimeout.current) clearTimeout(zoomDebounceTimeout.current);
    };
  }, []);

  // Update Toolbar Zoom Input manually during pinch
  useEffect(() => {
    const updateInput = setInterval(() => {
      if (isPinchingRef.current) {
         const zoomInput = document.querySelector<HTMLInputElement>('input[title*="thu phóng"]');
         if (zoomInput && document.activeElement !== zoomInput) {
            const currentScale = scaleRef.current || 1.0;
            const currentVis = visualScaleRef.current || 1.0;
            zoomInput.value = \`\${Math.round(currentScale * currentVis * 100)}%\`;
         }
      }
    }, 50);
    return () => clearInterval(updateInput);
  }, []);

  `;

code = code.substring(0, startIndex) + replacement + code.substring(endIndex);

// Re-adjust `onZoomChange` to simple version again
const zoomChangeStart = code.indexOf('onZoomChange={(newScale, resetFitMode) => {');
const zoomChangeEnd = code.indexOf('onActiveToolChange={setActiveTool}');

if (zoomChangeStart !== -1 && zoomChangeEnd !== -1) {
  const newZoomChange = `onZoomChange={(newScale, resetFitMode) => {
          setScale(newScale);
          scaleRef.current = newScale;
        }}
        `;
  code = code.substring(0, zoomChangeStart) + newZoomChange + code.substring(zoomChangeEnd);
}

fs.writeFileSync('src/App.tsx', code);
