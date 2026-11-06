const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Replace everything from `const transformStateRef` down to the end of the `useEffect` handling `wheel`.
// First, find the start and end indices.
const startMarker = 'const transformStateRef = useRef<{ scale: number; x: number; y: number }>({';
const endMarker = 'const [basePageDimensions, setBasePageDimensions]';

const startIndex = code.indexOf(startMarker);
const endIndex = code.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
    console.error("Markers not found");
    process.exit(1);
}

const replacement = `
  const zoomDebounceTimeout = useRef<any>(null);

  // Xử lý Zoom mượt mà và giữ đúng tâm (Focal Point)
  const applyZoom = useCallback((newScale: number, focalX: number, focalY: number) => {
    const container = mainContainerRef.current;
    const wrapper = document.getElementById("pdf-transform-wrapper");
    if (!container || !wrapper) return;

    // Lấy tọa độ của điểm focus so với wrapper (trước khi zoom)
    const wRectBefore = wrapper.getBoundingClientRect();
    const ratioX = (focalX - wRectBefore.left) / scaleRef.current;
    const ratioY = (focalY - wRectBefore.top) / scaleRef.current;

    // Cập nhật scale
    setScale(newScale);
    scaleRef.current = newScale;

    // Tính toán bù trừ cuộn sau khi React render xong kích thước mới
    // Do PDFPageView có độ trễ render canvas, nhưng style.width của wrapper thay đổi ngay lập tức
    const adjustScroll = () => {
      const wRectAfter = wrapper.getBoundingClientRect();
      const newScreenX = wRectAfter.left + (ratioX * newScale);
      const newScreenY = wRectAfter.top + (ratioY * newScale);
      
      container.scrollLeft += (newScreenX - focalX);
      container.scrollTop += (newScreenY - focalY);
    };

    // Điều chỉnh scroll qua nhiều frame để đảm bảo chính xác khi DOM thay đổi
    requestAnimationFrame(() => {
      adjustScroll();
      setTimeout(adjustScroll, 10);
      setTimeout(adjustScroll, 50);
      setTimeout(adjustScroll, 150); // Bắt trường hợp onRenderSettled
    });
  }, []);

  // Xử lý Pinch-to-Zoom mượt mà trên Trackpad
  useEffect(() => {
    const container = mainContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault(); // Ngăn zoom toàn trang trình duyệt

        const zoomDelta = -e.deltaY * 0.01;
        const factor = Math.exp(zoomDelta);

        const currentScale = scaleRef.current || 1.0;
        const rawNewScale = currentScale * factor;
        const newScale = Math.max(1.0, Math.min(6.0, rawNewScale));

        if (newScale !== currentScale) {
          applyZoom(newScale, e.clientX, e.clientY);
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
  }, [applyZoom]);

  const handleRenderSettled = useCallback(() => {
    // Không cần làm gì vì CSS transform đã bị loại bỏ, mọi thứ dùng Native DOM Resizing
  }, []);

  `;

code = code.substring(0, startIndex) + replacement + code.substring(endIndex);

// Now update `onZoomChange` to use `applyZoom` instead of `transformStateRef`
const zoomChangeStart = code.indexOf('onZoomChange={(newScale, resetFitMode) => {');
const zoomChangeEnd = code.indexOf('onActiveToolChange={setActiveTool}');

if (zoomChangeStart !== -1 && zoomChangeEnd !== -1) {
  const newZoomChange = `onZoomChange={(newScale, resetFitMode) => {
          const container = mainContainerRef.current;
          if (container) {
            const cRect = container.getBoundingClientRect();
            // Lấy tâm màn hình làm điểm focus
            const focalX = cRect.left + cRect.width / 2;
            const focalY = cRect.top + cRect.height / 2;
            applyZoom(newScale, focalX, focalY);
          }
        }}
        `;
  code = code.substring(0, zoomChangeStart) + newZoomChange + code.substring(zoomChangeEnd);
}

fs.writeFileSync('src/App.tsx', code);
