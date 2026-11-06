const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  /paddingBottom: '96px',/g,
  "paddingBottom: '96px',\n            justifyContent: 'safe center',\n            alignItems: 'safe center',"
);

code = code.replace(
  /className="pdf-hardware-accelerated m-auto inline-block text-left relative"/g,
  'className="pdf-hardware-accelerated my-auto inline-block text-left relative"'
);

fs.writeFileSync('src/App.tsx', code);
