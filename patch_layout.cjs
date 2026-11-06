const fs = require('fs');
let code = fs.readFileSync('/app/applet/src/App.tsx', 'utf8');

// Replace the main tag's classes to use block layout instead of flex
code = code.replace(
  /className="pdf-viewport-container flex-1 h-full w-full overflow-auto flex flex-col items-center relative min-h-0 no-scrollbar box-border"/g,
  'className="pdf-viewport-container block flex-1 h-full w-full overflow-auto relative min-h-0 no-scrollbar box-border whitespace-nowrap"'
);

code = code.replace(
  /style=\{\{ paddingTop: '24px', paddingBottom: '96px' \}\}/g,
  "style={{ paddingTop: '24px', paddingBottom: '96px', textAlign: 'center' }}"
);

// We need to restore flex for the Empty/Loading states so they remain centered
// Currently they use \`m-auto\`. Since the parent is no longer flex, \`m-auto\` vertically won't work in block.
// Let's wrap them in a flex helper
code = code.replace(
  /<div className="m-auto flex flex-col items-center justify-center gap-3 p-8/g,
  '<div className="inline-flex flex-col items-center justify-center gap-3 p-8 mt-20'
);
code = code.replace(
  /<div className="m-auto flex flex-col items-center justify-center gap-3 p-8 bg-white rounded-xl shadow-lg border border-red-200 max-w-md text-center">/g,
  '<div className="inline-flex flex-col items-center justify-center gap-3 p-8 mt-20 bg-white rounded-xl shadow-lg border border-red-200 max-w-md text-center">'
);
code = code.replace(
  /<div className="m-auto flex flex-col items-center justify-center gap-6 p-12/g,
  '<div className="inline-flex flex-col items-center justify-center gap-6 p-12 mt-20'
);

// We also need to fix the single page wrapper
code = code.replace(
  /<div className="relative inline-block text-left w-full">/g,
  '<div className="relative inline-block text-left">'
);

fs.writeFileSync('/app/applet/src/App.tsx', code);
console.log("Patched layout.");
