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
      
      const targetScale = Math.max(0.15, Math.min(6.0, scaleRef.current * currentVisualScaleRef.current));
      
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
          const originX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
          const originY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
          wrapper.style.transformOrigin = \`\${originX}px \${originY}px\`;
          wrapper.style.willChange = "transform";
        }

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

// Remove the previous visualViewport effect
code = code.replace(/  \/\/ Giai đoạn 2: Lắng nghe Native Viewport Pinch-to-Zoom[\s\S]*?\}, \[\]\);\n\n/m, effectCode + "\n\n");

fs.writeFileSync('src/App.tsx', code);
