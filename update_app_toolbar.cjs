const fs = require('fs');

let appContent = fs.readFileSync('src/App.tsx', 'utf8');

// Replace the toolbar wrapper container
// Before:
// <div className="w-full shrink-0 border-t border-neutral-300 bg-neutral-100 flex justify-center pb-4 pt-4 relative z-40">
// Replace with transparent wrapper:
appContent = appContent.replace(
  /<div className="w-full shrink-0 border-t border-neutral-300 bg-neutral-100 flex justify-center pb-4 pt-4 relative z-40">/,
  '<div className="w-full shrink-0 flex justify-center pb-2 pt-1 relative z-40 bg-transparent pointer-events-none">'
);

fs.writeFileSync('src/App.tsx', appContent);
console.log('Successfully updated toolbar wrapper in App.tsx');

