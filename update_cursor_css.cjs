const fs = require('fs');

// Check if index.css exists or add cursor rules
let cssPath = 'src/index.css';
let cssContent = fs.readFileSync(cssPath, 'utf8');

if (!cssContent.includes('.cursor-default-arrow')) {
  cssContent += `\n
/* Cursor rules requested by user */
.cursor-default-arrow {
  cursor: default !important;
}

.cursor-ibeam-drag {
  cursor: text !important;
}
`;
  fs.writeFileSync(cssPath, cssContent);
  console.log('Added cursor CSS rules');
}

