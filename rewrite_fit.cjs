const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// I will just replace the whole body of the useEffect
const regex = /\/\/ Apply Fit-to-Width Auto Scale\s+useEffect\(\(\) => \{[\s\S]*?\}, \[containerSize, basePageDimensions, viewMode, fitMode, isSidebarOpen\]\);/;

const newEffect = `// Apply Fit-to-Width Auto Scale
  useEffect(() => {
    if (fitMode && basePageDimensions && containerSize) {
      // Mép trên cách Header 1.5px. Mép dưới cách vị trí Thanh công cụ nổi 1.5px.
      // Header is above the <main> element, so containerSize.height is the full height below the header.
      // Toolbar is floating at bottom-6 (24px) + its height (~48px). So Toolbar takes up approx 72px from the bottom.
      // So we need 72px + 1.5px bottom padding = 73.5px of vertical padding at the bottom.
      // Top padding = 1.5px. Total vertical padding = 75px.
      // Horizontal padding = 32px (just to be safe).
      const VERTICAL_PADDING = 75; 
      const HORIZONTAL_PADDING = 32;
      const availableWidth = containerSize.width - HORIZONTAL_PADDING;
      const availableHeight = containerSize.height - VERTICAL_PADDING;
      const spreadMultiplier = viewMode === "double" ? 2 : 1;
      const spreadWidth = basePageDimensions.width * spreadMultiplier;
      let newScale = availableWidth / spreadWidth;
      // Also fit by height if not continuous view
      if (viewMode !== "continuous") {
        const scaleByHeight = availableHeight / basePageDimensions.height;
        newScale = Math.min(newScale, scaleByHeight);
      }
      
      // Auto Fit 100% and Center logic:
      // If the newScale allows it, we should maybe snap to 1.0. But the user said:
      // "Tệp vừa nạp vào sẽ tự động đặt mức Zoom 100% (Fit-to-Screen) và căn giữa màn hình"
      // This actually means Fit-to-Screen IS 100% of the FIT scale, not necessarily 1.0.
      newScale = Math.max(0.2, Math.min(newScale, 3.0));
      const finalScale = Number(newScale.toFixed(2));
      setScale((prev) => {
        if (Math.abs(prev - finalScale) < 0.02) {
          return prev;
        }
        return finalScale;
      });
    }
  }, [containerSize, basePageDimensions, viewMode, fitMode, isSidebarOpen]);`;

code = code.replace(regex, newEffect);
fs.writeFileSync('src/App.tsx', code);
console.log('Replaced fit effect');
