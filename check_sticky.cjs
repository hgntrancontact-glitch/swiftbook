const fs = require('fs');
let s = fs.readFileSync('src/components/StickyNotesLayer.tsx', 'utf8');
console.log(s.slice(s.indexOf('{/* LAYER 3: Footer Bar'), s.indexOf('{/* LAYER 3: Footer Bar') + 800));
