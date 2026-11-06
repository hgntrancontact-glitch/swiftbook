const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const effectCode = `  // Xử lý Pinch-to-Zoom mượt mà trên Trackpad bằng GPU Transform thuần (0s delay, 0 frame jump, 0 visual correction khi thả tay)
  useEffect(() => {
    const container = mainContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      const wrapper = document.getElementById("pdf-transform-wrapper");
      if (!wrapper) return;

      if (e.ctrlKey) {
        e.preventDefault(); // Ngăn zoom toàn trang trình duyệt

        const cRect = container.getBoundingClientRect();
        const centerX = cRect.width / 2;
        const centerY = cRect.height / 2;

        const mx = e.clientX - cRect.left - centerX;
        const my = e.clientY - cRect.top - centerY;

        const base = scaleRef.current || 1.0;
        const current = transformStateRef.current;

        const zoomDelta = -e.deltaY * 0.01;
        const factor = Math.exp(zoomDelta);

        const MIN_ZOOM = 1.0;
        const MAX_ZOOM = 6.0;

        const currentAbsScale = base * current.scale;
        const rawNewAbsScale = currentAbsScale * factor;
        const newAbsScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, rawNewAbsScale));

        const effectiveFactor = newAbsScale / currentAbsScale;
        let newX = mx - (mx - current.x) * effectiveFactor;
        let newY = my - (my - current.y) * effectiveFactor;

        // Khi zoom out về gần 1.0 (Fit to Page / Min Zoom), làm mượt chuyển động đưa trang về tâm
        if (newAbsScale <= 1.2) {
          const dampRatio = Math.max(0, (newAbsScale - MIN_ZOOM) / 0.2);
          newX = newX * dampRatio;
          newY = newY * dampRatio;
        }

        const newCSSScale = newAbsScale / base;

        transformStateRef.current = { scale: newCSSScale, x: newX, y: newY };

        wrapper.style.transformOrigin = "center center";
        wrapper.style.transform = \`translate3d(\${newX}px, \${newY}px, 0) scale(\${newCSSScale})\`;
        wrapper.style.willChange = "transform";

        // Cập nhật giá trị hiển thị trên thanh công cụ mượt mà không re-render cây DOM
        const zoomInput = document.querySelector<HTMLInputElement>('input[title*="thu phóng"]');
        if (zoomInput && document.activeElement !== zoomInput) {
          zoomInput.value = \`\${Math.round(newAbsScale * 100)}%\`;
        }

        // Settle (debounce 180ms): Sau khi người dùng ngừng lướt trackpad, cập nhật setScale thật để PDFPageView re-render canvas ở độ phân giải sắc nét
        if (zoomDebounceTimeout.current) clearTimeout(zoomDebounceTimeout.current);
        zoomDebounceTimeout.current = setTimeout(() => {
          const finalScale = Math.max(1.0, Math.min(6.0, (scaleRef.current || 1.0) * transformStateRef.current.scale));
          setScale(finalScale);
          scaleRef.current = finalScale;
          // Giữ nguyên transform CSS hiện tại (translate3d(x,y,0) scale(s)) cho đến khi onRenderSettled được gọi từ trang active
        }, 180);
      } else {
        // Hỗ trợ lướt 2 ngón (Pan) mượt mà 120fps khi đang phóng to qua GPU
        const current = transformStateRef.current;
        if (current.scale > 1.0) {
          e.preventDefault();
          const cRect = container.getBoundingClientRect();
          const wRect = wrapper.getBoundingClientRect();

          current.x -= e.deltaX;
          current.y -= e.deltaY;

          // Giới hạn phạm vi lướt pan trong khung nhìn
          const maxPanX = Math.max(0, (wRect.width - cRect.width) / 2 + 100);
          const maxPanY = Math.max(0, (wRect.height - cRect.height) / 2 + 100);

          current.x = Math.max(-maxPanX, Math.min(maxPanX, current.x));
          current.y = Math.max(-maxPanY, Math.min(maxPanY, current.y));

          wrapper.style.transformOrigin = "center center";
          wrapper.style.transform = \`translate3d(\${current.x}px, \${current.y}px, 0) scale(\${current.scale})\`;
        }
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
    };
  }, []);`;

code = code.replace(/  const originXRef = useRef<number>\(0\);[\s\S]*?\}, \[\]\);\n/, effectCode + "\n");
fs.writeFileSync('src/App.tsx', code);
