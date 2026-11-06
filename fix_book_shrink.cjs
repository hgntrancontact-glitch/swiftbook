const fs = require('fs');
let code = fs.readFileSync('src/components/BookSpreadView.tsx', 'utf8');
code = code.replaceAll("className={`relative overflow-visible ${!activeGesturingPage ? 'hover:z-40' : ''}`}", "className={`relative overflow-visible shrink-0 ${!activeGesturingPage ? 'hover:z-40' : ''}`}");
fs.writeFileSync('src/components/BookSpreadView.tsx', code);
