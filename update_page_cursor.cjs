const fs = require('fs');

let pageContent = fs.readFileSync('src/components/PDFPageView.tsx', 'utf8');

// Ensure page container has cursor-default
pageContent = pageContent.replace(
  /className=\{`relative bg-white transition-shadow duration-300 \$\{bookSpineClass\} `\}/,
  'className={`relative bg-white transition-shadow duration-300 cursor-default ${bookSpineClass} `}'
);

fs.writeFileSync('src/components/PDFPageView.tsx', pageContent);
console.log('Updated page container cursor in PDFPageView.tsx');

