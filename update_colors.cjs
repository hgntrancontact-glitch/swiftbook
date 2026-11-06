const fs = require('fs');

let typesContent = fs.readFileSync('src/types.ts', 'utf8');

const oldColorsBlock = `export const NOTE_PAPER_COLORS: NoteColorTheme[] = [
  {
    name: 'Vàng cam',
    id: 'color-1',
    noteBg: '#f7de79',
    contentBg: '#fff2be',
    headerBg: '#f7de79',
  },
  {
    name: 'Xanh cốm',
    id: 'color-2',
    noteBg: '#bff27e',
    contentBg: '#d7ffa4',
    headerBg: '#bff27e',
  },
  {
    name: 'Hồng ngọc',
    id: 'color-3',
    noteBg: '#fab4df',
    contentBg: '#ffcbeb',
    headerBg: '#fab4df',
  },
  {
    name: 'Xanh dương',
    id: 'color-4',
    noteBg: '#abdcf9',
    contentBg: '#c4e9ff',
    headerBg: '#abdcf9',
  },
  {
    name: 'Xám bạc',
    id: 'color-5',
    noteBg: '#ebe7e7',
    contentBg: '#f9f9f9',
    headerBg: '#ebe7e7',
  },
];`;

const newColorsBlock = `export const NOTE_PAPER_COLORS: NoteColorTheme[] = [
  {
    name: 'Màu 1',
    id: 'color-1',
    headerBg: '#ffefae',
    contentBg: '#fff4c9',
    noteBg: '#ffefae',
  },
  {
    name: 'Màu 2',
    id: 'color-2',
    headerBg: '#d9f7b2',
    contentBg: '#e8ffcb',
    noteBg: '#d9f7b2',
  },
  {
    name: 'Màu 3',
    id: 'color-3',
    headerBg: '#fbd4ec',
    contentBg: '#ffe6f5',
    noteBg: '#fbd4ec',
  },
  {
    name: 'Màu 4',
    id: 'color-4',
    headerBg: '#bce6ff',
    contentBg: '#d4efff',
    noteBg: '#bce6ff',
  },
  {
    name: 'Màu 5',
    id: 'color-5',
    headerBg: '#f7f5f5',
    contentBg: '#fdfdfd',
    noteBg: '#f7f5f5',
  },
];`;

if (typesContent.includes(oldColorsBlock)) {
  typesContent = typesContent.replace(oldColorsBlock, newColorsBlock);
  fs.writeFileSync('src/types.ts', typesContent);
  console.log('Successfully updated NOTE_PAPER_COLORS in src/types.ts');
} else {
  console.log('Old colors block not found exactly, doing regex replace');
  typesContent = typesContent.replace(/export const NOTE_PAPER_COLORS: NoteColorTheme\[\] = \[[\s\S]*?\];/m, newColorsBlock);
  fs.writeFileSync('src/types.ts', typesContent);
}

