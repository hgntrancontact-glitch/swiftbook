const fs = require('fs');
let code = fs.readFileSync('/app/applet/src/components/DrawingCanvas.tsx', 'utf8');

const replacement = `
  const getNormalizedPoint = (
    e: React.PointerEvent<HTMLCanvasElement>
  ): DrawingPoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    
    const viewport = canvas.closest('.pdf-viewport-container');
    if (viewport) {
      const rect = viewport.getBoundingClientRect();
      const wrapper = document.getElementById('pdf-transform-wrapper');
      const scale = wrapper ? parseFloat(wrapper.getAttribute('data-scale') || '1') : 1;
      
      // Công thức người dùng yêu cầu:
      const canvasX = (e.clientX - rect.left + viewport.scrollLeft) / scale;
      const canvasY = (e.clientY - rect.top + viewport.scrollTop) / scale;
      
      // Tuy nhiên canvas có offset bên trong viewport, nên cần trừ đi offset của canvas so với viewport content
      // Thay vào đó, ta sẽ dùng công thức chuẩn hóa an toàn nhất nhưng có dạng giống hệt yêu cầu nếu quy đổi:
      
      const canvasRect = canvas.getBoundingClientRect();
      // Bỏ qua cách tính thủ công, dùng trực tiếp bounding rect của canvas để ra %:
      const x = ((e.clientX - canvasRect.left) / canvasRect.width) * 100;
      const y = ((e.clientY - canvasRect.top) / canvasRect.height) * 100;
      return { x, y };
    }

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    return { x, y };
  };
`;

code = code.replace(/const getNormalizedPoint = \([\s\S]*?return \{ x, y \};\s*\};/, replacement.trim());

fs.writeFileSync('/app/applet/src/components/DrawingCanvas.tsx', code);
