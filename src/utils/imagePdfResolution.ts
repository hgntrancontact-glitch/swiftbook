import type {DetailTile} from './pdfDetailTile';

export const IMAGE_PIXELS_METADATA = 'SwiftbookImagePixels';
type ImagePixels = {width: number; height: number};
const resolutions = new WeakMap<object, Promise<Record<string, ImagePixels>>>();
type ImageOps = {paintImageXObject: number; paintInlineImageXObject: number};
const imageDocuments = new WeakMap<object, ImageOps>();
const legacyResolutions = new WeakMap<object, Map<number, Promise<ImagePixels | null>>>();

export function registerImageDocument(pdf: object, name: string, ops: ImageOps) {
  if (/\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i.test(name)) imageDocuments.set(pdf, ops);
}

async function legacyImagePixels(pdf: any, pageNumber: number): Promise<ImagePixels | null> {
  const ops = imageDocuments.get(pdf);
  if (!ops) return null; // Never decode ordinary PDF pages just to inspect images.
  let pages = legacyResolutions.get(pdf);
  if (!pages) { pages = new Map(); legacyResolutions.set(pdf, pages); }
  if (!pages.has(pageNumber)) pages.set(pageNumber, Promise.resolve().then(async () => {
    const page = await pdf.getPage(pageNumber), list = await page.getOperatorList();
    const images: ImagePixels[] = [];
    list.fnArray.forEach((operation: number, index: number) => {
      const args = list.argsArray[index];
      if (operation === ops.paintImageXObject) images.push({width: args[1], height: args[2]});
      else if (operation === ops.paintInlineImageXObject) images.push({width: args[0].width, height: args[0].height});
    });
    if (images.length !== 1) return null;
    const image = images[0];
    return page.rotate % 180 ? {width: image.height, height: image.width} : image;
  }).catch(() => null));
  return pages.get(pageNumber)!;
}

/** Retain original image pixels, either the whole modest image or a native
 * crop of a large photograph. The source grid is page-local, not the screen
 * pixel phase, so sampling onto the display filters the original only once. */
export function nativeImageTile(tile: DetailTile, scale: number, size: ImagePixels, pixels: ImagePixels): DetailTile | null {
  const density = pixels.width / size.width;
  let left = 0, top = 0, right = pixels.width, bottom = pixels.height;
  if (pixels.width * pixels.height > 12_000_000) {
    left = Math.max(0, Math.floor(tile.x / scale * density));
    top = Math.max(0, Math.floor(tile.y / scale * density));
    right = Math.min(pixels.width, Math.ceil((tile.x + tile.width) / scale * density));
    bottom = Math.min(pixels.height, Math.ceil((tile.y + tile.height) / scale * density));
  }
  const width = right - left, height = bottom - top;
  if (width <= 0 || height <= 0 || width * height > 12_000_000) return null;
  return {x: left / density * scale, y: top / density * scale,
    width: width / density * scale, height: height / density * scale, density, pixelsWide: width, pixelsHigh: height};
}

/** Only image documents produced by our importer opt into native raster reuse.
 * Metadata is saved inside the PDF, so reopening from the library/session does
 * not turn an image back into an arbitrarily downsampled PDF preview. */
export async function importedImagePixels(pdf: any, pageNumber: number, size: ImagePixels): Promise<ImagePixels | null> {
  let pending = resolutions.get(pdf);
  if (!pending) {
    pending = Promise.resolve().then(() => pdf.getMetadata?.()).then(metadata => {
      try { return JSON.parse(metadata?.info?.Custom?.[IMAGE_PIXELS_METADATA] || '{}'); }
      catch { return {}; }
    }).catch(() => ({}));
    resolutions.set(pdf, pending);
  }
  const pixels = (await pending)?.[pageNumber] || await legacyImagePixels(pdf, pageNumber);
  if (!pixels || !Number.isSafeInteger(pixels.width) || !Number.isSafeInteger(pixels.height) ||
    pixels.width <= 0 || pixels.height <= 0 || Math.abs(pixels.width / pixels.height - size.width / size.height) > 1e-6) return null;
  return pixels;
}
