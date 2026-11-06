const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const oldCommitZoomStart = code.indexOf('    const commitZoom = () => {');
const oldHandleWheelEnd = code.indexOf('      // Không ngăn cản e.ctrlKey = false (Lướt 2 ngón)') + '      // Không ngăn cản e.ctrlKey = false (Lướt 2 ngón)'.length;

const replacement = `    const commitZoom = () => {
      if (!isPinching.current) return;
      if (zoomDebounceTimeout.current) {
        clearTimeout(zoomDebounceTimeout.current);
        zoomDebounceTimeout.current = null;
      }
      
      const visualFactor = currentVisualScaleRef.current;
      const targetScale = Math.max(0.15, Math.min(6.0, scaleRef.current * visualFactor));
      
      // Let React's useLayoutEffect handle the CSS transform reset and scroll adjustment
      // synchronously AFTER it updates the canvas size.
      pendingCommitScaleRef.current = targetScale;
      anchorPointRef.current = { 
        clientX: clientXRef.current, 
        clientY: clientYRef.current 
      };
      
      setScale(targetScale);
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const wrapper = document.getElementById("pdf-transform-wrapper");
        if (!wrapper) return;

        if (!isPinching.current) {
          isPinching.current = true;
          const container = mainContainerRef.current;
          if (container) container.classList.add("is-zooming");
          currentVisualScaleRef.current = 1.0;
          
          const rect = wrapper.getBoundingClientRect();
          const originX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
          const originY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
          
          originXRef.current = originX;
          originYRef.current = originY;
          clientXRef.current = e.clientX;
          clientYRef.current = e.clientY;
          
          wrapper.style.transformOrigin = \`\${originX}px \${originY}px\`;
          wrapper.style.willChange = "transform";
        }
        
        clientXRef.current = e.clientX;
        clientYRef.current = e.clientY;

        const zoomDelta = -e.deltaY * 0.01;
        const zoomFactor = Math.exp(zoomDelta);
        currentVisualScaleRef.current *= zoomFactor;

        const minFactor = 0.15 / scaleRef.current;
        const maxFactor = 6.0 / scaleRef.current;
        currentVisualScaleRef.current = Math.max(minFactor, Math.min(maxFactor, currentVisualScaleRef.current));
        
        wrapper.style.transform = \`scale(\${currentVisualScaleRef.current})\`;

        if (zoomDebounceTimeout.current) clearTimeout(zoomDebounceTimeout.current);
        zoomDebounceTimeout.current = setTimeout(commitZoom, 500); // Wait 500ms before committing the new scale to avoid jitter when releasing fingers
      }
      // Không ngăn cản e.ctrlKey = false (Lướt 2 ngón)`;

code = code.substring(0, oldCommitZoomStart) + replacement + code.substring(oldHandleWheelEnd);
fs.writeFileSync('src/App.tsx', code);
