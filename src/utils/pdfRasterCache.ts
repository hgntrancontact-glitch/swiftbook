import type { PageSize } from './pdfViewport';

type Raster = { pdfDoc: any; bitmap: ImageBitmap; density: number; size: PageSize };
const rasters = new Map<string, Raster>();
const snapshots = new Map<string, number>();
const PIXEL_BUDGET = 24_000_000;
let revision = 0;
let pendingPixels = 0;

export function getRasterCacheUsage() {
  return { entries: rasters.size, pixels: [...rasters.values()].reduce((sum, raster) => sum + raster.bitmap.width * raster.bitmap.height, 0), pendingPixels };
}

export function rasterDensity(size: PageSize, scale: number) {
  return Math.min(scale * Math.min(2.5, window.devicePixelRatio || 1),
    Math.sqrt(16_000_000 / Math.max(1, size.width * size.height)),
    12_000 / Math.max(size.width, size.height, 1));
}

export function getPageRaster(key: string, pdfDoc: any) {
  const entry = rasters.get(key);
  if (!entry || entry.pdfDoc !== pdfDoc) return null;
  rasters.delete(key);
  rasters.set(key, entry);
  return entry;
}

// Snapshot asynchronously, outside the visible-buffer swap. Retain the sharpest
// raster, bounded by actual pixel memory, for mode changes and zooming back out.
export function rememberPageRaster(key: string, pdfDoc: any, source: HTMLCanvasElement, density: number, size: PageSize) {
  if (typeof createImageBitmap !== 'function') return;
  if ((getPageRaster(key, pdfDoc)?.density || 0) >= density) return;
  const pixels = source.width * source.height;
  if (pendingPixels + pixels > PIXEL_BUDGET) return;
  pendingPixels += pixels;
  const token = ++revision;
  snapshots.set(key, token);
  let snapshot: Promise<ImageBitmap>;
  try { snapshot = createImageBitmap(source); }
  catch { pendingPixels -= pixels; snapshots.delete(key); return; }
  void snapshot.then((bitmap) => {
    if (snapshots.get(key) !== token) { bitmap.close(); return; }
    snapshots.delete(key);
    const old = rasters.get(key);
    if (old?.pdfDoc === pdfDoc && old.density >= density) { bitmap.close(); return; }
    old?.bitmap.close();
    rasters.delete(key);
    rasters.set(key, { pdfDoc, bitmap, density, size });
    let pixels = [...rasters.values()].reduce((sum, raster) => sum + raster.bitmap.width * raster.bitmap.height, 0);
    for (const [oldKey, raster] of rasters) {
      if (pixels <= PIXEL_BUDGET) break;
      pixels -= raster.bitmap.width * raster.bitmap.height;
      raster.bitmap.close();
      rasters.delete(oldKey);
    }
  }).catch(() => { if (snapshots.get(key) === token) snapshots.delete(key); })
    .finally(() => { pendingPixels -= pixels; });
}

export function clearPageRasters(docId: string) {
  for (const [key, raster] of rasters) {
    if (key.startsWith(`${docId}_`)) { raster.bitmap.close(); rasters.delete(key); }
  }
  for (const key of snapshots.keys()) if (key.startsWith(`${docId}_`)) snapshots.delete(key);
}
