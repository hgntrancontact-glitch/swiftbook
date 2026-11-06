const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Replace everything from `const zoomDebounceTimeout` to `return () => clearInterval(updateInput);`
const startMarker = 'const zoomDebounceTimeout = useRef<any>(null);';
const endMarker = 'return () => clearInterval(updateInput);\n  }, []);';

const startIndex = code.indexOf(startMarker);
const endIndex = code.indexOf(endMarker);

if (startIndex !== -1 && endIndex !== -1) {
    const replacement = `
  const zoomTargetRef = useRef<{
    focalX: number;
    focalY: number;
    ratioX: number;
    ratioY: number;
    targetScale: number;
  } | null>(null);

  const applyZoomAnchor = useCallback((newScale: number, focalX: number, focalY: number) => {
    const wrapper = document.getElementById("pdf-transform-wrapper");
    if (!wrapper) return;
    
    const currentScale = scaleRef.current || 1.0;
    const wRect = wrapper.getBoundingClientRect();
    
    // Lưu lại điểm neo trước khi đổi scale
    zoomTargetRef.current = {
      focalX,
      focalY,
      ratioX: (focalX - wRect.left) / currentScale,
      ratioY: (focalY - wRect.top) / currentScale,
      targetScale: newScale
    };
    
    setScale(newScale);
    scaleRef.current = newScale;
  }, []);

  useLayoutEffect(() => {
    if (zoomTargetRef.current && zoomTargetRef.current.targetScale === scale) {
      const { focalX, focalY, ratioX, ratioY } = zoomTargetRef.current;
      const wrapper = document.getElementById("pdf-transform-wrapper");
      const container = mainContainerRef.current;
      if (wrapper && container) {
        const wRect = wrapper.getBoundingClientRect();
        const expectedScreenX = wRect.left + (ratioX * scale);
        const expectedScreenY = wRect.top + (ratioY * scale);
        
        container.scrollLeft += (expectedScreenX - focalX);
        container.scrollTop += (expectedScreenY - focalY);
      }
      zoomTargetRef.current = null;
    }
  }, [scale]);

  // Trackpad Pinch-to-Zoom
  useEffect(() => {
    const container = mainContainerRef.current;
    if (!container) return;
    
    let ticking = false;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        
        if (!ticking) {
          requestAnimationFrame(() => {
            const zoomDelta = -e.deltaY * 0.01;
            const factor = Math.exp(zoomDelta);
            const currentScale = scaleRef.current || 1.0;
            const newScale = Math.max(1.0, Math.min(6.0, currentScale * factor));
            
            if (newScale !== currentScale) {
              applyZoomAnchor(newScale, e.clientX, e.clientY);
            }
            ticking = false;
          });
          ticking = true;
        }
      }
    };

    const handleGesture = (e: Event) => e.preventDefault();

    container.addEventListener("wheel", handleWheel, { passive: false });
    container.addEventListener("gesturestart", handleGesture as any, { passive: false });
    container.addEventListener("gesturechange", handleGesture as any, { passive: false });
    container.addEventListener("gestureend", handleGesture as any, { passive: false });

    return () => {
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("gesturestart", handleGesture as any);
      container.removeEventListener("gesturechange", handleGesture as any);
      container.removeEventListener("gestureend", handleGesture as any);
    };
  }, [applyZoomAnchor]);
`;

    code = code.substring(0, startIndex) + replacement + code.substring(endIndex + endMarker.length);
}

fs.writeFileSync('src/App.tsx', code);
