const fs = require('fs');
let code = fs.readFileSync('src/components/FreeTextLayer.tsx', 'utf-8');

// Replace Text colors
code = code.replace(
  `const TEXT_COLORS = [
  '#000000', '#808080', '#FFFFFF', '#8c52ff', '#38b6ff', '#7dff72', '#f9ef23', '#ff751f', '#ff0000'
];`,
  `const TEXT_COLORS = [
  '#1D2129', '#4E5969', '#FFFFFF', '#165DFF', '#00B42A', '#F7BA1E', '#F53F3F', '#652CB3', '#F5319D'
];`
);

// Replace BG_COLORS_DARK
code = code.replace(
  `const BG_COLORS_DARK = [
  '#000000', '#545454', '#a6a6a6', '#8c52ff', '#38b6ff', '#7dff72', '#f9ef23', '#ff751f', '#ff0000', '#ff66c4'
];`,
  `const BG_COLORS_DARK = [
  '#1D2129', '#4E5969', '#86909C', '#652CB3', '#165DFF', '#00B42A', '#FF7D00', '#F53F3F', '#F5319D', '#D91AD9'
];`
);

// Replace 'A' icon font
code = code.replace(
  /<span className="font-serif font-bold text-\[17px\] leading-none mb-\[1px\]" style={{ color: item.color \|\| '#000' }}>A<\/span>/g,
  `<span className="font-sans font-medium text-[16px] leading-none mb-[1px]" style={{ color: item.color || '#000', WebkitTextStroke: (item.color === '#FFFFFF' ? '1px #D0D5DD' : '0px') }}>A</span>`
);

code = code.replace(
  /<span className="font-serif font-bold text-\[14px\]" style={{ color: c }}>A<\/span>/g,
  `<span className="font-sans font-medium text-[14px]" style={{ color: c, WebkitTextStroke: (c === '#FFFFFF' ? '1px #D0D5DD' : '0px') }}>A</span>`
);

code = code.replace(
  /<span className="font-serif font-bold text-\[17px\]">A<\/span>/g,
  `<span className="font-sans font-medium text-[17px]">A</span>`
);

fs.writeFileSync('src/components/FreeTextLayer.tsx', code);
