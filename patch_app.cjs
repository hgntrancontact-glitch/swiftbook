const fs = require('fs');
let code = fs.readFileSync('/app/applet/src/App.tsx', 'utf8');

const replacement = `
    let scrollAccumX = 0;
    let scrollAccumY = 0;
    let isTicking = false;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        
        // Trackpad pinch translates to deltaY.
        // Negative deltaY means zooming in, positive means zooming out.
        // Multiplier controls zoom speed.
        const zoomSpeed = 0.01;
        const zoomDelta = -e.deltaY * zoomSpeed;
        
        setScale((prev) => {
          let newScale = prev * (1 + zoomDelta);
          return Math.max(0.1, Math.min(5.0, newScale));
        });
      } else {
        // Cho phép cuộn bằng 2 ngón tay trên Trackpad mượt mà
        scrollAccumX += e.deltaX;
        scrollAccumY += e.deltaY;

        if (!isTicking) {
          requestAnimationFrame(() => {
            if (container) {
              container.scrollLeft += scrollAccumX;
              container.scrollTop += scrollAccumY;
            }
            scrollAccumX = 0;
            scrollAccumY = 0;
            isTicking = false;
          });
          isTicking = true;
        }
      }
    };
`;

code = code.replace(/const handleWheel = \(e: WheelEvent\) => \{[\s\S]*?container\.scrollLeft \+\= e\.deltaX;\s*container\.scrollTop \+\= e\.deltaY;\s*\}\s*\};/, replacement.trim());

fs.writeFileSync('/app/applet/src/App.tsx', code);
