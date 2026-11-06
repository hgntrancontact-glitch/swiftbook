const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Find the pdf-viewport-container
const startStr = "className={`pdf-viewport-container";
const endStr = "{isLoadingDoc ? (";

const startIndex = code.indexOf(startStr);
const endIndex = code.indexOf(endStr);

if (startIndex !== -1 && endIndex !== -1) {
    const replacement = `className={\`pdf-viewport-container flex-1 h-full w-full overflow-auto relative min-h-0 no-scrollbar box-border\`}
          style={{
            paddingTop: '1.75px',
            paddingBottom: '1.75px',
          }}
          onClick={(e) => {
            if (e.button === 0 && !e.shiftKey) {
              const target = e.target as HTMLElement;
              const isInteractive = Boolean(
                target.closest(
                  '.free-text-item-container, .box-floating-toolbar, [id^="box-"], .sticky-note-paper, [id^="sticky-"], [id^="hl-"], #smart-shape-handles, .stroke-vector-group, button, input, textarea, .ft-toolbar, .ft-link-card-popover, .lark-floating-toolbar, nav, header'
                )
              );
              if (!isInteractive) {
                handleClearSelection();
              }
            }
          }}
        >
          `;
    
    // Only replace if we haven't already
    code = code.substring(0, startIndex) + replacement + code.substring(endIndex);
}

// Now replace the wrapper container layout
const oldWrapperStart = '{!pdfDoc ? (';
const newWrapperStart = `{!pdfDoc ? (`;

const p1 = code.indexOf('/* Unified Container for Native CSS Scaling */');
const p2 = code.indexOf('<div', p1);
const p3 = code.indexOf('<div', p2 + 1);

if (p1 !== -1) {
    // We want to replace the div surrounding pdf-transform-wrapper
    // from: <div className="min-w-full w-fit min-h-full flex flex-col m-auto">
    // to:   <div className="w-max min-w-full min-h-full flex p-4 sm:p-8">
    // and the wrapper gets margin: auto
    code = code.replace(
        '<div className="min-w-full w-fit min-h-full flex flex-col m-auto">',
        '<div className="w-max min-w-full min-h-full flex p-4 sm:p-8 flex-col">'
    );
    code = code.replace(
        'className="pdf-hardware-accelerated block text-left relative shrink-0 m-auto"',
        'className="pdf-hardware-accelerated block text-left relative shrink-0" style={{ margin: "auto" }}'
    );
}

fs.writeFileSync('src/App.tsx', code);
