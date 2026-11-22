import {
  PDFDocument, PDFPage, PDFDict, PDFName, PDFHexString, concatTransformationMatrix, drawObject,
  popGraphicsState, pushGraphicsState,
} from 'pdf-lib';
import { IMAGE_PIXELS_METADATA } from './imagePdfResolution';

/** TIFF orientation applies to JPEG EXIF and PNG eXIf alike. Invalid metadata
 * must not prevent an otherwise readable image from being opened. */
function tiffOrientation(bytes: Uint8Array, start: number, end: number): number {
  if (start + 8 > end) return 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const little = view.getUint16(start) === 0x4949;
  if (!little && view.getUint16(start) !== 0x4d4d) return 1;
  if (view.getUint16(start + 2, little) !== 42) return 1;
  const directory = start + view.getUint32(start + 4, little);
  if (directory < start + 8 || directory + 2 > end) return 1;
  const count = view.getUint16(directory, little);
  for (let i = 0, entry = directory + 2; i < count && entry + 12 <= end; i++, entry += 12) {
    if (view.getUint16(entry, little) !== 0x112 || view.getUint16(entry + 2, little) !== 3 || view.getUint32(entry + 4, little) !== 1) continue;
    const orientation = view.getUint16(entry + 8, little);
    return orientation >= 1 && orientation <= 8 ? orientation : 1;
  }
  return 1;
}

function imageMetadata(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let orientation = 1, colorProfile = false;
  const jpeg = bytes.length > 2 && bytes[0] === 255 && bytes[1] === 216;
  const png = bytes.length >= 8 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a;
  if (jpeg) {
    for (let offset = 2; offset + 4 <= bytes.length;) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset), end = offset + length, data = offset + 2;
      if (length < 2 || end > bytes.length) break;
      if (marker === 0xe1 && data + 6 <= end && view.getUint32(data) === 0x45786966 && view.getUint16(data + 4) === 0)
        orientation = tiffOrientation(bytes, data + 6, end);
      if (marker === 0xe2 && data + 12 <= end && String.fromCharCode(...bytes.subarray(data, data + 12)) === 'ICC_PROFILE\0') colorProfile = true;
      offset = end;
    }
  } else if (png) {
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = view.getUint32(offset), end = offset + 8 + length;
      if (end + 4 > bytes.length) break;
      const type = view.getUint32(offset + 4);
      if (type === 0x65584966) orientation = tiffOrientation(bytes, offset + 8, end); // eXIf
      if (type === 0x69434350) colorProfile = true; // iCCP
      offset = end + 4;
    }
  }
  return {jpeg, png, orientation, colorProfile};
}

/** Browser-only formats (and colour-profile conversion) are decoded once, at
 * their native size. PNG preserves alpha and avoids a lossy JPEG round trip. */
async function decodeToPng(file: File): Promise<Uint8Array> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Không thể đọc hoặc giải mã tập tin hình ảnh.'));
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Kích thước hình ảnh không hợp lệ.');
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    try {
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Không thể tạo bộ giải mã hình ảnh.');
      context.drawImage(image, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        value => value ? resolve(value) : reject(new Error('Không thể chuyển đổi hình ảnh.')), 'image/png'));
      return new Uint8Array(await blob.arrayBuffer());
    } finally { canvas.width = canvas.height = 1; }
  } finally { URL.revokeObjectURL(url); }
}

/** Embed original raster samples, rather than feeding a blob URL to jsPDF's
 * synchronous URL loader. Page geometry changes neither aspect nor pixel data.
 * pageWidth is omitted when merging images to retain existing page dimensions. */
export async function appendImagePage(document: PDFDocument, file: File, pageWidth?: number): Promise<PDFPage> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const metadata = imageMetadata(bytes);
  let image, orientation = metadata.orientation;
  try {
    if (metadata.colorProfile) throw new Error('Decode colour profile in the browser');
    if (metadata.png) image = await document.embedPng(bytes);
    else if (metadata.jpeg) image = await document.embedJpg(bytes);
    else throw new Error('Browser image format');
  } catch {
    image = await document.embedPng(await decodeToPng(file));
    orientation = 1; // The browser has already applied EXIF and colour management.
  }
  const swapped = orientation >= 5;
  const factor = pageWidth ? pageWidth / (swapped ? image.height : image.width) : 1;
  const w = image.width * factor, h = image.height * factor;
  const page = document.addPage(swapped ? [h, w] : [w, h]);
  const matrices: [number, number, number, number, number, number][] = [
    [w, 0, 0, h, 0, 0], [-w, 0, 0, h, w, 0], [-w, 0, 0, -h, w, h], [w, 0, 0, -h, 0, h],
    [0, -w, -h, 0, h, w], [0, -w, h, 0, 0, w], [0, w, h, 0, 0, 0], [0, w, -h, 0, h, 0],
  ];
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...matrices[orientation - 1]),
    drawObject(page.node.newXObject('Image', image.ref)), popGraphicsState());
  const info = document.context.lookup(document.context.trailerInfo.Info, PDFDict);
  const key = PDFName.of(IMAGE_PIXELS_METADATA), stored = info.get(key);
  let pages: Record<string, {width: number; height: number}> = {};
  if (stored instanceof PDFHexString) {
    try { pages = JSON.parse(stored.decodeText()); } catch {}
  }
  pages[document.getPageCount()] = {width: swapped ? image.height : image.width, height: swapped ? image.width : image.height};
  info.set(key, PDFHexString.fromText(JSON.stringify(pages)));
  return page;
}
