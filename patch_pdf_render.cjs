const fs = require('fs');
let code = fs.readFileSync('src/components/PDFPageView.tsx', 'utf8');

// Update the useEffect that triggers renderPage
// We will replace the bottom part of it
code = code.replace(
  /    if \(\!hasRenderedOnceRef\.current\) {[\s\S]*?\}, \[pdfDoc, pageNumber, scale, renderCount, visualViewportScale\]\);/,
`    if (!hasRenderedOnceRef.current) {
      // First initial load: render immediately (0ms wait)
      const requestIdle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));
      requestIdle(() => renderPage());
    } else {
      // If the scale is already identical to last rendered scale, no need to re-render
      const scaleDiff = Math.abs(scale - lastRenderedScaleRef.current) / lastRenderedScaleRef.current;
      
      // Tránh re-render nếu tỉ lệ thay đổi < 15%
      if (scaleDiff < 0.15 && lastRenderedScaleRef.current !== 0) {
        return;
      }

      // Re-rendering on scale change: debounce High-DPI rendering by 500ms
      // Sử dụng requestIdleCallback để không block UI thread
      debounceTimer = setTimeout(() => {
        const requestIdle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));
        requestIdle(() => {
          if (!isCancelled) {
            renderPage();
          }
        });
      }, 500);
    }

    return () => {
      isCancelled = true;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
        renderTaskRef.current = null;
      }
    };
  }, [pdfDoc, pageNumber, scale, renderCount, visualViewportScale]);`
);

fs.writeFileSync('src/components/PDFPageView.tsx', code);
