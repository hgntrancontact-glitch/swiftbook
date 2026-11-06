import { PDFDocument, rgb } from 'pdf-lib';

export interface CustomBookConfig {
  orientation: 'portrait' | 'landscape';
  bgColor: string;
}

export const BOOK_COLOR_PALETTE = [
  // Dãy 1
  '#FFFFFF',
  '#D3D3D3',
  '#A8A8A8',
  '#000000',
  '#FF0000',
  '#C00000',
  '#FFC000',
  '#FF7A1A',
  // Dãy 2
  '#FFFF00',
  '#7ED957',
  '#00BF63',
  '#5CE1E6',
  '#38B6FF',
  '#0070C0',
  '#8C52FF',
  '#FF66C4',
];

// A4 in points (72 points/inch): 595.28 x 841.89
export const A4_PORTRAIT_WIDTH = 595.28;
export const A4_PORTRAIT_HEIGHT = 841.89;

export function hexToRgb(hex: string) {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return rgb(r, g, b);
}

export function isDarkColor(hex: string): boolean {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  // Perceived brightness formula
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < 128;
}

/**
 * Generate a new blank PDF with N pages in the given orientation and background color.
 */
export async function createBlankBookPdfBytes(
  config: CustomBookConfig,
  pageCount: number = 1
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const width = config.orientation === 'portrait' ? A4_PORTRAIT_WIDTH : A4_PORTRAIT_HEIGHT;
  const height = config.orientation === 'portrait' ? A4_PORTRAIT_HEIGHT : A4_PORTRAIT_WIDTH;
  const color = hexToRgb(config.bgColor);

  for (let i = 0; i < pageCount; i++) {
    const page = pdfDoc.addPage([width, height]);
    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height,
      color,
    });
  }

  return await pdfDoc.save();
}

/**
 * Appends a new blank page matching the initial book configuration or existing page dimensions to an existing PDF byte array.
 */
export async function appendBlankPageToPdfBytes(
  existingPdfBytes: Uint8Array,
  config?: CustomBookConfig | null
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(existingPdfBytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const lastPage = pages.length > 0 ? pages[pages.length - 1] : null;
  const lastSize = lastPage ? lastPage.getSize() : null;

  let width: number;
  let height: number;

  if (config?.orientation === 'portrait') {
    width = A4_PORTRAIT_WIDTH;
    height = A4_PORTRAIT_HEIGHT;
  } else if (config?.orientation === 'landscape') {
    width = A4_PORTRAIT_HEIGHT;
    height = A4_PORTRAIT_WIDTH;
  } else if (lastSize) {
    width = lastSize.width;
    height = lastSize.height;
  } else {
    width = A4_PORTRAIT_WIDTH;
    height = A4_PORTRAIT_HEIGHT;
  }

  const color = config?.bgColor ? hexToRgb(config.bgColor) : rgb(1, 1, 1);

  const page = pdfDoc.addPage([width, height]);
  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height,
    color,
  });

  return await pdfDoc.save();
}
