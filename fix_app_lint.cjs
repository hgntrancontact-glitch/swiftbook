const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(/const \[visualViewportScale, setVisualViewportScale\] = useState<number>\(1\);/, 'const [visualViewportScale] = useState<number>(1);');

fs.writeFileSync('src/App.tsx', code);
