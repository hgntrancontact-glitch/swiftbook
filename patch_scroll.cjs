const fs = require('fs');
let code = fs.readFileSync('/app/applet/src/App.tsx', 'utf8');

// Update handleWheel
const handleWheelReplacement = `
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const zoomSpeed = 0.01;
        const zoomDelta = -e.deltaY * zoomSpeed;
        
        const wrapper = document.getElementById('pdf-transform-wrapper');
        const spacer = document.getElementById('pdf-scroll-spacer');
        
        if (wrapper && spacer) {
           let currentScale = parseFloat(wrapper.getAttribute('data-scale') || '1');
           currentScale *= (1 + zoomDelta);
           currentScale = Math.max(0.1, Math.min(5.0, currentScale));
           wrapper.setAttribute('data-scale', currentScale.toString());
           
           wrapper.style.transform = \`scale(\${currentScale})\`;
           wrapper.style.transformOrigin = '0 0'; // Top-left is required for spacer syncing
           
           // Sync spacer size to create native scrollbars
           spacer.style.width = \`\${wrapper.offsetWidth * currentScale}px\`;
           spacer.style.height = \`\${wrapper.offsetHeight * currentScale}px\`;
        }
      }
    };
`;

code = code.replace(/const handleWheel = \(e: WheelEvent\) => \{[\s\S]*?\}\s*\};\s*container\.addEventListener\("wheel"/, handleWheelReplacement.trim() + '\n\n    container.addEventListener("wheel"');

// Wrap the view components
code = code.replace(
  /<div id="pdf-transform-wrapper" style=\{\{ margin: "auto", maxWidth: "100%", willChange: "transform" \}\}>\s*<BookSpreadView/g,
  `<div id="pdf-scroll-spacer" style={{ margin: "auto", position: "relative" }}>
              <div id="pdf-transform-wrapper" style={{ transformOrigin: "0 0", willChange: "transform", display: "inline-block" }}>
                <BookSpreadView`
);

code = code.replace(
  /<div id="pdf-transform-wrapper" style=\{\{ margin: "auto", maxWidth: "100%", willChange: "transform" \}\}>\s*<PDFPageView/g,
  `<div id="pdf-scroll-spacer" style={{ margin: "auto", position: "relative" }}>
              <div id="pdf-transform-wrapper" style={{ transformOrigin: "0 0", willChange: "transform", display: "inline-block" }}>
                <PDFPageView`
);

code = code.replace(
  /<div id="pdf-transform-wrapper" style=\{\{ margin: "auto", maxWidth: "100%", willChange: "transform" \}\}>\s*<ContinuousView/g,
  `<div id="pdf-scroll-spacer" style={{ margin: "auto", position: "relative" }}>
              <div id="pdf-transform-wrapper" style={{ transformOrigin: "0 0", willChange: "transform", display: "inline-block" }}>
                <ContinuousView`
);

// Close the extra div
code = code.replace(/<\/BookSpreadView>\s*<\/div>/g, '</BookSpreadView>\n              </div>\n            </div>');
code = code.replace(/totalPages=\{totalPages\}\s*\/>\s*<\/div>/g, 'totalPages={totalPages}\n              />\n              </div>\n            </div>');
code = code.replace(/onActiveToolChange=\{setActiveTool\}\s*\/>\s*<\/div>/g, 'onActiveToolChange={setActiveTool}\n            />\n              </div>\n            </div>');

fs.writeFileSync('/app/applet/src/App.tsx', code);
