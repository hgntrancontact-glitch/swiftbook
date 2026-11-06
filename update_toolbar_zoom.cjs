const fs = require('fs');

let toolbarContent = fs.readFileSync('src/components/Toolbar.tsx', 'utf8');

// Helper function to calculate step
// For zoom in: round to next multiple of 0.10. E.g., if 0.95 -> 1.0. If 1.0 -> 1.1.
// For zoom out: round to previous multiple of 0.10. E.g., if 1.05 -> 1.0. If 1.0 -> 0.9.

const oldZoomButtons = `            <button
              onClick={() => onZoomChange(Math.max(0.2, Number((scale - 0.15).toFixed(2))), false)}
              className="p-1 text-neutral-700 hover:text-neutral-900 rounded hover:bg-neutral-200 transition-colors"
              title="Thu nhỏ (-15%)"
            >
              <ZoomOut size={12} />
            </button>`;

const newZoomOutButton = `            <button
              onClick={() => {
                const currentPercent = Math.round(scale * 100);
                const nextPercent = Math.max(20, Math.floor((currentPercent - 1) / 10) * 10);
                onZoomChange(Number((nextPercent / 100).toFixed(2)), false);
              }}
              className="p-1 text-neutral-700 hover:text-neutral-900 rounded hover:bg-neutral-200 transition-colors"
              title="Thu nhỏ (-10%)"
            >
              <ZoomOut size={12} />
            </button>`;

const oldZoomInButton = `            <button
              onClick={() => onZoomChange(Math.min(3.5, Number((scale + 0.15).toFixed(2))), false)}
              className="p-1 text-neutral-700 hover:text-neutral-900 rounded hover:bg-neutral-200 transition-colors"
              title="Phóng to (+15%)"
            >
              <ZoomIn size={12} />
            </button>`;

const newZoomInButton = `            <button
              onClick={() => {
                const currentPercent = Math.round(scale * 100);
                const nextPercent = Math.min(350, Math.ceil((currentPercent + 1) / 10) * 10);
                onZoomChange(Number((nextPercent / 100).toFixed(2)), false);
              }}
              className="p-1 text-neutral-700 hover:text-neutral-900 rounded hover:bg-neutral-200 transition-colors"
              title="Phóng to (+10%)"
            >
              <ZoomIn size={12} />
            </button>`;

toolbarContent = toolbarContent.replace(oldZoomButtons, newZoomOutButton);
toolbarContent = toolbarContent.replace(oldZoomInButton, newZoomInButton);

fs.writeFileSync('src/components/Toolbar.tsx', toolbarContent);
console.log('Successfully updated zoom step logic in Toolbar.tsx');

