const fs = require('fs');
let code = fs.readFileSync('/app/applet/src/App.tsx', 'utf8');

// 1. Inject Refs
if (!code.includes('cssZoomAccumulator')) {
  code = code.replace(
    'const containerRef = useRef<HTMLDivElement>(null);',
    `const containerRef = useRef<HTMLDivElement>(null);
  const cssZoomAccumulator = useRef<number>(1);
  const zoomDebounceTimeout = useRef<any>(null);
  const isPinching = useRef<boolean>(false);`
  );
}

// 2. Replace handleWheel
const startIdx = code.indexOf('const handleWheel = (e: WheelEvent) => {');
const endIdx = code.indexOf('container.addEventListener("wheel"', startIdx);

if (startIdx !== -1 && endIdx !== -1) {
  const replacement = `const handleWheel = (e: WheelEvent) => {
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
             wrapper.style.transformOrigin = \`\${ox}% \${oy}%\`;
           }
           
           cssZoomAccumulator.current *= (1 + zoomDelta);
           
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
  
  code = code.slice(0, startIdx) + replacement + code.slice(endIdx);
}

// 3. Fix Layout styling
// Main container text-align
code = code.replace(
  /className="flex-1 overflow-auto bg-\[#f8f9fa\] relative pdf-viewport-container"\s*style=\{\{\s*overscrollBehavior:\s*"contain",\s*willChange:\s*"scroll-position"\s*\}\}/g,
  `className="flex-1 overflow-auto bg-[#f8f9fa] relative pdf-viewport-container"
        style={{ overscrollBehavior: "contain", willChange: "scroll-position", textAlign: "center", padding: "32px 0" }}`
);

// Remove justify-center flex box from single page container
code = code.replace(
  /<div className="relative flex items-center justify-center p-0 px-2 sm:px-4 my-auto w-full">/g,
  '<div className="relative inline-block text-left w-full h-full">'
);

// Spacer style
code = code.replace(
  /<div id="pdf-scroll-spacer" style=\{\{ margin: "auto", position: "relative" \}\}>/g,
  '<div id="pdf-scroll-spacer" style={{ display: "inline-block", position: "relative", textAlign: "left" }}>'
);

// Wrapper style
code = code.replace(
  /<div id="pdf-transform-wrapper" style=\{\{ transformOrigin: "0 0", willChange: "transform", display: "inline-block" \}\}>/g,
  '<div id="pdf-transform-wrapper" style={{ willChange: "transform", display: "inline-block" }}>'
);

fs.writeFileSync('/app/applet/src/App.tsx', code);
console.log("Done patching App.tsx");
