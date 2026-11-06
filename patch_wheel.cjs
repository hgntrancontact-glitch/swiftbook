const fs = require('fs');
let code = fs.readFileSync('/app/applet/src/App.tsx', 'utf8');

const replacement = `
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const zoomSpeed = 0.01;
        const zoomDelta = -e.deltaY * zoomSpeed;
        
        // Lấy wrapper để áp dụng CSS transform
        const wrapper = document.getElementById('pdf-transform-wrapper');
        if (wrapper) {
           let currentScale = parseFloat(wrapper.getAttribute('data-scale') || '1');
           currentScale *= (1 + zoomDelta);
           currentScale = Math.max(0.1, Math.min(5.0, currentScale));
           wrapper.setAttribute('data-scale', currentScale.toString());
           wrapper.style.transform = \`scale(\${currentScale})\`;
           wrapper.style.transformOrigin = 'top center'; // Hoặc lấy theo chuột
        }
      }
      // KHÔNG có else, để trình duyệt tự cuộn tự nhiên (GPU scroll)
    };
`;

code = code.replace(/let scrollAccumX = 0;[\s\S]*?const handleWheel = \(e: WheelEvent\) => \{[\s\S]*?isTicking = true;\s*\}\s*\}\s*\};/, replacement.trim());

// We also need to add id="pdf-transform-wrapper" to the div wrapping the views.
code = code.replace(/<div style=\{\{ margin: "auto", maxWidth: "100%" \}\}>\s*<BookSpreadView/, '<div id="pdf-transform-wrapper" style={{ margin: "auto", maxWidth: "100%", willChange: "transform" }}>\n            <BookSpreadView');
code = code.replace(/<div style=\{\{ margin: "auto", maxWidth: "100%" \}\}>\s*<PDFPageView/, '<div id="pdf-transform-wrapper" style={{ margin: "auto", maxWidth: "100%", willChange: "transform" }}>\n              <PDFPageView');
code = code.replace(/<div style=\{\{ margin: "auto", maxWidth: "100%" \}\}>\s*<ContinuousView/, '<div id="pdf-transform-wrapper" style={{ margin: "auto", maxWidth: "100%", willChange: "transform" }}>\n            <ContinuousView');

fs.writeFileSync('/app/applet/src/App.tsx', code);
