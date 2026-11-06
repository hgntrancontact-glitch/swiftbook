const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const effectCode = `
  // Xử lý Pinch-to-Zoom mượt mà trên Trackpad
  useEffect(() => {
    const container = mainContainerRef.current;
    if (!container) return;

    const commitZoom = () => {
      if (!isPinching.current) return;
      if (zoomDebounceTimeout.current) {
        clearTimeout(zoomDebounceTimeout.current);
        zoomDebounceTimeout.current = null;
      }
      
      const visualFactor = currentVisualScaleRef.current;
      const targetScale = Math.max(0.15, Math.min(6.0, scaleRef.current * visualFactor));
      
      const wrapper = document.getElementById("pdf-transform-wrapper");
      if (wrapper) {
        wrapper.style.transform = "none";
        wrapper.style.transformOrigin = "center center";
      }
      
      container.classList.remove("is-zooming");
      isPinching.current = false;
      currentVisualScaleRef.current = 1.0;
      
      setScale(targetScale);
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();

        const wrapper = document.getElementById("pdf-transform-wrapper");
        if (!wrapper) return;

        if (!isPinching.current) {
          isPinching.current = true;
          container.classList.add("is-zooming");
          currentVisualScaleRef.current = 1.0;
        }

        const zoomDelta = -e.deltaY * 0.01;
        const zoomFactor = Math.exp(zoomDelta);
        let newVisualScale = currentVisualScaleRef.current * zoomFactor;

        const minFactor = 0.15 / scaleRef.current;
        const maxFactor = 6.0 / scaleRef.current;
        newVisualScale = Math.max(minFactor, Math.min(maxFactor, newVisualScale));
        
        currentVisualScaleRef.current = newVisualScale;

        // Apply scale directly via setScale instead of CSS transform to let React and the browser handle scroll and layout naturally!
        // Wait, if we use setScale in wheel, it re-renders. Is it fast enough? Let's throttle it.
      }
    };
`;
