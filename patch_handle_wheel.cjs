const fs = require('fs');
let code = fs.readFileSync('/app/applet/src/App.tsx', 'utf8');

// We need to resize the spacer during the pinch so the user can scroll to the edge!
const replacement = `const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const zoomSpeed = 0.012;
        const zoomDelta = -e.deltaY * zoomSpeed;
        
        const wrapper = document.getElementById('pdf-transform-wrapper');
        const spacer = document.getElementById('pdf-scroll-spacer');
        
        if (wrapper && spacer) {
           if (!isPinching.current) {
             isPinching.current = true;
             const rect = wrapper.getBoundingClientRect();
             let ox = ((e.clientX - rect.left) / rect.width) * 100;
             let oy = ((e.clientY - rect.top) / rect.height) * 100;
             ox = Math.max(0, Math.min(100, ox));
             oy = Math.max(0, Math.min(100, oy));
             wrapper.style.transformOrigin = \`\${ox}% \${oy}%\`;
             
             // Save original size before pinch
             wrapper.dataset.origWidth = wrapper.offsetWidth.toString();
             wrapper.dataset.origHeight = wrapper.offsetHeight.toString();
           }
           
           cssZoomAccumulator.current *= (1 + zoomDelta);
           
           wrapper.style.transform = \`scale(\${cssZoomAccumulator.current})\`;
           
           // Resize spacer to force scrollbars to update instantly
           const origW = parseFloat(wrapper.dataset.origWidth || '0');
           const origH = parseFloat(wrapper.dataset.origHeight || '0');
           if (origW && origH) {
               spacer.style.width = \`\${origW * cssZoomAccumulator.current}px\`;
               spacer.style.height = \`\${origH * cssZoomAccumulator.current}px\`;
           }
           
           if (zoomDebounceTimeout.current) clearTimeout(zoomDebounceTimeout.current);
           zoomDebounceTimeout.current = setTimeout(() => {
              setScale(prev => {
                 let newScale = prev * cssZoomAccumulator.current;
                 return Math.max(0.1, Math.min(5.0, newScale));
              });
              
              cssZoomAccumulator.current = 1;
              wrapper.style.transform = 'none';
              spacer.style.width = 'auto';
              spacer.style.height = 'auto';
              isPinching.current = false;
           }, 150);
        }
      }
    };`;

code = code.replace(/const handleWheel = \(e: WheelEvent\) => \{[\s\S]*?\}, 150\);\s*\}\s*\}\s*\};/, replacement);

fs.writeFileSync('/app/applet/src/App.tsx', code);
console.log("Patched handle wheel.");
