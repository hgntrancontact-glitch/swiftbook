const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const oldCommitZoomStart = code.indexOf('    const commitZoom = () => {');
const oldCommitZoomEnd = code.indexOf('    const handleWheel = (e: WheelEvent) => {');
const oldHandleWheelEnd = code.indexOf('      // Không ngăn cản e.ctrlKey = false (Lướt 2 ngón)') + '      // Không ngăn cản e.ctrlKey = false (Lướt 2 ngón)'.length;

const replacement = `
    const commitZoom = () => {
      if (!isPinching.current) return;
      if (zoomDebounceTimeout.current) {
        clearTimeout(zoomDebounceTimeout.current);
        zoomDebounceTimeout.current = null;
      }
      
      const visualFactor = currentVisualScaleRef.current;
      const targetScale = Math.max(0.15, Math.min(6.0, scaleRef.current * visualFactor));
      
      const pointX = originXRef.current;
      const pointY = originYRef.current;
      const newPointX = pointX * visualFactor;
      const newPointY = pointY * visualFactor;
      const targetClientX = clientXRef.current;
      const targetClientY = clientYRef.current;
      
      container.classList.remove("is-zooming");
      isPinching.current = false;
      currentVisualScaleRef.current = 1.0;
      
      setScale(targetScale);
      
      const applyScrollAndResetTransform = () => {
        const w = document.getElementById("pdf-transform-wrapper");
        if (w) {
          // Reset CSS transform AFTER React updates the DOM width/height of the canvas
          w.style.transform = "none";
          w.style.transformOrigin = "center center";
          
          const newWRect = w.getBoundingClientRect();
          const currentScreenX = newWRect.left + newPointX;
          const currentScreenY = newWRect.top + newPointY;
          
          container.scrollLeft += (currentScreenX - targetClientX);
          container.scrollTop += (currentScreenY - targetClientY);
        }
      };
      
      // Delay CSS reset and scroll adjustment until after React paints the updated width/height
      requestAnimationFrame(() => requestAnimationFrame(applyScrollAndResetTransform));
      setTimeout(applyScrollAndResetTransform, 0);
      setTimeout(applyScrollAndResetTransform, 20);
      setTimeout(applyScrollAndResetTransform, 50);
      setTimeout(applyScrollAndResetTransform, 100);
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
        zoomDebounceTimeout.current = setTimeout(commitZoom, 500); // 500ms hold on CSS transform
      }
      // Không ngăn cản e.ctrlKey = false (Lướt 2 ngón)`;

code = code.substring(0, oldCommitZoomStart) + replacement + code.substring(oldHandleWheelEnd);
fs.writeFileSync('src/App.tsx', code);
