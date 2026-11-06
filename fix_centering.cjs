const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Replace styles on main
code = code.replace(
  /justifyContent:\s*'(safe center|center)',\s*alignItems:\s*'(safe center|center)',/g,
  ''
);

// Replace my-auto with m-auto on the wrapper
code = code.replace(
  /className="pdf-hardware-accelerated my-auto inline-block text-left relative"/g,
  'className="pdf-hardware-accelerated m-auto inline-block text-left relative"'
);

fs.writeFileSync('src/App.tsx', code);
