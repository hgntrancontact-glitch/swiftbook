const fs = require('fs');
let code = fs.readFileSync('/app/applet/src/App.tsx', 'utf8');

if (!code.includes('const cssZoomAccumulator = useRef<number>(1);')) {
  code = code.replace(
    'const mainContainerRef = useRef<HTMLElement>(null);',
    `const mainContainerRef = useRef<HTMLElement>(null);
  const cssZoomAccumulator = useRef<number>(1);
  const zoomDebounceTimeout = useRef<any>(null);
  const isPinching = useRef<boolean>(false);`
  );
  fs.writeFileSync('/app/applet/src/App.tsx', code);
  console.log("Force injected refs.");
} else {
  console.log("Already force injected.");
}
