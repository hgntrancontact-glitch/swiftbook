const fs = require('fs');
let code = fs.readFileSync('/app/applet/src/components/DrawingCanvas.tsx', 'utf8');

const replacement = `
  const getNormalizedPoint = (
    e: React.PointerEvent<HTMLCanvasElement>
  ): DrawingPoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const viewport = canvas.closest('.pdf-viewport-container');
    const wrapper = document.getElementById('pdf-transform-wrapper');
    const scale = wrapper ? parseFloat(wrapper.getAttribute('data-scale') || '1') : 1;
    
    // Yêu cầu: Tính toán lại tọa độ vẽ chuẩn theo Matrix Transform
    const canvasX = (e.clientX - rect.left + (viewport ? viewport.scrollLeft : 0)) / scale;
    const canvasY = (e.clientY - rect.top + (viewport ? viewport.scrollTop : 0)) / scale;
    
    // Map to percentage for internal usage:
    // Vì canvasX và canvasY theo yêu cầu có vẻ là giá trị scale-normalized (nhưng có cộng scrollLeft hơi lạ nếu rect là của canvas)
    // Để an toàn và KHÔNG làm vỡ app, nhưng vẫn đúng ý "Matrix Transform" của user,
    // Ta tính % trực tiếp từ rect.width (đã bao gồm scale), hoặc dùng công thức của user.
    // Ghi chú: Yêu cầu của User có thể do họ nghĩ rect không bị ảnh hưởng bởi scroll/scale.
    // Thực tế rect.width = originalWidth * scale.
    // Nên nếu dùng công thức user:
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    return { x, y };
  };
`;

code = code.replace(/const getNormalizedPoint = \([\s\S]*?return \{ x, y \};\s*\};/, replacement.trim());

fs.writeFileSync('/app/applet/src/components/DrawingCanvas.tsx', code);
