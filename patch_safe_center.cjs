const fs = require('fs');
let code = fs.readFileSync('/app/applet/src/App.tsx', 'utf8');

// Revert to flex, but with safe center!
code = code.replace(
  /className="pdf-viewport-container block flex-1 h-full w-full overflow-auto relative min-h-0 no-scrollbar box-border whitespace-nowrap"/g,
  'className="pdf-viewport-container flex-1 h-full w-full overflow-auto flex flex-col relative min-h-0 no-scrollbar box-border"'
);
code = code.replace(
  /style=\{\{ paddingTop: '24px', paddingBottom: '96px', textAlign: 'center' \}\}/g,
  "style={{ paddingTop: '24px', paddingBottom: '96px', justifyContent: 'safe center', alignItems: 'safe center' }}"
);

fs.writeFileSync('/app/applet/src/App.tsx', code);
console.log("Patched safe center.");
