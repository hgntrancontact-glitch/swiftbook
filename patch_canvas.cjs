const fs = require('fs');
let code = fs.readFileSync('/app/applet/src/components/DrawingCanvas.tsx', 'utf8');

const replacement = `
  const getNormalizedPoint = (
    e: React.PointerEvent<HTMLCanvasElement>
  ): DrawingPoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    
    const viewport = canvas.closest('.pdf-viewport-container');
    if (!viewport) {
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      return { x, y };
    }

    // Lấy scale từ wrapper (do pinch-to-zoom set CSS transform)
    const wrapper = document.getElementById('pdf-transform-wrapper');
    const cssScale = wrapper ? parseFloat(wrapper.getAttribute('data-scale') || '1') : 1;
    
    // Fallback safely to rect if we prefer
    const rect = canvas.getBoundingClientRect();
    
    // Nếu dùng theo Matrix transform viewport:
    // canvasX = (e.clientX - viewportRect.left + viewport.scrollLeft) / scale;
    // Tuy nhiên canvas có the không bắt đầu từ top-left của viewport, nên dùng canvas rect là chuẩn nhất:
    // Vì rect.width đã chứa cssScale, nên ta có thể chia thẳng:
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    return { x, y };
  };
`;

code = code.replace(/const getNormalizedPoint = \([\s\S]*?return \{ x, y \};\s*\};/, replacement.trim());

fs.writeFileSync('/app/applet/src/components/DrawingCanvas.tsx', code);
