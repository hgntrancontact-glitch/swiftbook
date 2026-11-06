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
      
      // Calculate scroll adjustment before resetting transform
      let newScrollLeft = container.scrollLeft;
      let newScrollTop = container.scrollTop;
      
      if (anchorPointRef.current && visualFactor !== 1.0) {
        const cRect = container.getBoundingClientRect();
        const anchorX = anchorPointRef.current.clientX - cRect.left;
        const anchorY = anchorPointRef.current.clientY - cRect.top;
        
        const contentX = container.scrollLeft + anchorX;
        const contentY = container.scrollTop + anchorY;
        
        newScrollLeft = contentX * visualFactor - anchorX;
        newScrollTop = contentY * visualFactor - anchorY;
      }
      
      const wrapper = document.getElementById("pdf-transform-wrapper");
      if (wrapper) {
        wrapper.style.transform = "none";
        wrapper.style.transformOrigin = "center center";
      }
      
      container.classList.remove("is-zooming");
      isPinching.current = false;
      currentVisualScaleRef.current = 1.0;
      
      setScale(targetScale);
      
      // Apply new scroll immediately and again after React renders to ensure it sticks
      container.scrollLeft = newScrollLeft;
      container.scrollTop = newScrollTop;
      
      setTimeout(() => {
        container.scrollLeft = newScrollLeft;
        container.scrollTop = newScrollTop;
      }, 0);
      setTimeout(() => {
        container.scrollLeft = newScrollLeft;
        container.scrollTop = newScrollTop;
      }, 50);
    };

    const handleWheel = (e: WheelEvent) => {
      // Chỉ can thiệp khi là Pinch-to-zoom (ctrlKey)
      if (e.ctrlKey) {
        e.preventDefault(); // Ngăn zoom toàn trang, giữ nguyên Header

        const wrapper = document.getElementById("pdf-transform-wrapper");
        if (!wrapper) return;

        if (!isPinching.current) {
          isPinching.current = true;
          container.classList.add("is-zooming");
          currentVisualScaleRef.current = 1.0;
          
          const rect = wrapper.getBoundingClientRect();
          // Keep the anchor based on the wrapper so CSS transform scales from here
          const originX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
          const originY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
          wrapper.style.transformOrigin = \`\${originX}px \${originY}px\`;
          wrapper.style.willChange = "transform";
        }
        
        // Save anchor point for scroll adjustment later
        anchorPointRef.current = { clientX: e.clientX, clientY: e.clientY };

        const zoomDelta = -e.deltaY * 0.01;
        const zoomFactor = Math.exp(zoomDelta);
        currentVisualScaleRef.current *= zoomFactor;

        // Giới hạn scale ngay tại CSS GPU
        const minFactor = 0.15 / scaleRef.current;
        const maxFactor = 6.0 / scaleRef.current;
        currentVisualScaleRef.current = Math.max(minFactor, Math.min(maxFactor, currentVisualScaleRef.current));

        wrapper.style.transform = \`scale(\${currentVisualScaleRef.current})\`;

        // Debounce để làm nét ảnh (Giai đoạn 2)
        if (zoomDebounceTimeout.current) clearTimeout(zoomDebounceTimeout.current);
        zoomDebounceTimeout.current = setTimeout(commitZoom, 300);
      }
      // Không ngăn cản e.ctrlKey = false (Lướt 2 ngón), để trình duyệt tự scroll cực mượt (Giai đoạn 1)
    };

    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      container.removeEventListener("wheel", handleWheel);
      if (zoomDebounceTimeout.current) clearTimeout(zoomDebounceTimeout.current);
    };
  }, []);
`;

code = code.replace(/  \/\/ Xử lý Pinch-to-Zoom mượt mà trên Trackpad[\s\S]*?\}, \[\]\);\n/, effectCode + "\n");

fs.writeFileSync('src/App.tsx', code);
