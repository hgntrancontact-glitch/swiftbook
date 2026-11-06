const fs = require('fs');
let code = fs.readFileSync('/app/applet/src/App.tsx', 'utf8');

// 1. Add refs for zoom logic
if (!code.includes('cssZoomAccumulator')) {
    code = code.replace(
        /const containerRef = useRef<HTMLDivElement>\(null\);/,
        `const containerRef = useRef<HTMLDivElement>(null);
  const cssZoomAccumulator = useRef<number>(1);
  const zoomDebounceTimeout = useRef<any>(null);
  const isPinching = useRef<boolean>(false);
  const pinchOrigin = useRef<{x: number, y: number}>({x: 50, y: 50});`
    );
}

// 2. Replace handleWheel
const handleWheelReplacement = `
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const zoomSpeed = 0.012;
        const zoomDelta = -e.deltaY * zoomSpeed;
        
        const wrapper = document.getElementById('pdf-transform-wrapper');
        
        if (wrapper) {
           if (!isPinching.current) {
             isPinching.current = true;
             const rect = wrapper.getBoundingClientRect();
             let ox = ((e.clientX - rect.left) / rect.width) * 100;
             let oy = ((e.clientY - rect.top) / rect.height) * 100;
             ox = Math.max(0, Math.min(100, ox));
             oy = Math.max(0, Math.min(100, oy));
             pinchOrigin.current = { x: ox, y: oy };
             wrapper.style.transformOrigin = \`\${ox}% \${oy}%\`;
           }
           
           cssZoomAccumulator.current *= (1 + zoomDelta);
           // Limit visual scale
           if (scale * cssZoomAccumulator.current < 0.1) cssZoomAccumulator.current = 0.1 / scale;
           if (scale * cssZoomAccumulator.current > 5.0) cssZoomAccumulator.current = 5.0 / scale;
           
           wrapper.style.transform = \`scale(\${cssZoomAccumulator.current})\`;
           
           if (zoomDebounceTimeout.current) clearTimeout(zoomDebounceTimeout.current);
           zoomDebounceTimeout.current = setTimeout(() => {
              setScale(prev => {
                 let newScale = prev * cssZoomAccumulator.current;
                 return Math.max(0.1, Math.min(5.0, newScale));
              });
              
              cssZoomAccumulator.current = 1;
              wrapper.style.transform = 'none';
              isPinching.current = false;
           }, 150);
        }
      }
    };
`;

code = code.replace(/const handleWheel = \(e: WheelEvent\) => \{[\s\S]*?\}\s*\};\s*container\.addEventListener\("wheel"/, handleWheelReplacement.trim() + '\n\n    container.addEventListener("wheel"');

// 3. Fix Layout clipping (margin: auto -> display: inline-block, text-align: center)
code = code.replace(/className="flex-1 overflow-auto bg-\[#f8f9fa\] relative pdf-viewport-container"\s*style=\{\{ overscrollBehavior: "contain", willChange: "scroll-position" \}\}/g, 'className="flex-1 overflow-auto bg-[#f8f9fa] relative pdf-viewport-container"\n        style={{ overscrollBehavior: "contain", willChange: "scroll-position", textAlign: "center", padding: "32px 0" }}');

// In single page mode, remove the flex centering that clips left side
code = code.replace(/<div className="relative flex items-center justify-center p-0 px-2 sm:px-4 my-auto w-full">/g, '<div className="relative inline-block text-left w-full">');

// For BookSpread, PDFPage, Continuous, remove margin: auto from spacer and wrapper
code = code.replace(/<div id="pdf-scroll-spacer" style=\{\{ margin: "auto", position: "relative" \}\}>/g, '<div id="pdf-scroll-spacer" style={{ display: "inline-block", position: "relative", textAlign: "left" }}>');
code = code.replace(/<div id="pdf-transform-wrapper" style=\{\{ transformOrigin: "0 0", willChange: "transform", display: "inline-block" \}\}>/g, '<div id="pdf-transform-wrapper" style={{ willChange: "transform", display: "inline-block" }}>');

fs.writeFileSync('/app/applet/src/App.tsx', code);
