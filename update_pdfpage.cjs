const fs = require('fs');

let content = fs.readFileSync('src/components/PDFPageView.tsx', 'utf8');

// 1. Add import
if (!content.includes('SimulatedSelectionLayer')) {
  content = content.replace("import { HighlightOverlay } from './HighlightOverlay';",
    "import { HighlightOverlay } from './HighlightOverlay';\nimport { SimulatedSelectionLayer } from './SimulatedSelectionLayer';");
}

// 2. Add SimulatedSelectionLayer before HighlightOverlay
if (!content.includes('<SimulatedSelectionLayer')) {
  content = content.replace("{/* Highlight Overlay */}", 
    `{/* Simulated Selection Layer */}
      <SimulatedSelectionLayer
        pageNumber={pageNumber}
        scale={scale}
        isActive={activeTool === 'select'}
        highlightColor={highlightColor || 'yellow'}
        onAddHighlight={(hl) => onAddHighlight && onAddHighlight(hl)}
      />

      {/* Highlight Overlay */}`);
}

// 3. Disable pointer events on pdf-text-layer since simulated selection takes over
content = content.replace(
  /className=\{`pdf-text-layer \$\{[\s\S]*?activeTool === 'select' \? 'pointer-events-auto z-10' : 'pointer-events-none'[\s\S]*?\} \$\{isSelectingText \? 'is-selecting' : ''\}`\}/,
  'className={`pdf-text-layer pointer-events-none`}'
);

fs.writeFileSync('src/components/PDFPageView.tsx', content);

