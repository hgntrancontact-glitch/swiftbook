const fs = require('fs');

let appContent = fs.readFileSync('src/App.tsx', 'utf8');

// 1. In <main className="flex-1 h-full overflow-auto flex flex-col items-center p-2 sm:p-4 relative min-h-0 no-scrollbar">
// Replace p-2 sm:p-4 with py-[1.5px] px-2 sm:px-4
appContent = appContent.replace(
  /className="flex-1 h-full overflow-auto flex flex-col items-center p-2 sm:p-4 relative min-h-0 no-scrollbar"/,
  'className="flex-1 h-full overflow-auto flex flex-col items-center py-[1.5px] px-2 sm:px-4 relative min-h-0 no-scrollbar"'
);

// 2. In single page mode:
// <div className="relative flex items-center justify-center p-4 min-h-[calc(100vh-120px)] w-full">
// change to py-[1.5px] px-2 sm:px-4
appContent = appContent.replace(
  /<div className="relative flex items-center justify-center p-4 min-h-\[calc\(100vh-120px\)\] w-full">/,
  '<div className="relative flex items-center justify-center py-[1.5px] px-2 sm:px-4 my-auto w-full">'
);

fs.writeFileSync('src/App.tsx', appContent);
console.log('Updated padding in App.tsx');

