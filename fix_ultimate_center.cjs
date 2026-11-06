const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Clean up <main> styles to be pure
code = code.replace(
  /justifyContent: 'safe center',\s*alignItems: 'safe center',/g,
  ''
);

// Add items-center to <main> className if not present
if (!code.includes('items-center"')) {
  code = code.replace(
    /className="pdf-viewport-container flex-1 h-full w-full overflow-auto flex flex-col relative min-h-0 no-scrollbar box-border"/g,
    'className="pdf-viewport-container flex-1 h-full w-full overflow-auto flex flex-col items-center relative min-h-0 no-scrollbar box-border"'
  );
}

// 2. Wrap the content of <main> with flexible spacers
// We need to insert <div className="flex-1 min-h-0 pointer-events-none shrink-0" /> before and after the main content block
// The main content block is either the placeholder or the pdf-transform-wrapper
code = code.replace(
  /<div className="flex-1 flex flex-col relative overflow-hidden bg-neutral-200\/60">\s*<main[\s\S]*?onClick=\{\(e\) => \{[\s\S]*?\}\s*\}\s*>/,
  (match) => match + '\n          {/* Top Safe Spacer */}\n          <div className="flex-1 min-h-0 pointer-events-none shrink-0 w-full" />\n'
);

code = code.replace(
  /<\/main>/,
  '          {/* Bottom Safe Spacer */}\n          <div className="flex-1 min-h-0 pointer-events-none shrink-0 w-full" />\n        </main>'
);

// 3. Remove my-auto from pdf-transform-wrapper so it doesn't conflict with the spacers
code = code.replace(
  /className="pdf-hardware-accelerated my-auto inline-block text-left relative"/g,
  'className="pdf-hardware-accelerated inline-block text-left relative shrink-0"'
);

// Also remove my-auto from the upload placeholder if it has it
code = code.replace(
  /className="m-auto flex flex-col items-center/g,
  'className="flex flex-col items-center shrink-0'
);
code = code.replace(
  /className="my-auto flex flex-col items-center/g,
  'className="flex flex-col items-center shrink-0'
);

fs.writeFileSync('src/App.tsx', code);
