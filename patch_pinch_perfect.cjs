const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const effectCode = `
  const originXRef = useRef<number>(0);
  const originYRef = useRef<number>(0);
  const clientXRef = useRef<number>(0);
  const clientYRef = useRef<number>(0);

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
      
      const pointX = originXRef.current;
      const pointY = originYRef.current;
      const newPointX = pointX * visualFactor;
      const newPointY = pointY * visualFactor;
      const targetClientX = clientXRef.current;
      const targetClientY = clientYRef.current;
      
      const wrapper = document.getElementById("pdf-transform-wrapper");
      if (wrapper) {
        wrapper.style.transform = "none";
        wrapper.style.transformOrigin = "center center";
      }
      
      container.classList.remove("is-zooming");
      isPinching.current = false;
      currentVisualScaleRef.current = 1.0;
      
      setScale(targetScale);
      
      const adjustScroll = () => {
        const w = document.getElementById("pdf-transform-wrapper");
        if (w) {
          const newWRect = w.getBoundingClientRect();
          const currentScreenX = newWRect.left + newPointX;
          const currentScreenY = newWRect.top + newPointY;
          
          container.scrollLeft += (currentScreenX - targetClientX);
          container.scrollTop += (currentScreenY - targetClientY);
        }
      };

      // Adjust scroll after React renders the new wrapper size
      setTimeout(adjustScroll, 0);
      setTimeout(adjustScroll, 20);
      setTimeout(adjustScroll, 50);
      setTimeout(adjustScroll, 100);
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
          
          originXRef.current = originX;
          originYRef.current = originY;
          clientXRef.current = e.clientX;
          clientYRef.current = e.clientY;
          
          wrapper.style.transformOrigin = \`\${originX}px \${originY}px\`;
          wrapper.style.willChange = "transform";
        }
        
        // Update clientX/Y to track finger movement during pinch
        clientXRef.current = e.clientX;
        clientYRef.current = e.clientY;

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
