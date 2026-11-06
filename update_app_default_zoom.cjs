const fs = require('fs');

let appContent = fs.readFileSync('src/App.tsx', 'utf8');

// Update fit calculation to default/clamp to 1.0 (100%) initially or clean 100%
// Also check setScale in fit-to-width
const oldFitEffect = `  // Apply Fit-to-Width Auto Scale
  useEffect(() => {
    if (fitMode && basePageDimensions && containerSize) {
      const PADDING = 48; // Safety padding
      const availableWidth = containerSize.width - PADDING;
      const availableHeight = containerSize.height - PADDING;
      const spreadMultiplier = viewMode === "double" ? 2 : 1;
      const spreadWidth = basePageDimensions.width * spreadMultiplier;
      let newScale = availableWidth / spreadWidth;
      // Also fit by height if not continuous view
      if (viewMode !== "continuous") {
        const scaleByHeight = availableHeight / basePageDimensions.height;
        newScale = Math.min(newScale, scaleByHeight);
      }
      newScale = Math.max(0.2, Math.min(newScale, 3.0));
      const finalScale = Number(newScale.toFixed(2));
      setScale((prev) => {
        // Prevent micro-updates to avoid triggering re-renders for < 1% scale changes
        if (Math.abs(prev - finalScale) < 0.02) {
          return prev;
        }
        return finalScale;
      });
    }
  }, [containerSize, basePageDimensions, viewMode, fitMode, isSidebarOpen]);`;

const newFitEffect = `  // Apply Fit-to-Width Auto Scale
  useEffect(() => {
    if (fitMode && basePageDimensions && containerSize) {
      // 1.5px vertical padding between Header and Bottom toolbar
      const VERTICAL_PADDING = 3; 
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
      // Round to clean scale, default to 1.0 if fits comfortably
      newScale = Math.max(0.2, Math.min(newScale, 3.0));
      // If close to 1.0 (between 0.95 and 1.05), snap to 1.0 (100%)
      if (newScale >= 0.92 && newScale <= 1.08) {
        newScale = 1.0;
      }
      const finalScale = Number(newScale.toFixed(2));
      setScale((prev) => {
        if (Math.abs(prev - finalScale) < 0.02) {
          return prev;
        }
        return finalScale;
      });
    }
  }, [containerSize, basePageDimensions, viewMode, fitMode, isSidebarOpen]);`;

appContent = appContent.replace(oldFitEffect, newFitEffect);
fs.writeFileSync('src/App.tsx', appContent);
console.log('Successfully updated fit effect in App.tsx');

