const fs = require('fs');
let code = fs.readFileSync('src/components/PDFPageView.tsx', 'utf8');

// Ensure we are using requestIdleCallback for rendering
code = code.replace(
  /debounceTimer = setTimeout\(\(\) => \{\s*const requestIdle = window\.requestIdleCallback \|\| \(\(cb\) => setTimeout\(cb, 1\)\);\s*requestIdle\(\(\) => \{\s*if \(\!isCancelled\) \{\s*renderPage\(\);\s*\}\s*\}\);\s*\}, 50\);/g,
  `debounceTimer = setTimeout(() => {
        const requestIdle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));
        requestIdle(() => {
          if (!isCancelled) {
            renderPage();
          }
        });
      }, 100);`
);

fs.writeFileSync('src/components/PDFPageView.tsx', code);
