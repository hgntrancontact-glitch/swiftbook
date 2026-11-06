const fs = require('fs');
let code = fs.readFileSync('/app/applet/src/components/DrawingCanvas.tsx', 'utf8');

const replacement = `  const getNormalizedPoint = (
    e: React.PointerEvent<HTMLCanvasElement>
  ): DrawingPoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    
    // Pure relative coordinates based on the bounding rect (which already accounts for zoom and scroll)
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;
    
    // Map to percentage [0..1]
    const xPct = canvasX / rect.width;
    const yPct = canvasY / rect.height;
    
    return { x: xPct, y: yPct };
  };`;

code = code.replace(/const getNormalizedPoint = \([\s\S]*?return \{ x: xPct, y: yPct \};\s*\};/, replacement);
fs.writeFileSync('/app/applet/src/components/DrawingCanvas.tsx', code);
console.log("Fixed canvas coordinates.");
