const fs = require('fs');
let code = fs.readFileSync('/app/applet/src/components/PDFPageView.tsx', 'utf8');

code = code.replace(
    /const maxDimension = Math\.max\(width, height\);\s*const dpr = maxDimension > 2200 \? 1 : Math\.min\(window\.devicePixelRatio \|\| 1, 1\.5\);/,
    `const maxDimension = Math.max(width, height);
        const rawDpr = window.devicePixelRatio || 1;
        const dpr = maxDimension * rawDpr > 8000 ? (8000 / maxDimension) : rawDpr;`
);

fs.writeFileSync('/app/applet/src/components/PDFPageView.tsx', code);
console.log("Patched DPR in PDFPageView");
