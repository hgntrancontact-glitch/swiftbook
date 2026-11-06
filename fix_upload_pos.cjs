const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const loadingStart = '{isLoadingDoc ? (';
const notFoundStart = ') : !pdfDoc ? (';

code = code.replace(
  '{isLoadingDoc ? (',
  '{isLoadingDoc ? (<div className="flex flex-col items-center justify-center w-full h-full">'
);

code = code.replace(
  ') : loadError ? (',
  ')</div> : loadError ? (<div className="flex flex-col items-center justify-center w-full h-full">'
);

code = code.replace(
  ') : !pdfDoc ? (',
  ')</div> : !pdfDoc ? (<div className="flex flex-col items-center justify-center w-full h-full">'
);

code = code.replace(
  '/* Unified Container for Native CSS Scaling */',
  ')</div> : (\n            /* Unified Container for Native CSS Scaling */'
);

fs.writeFileSync('src/App.tsx', code);
