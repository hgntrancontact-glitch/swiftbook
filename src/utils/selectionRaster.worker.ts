import { rasterImageSelectionLines, type RasterSelectionImage, type SelectionLine } from './selectionLines';

// Pixel projection and slope fitting run outside the interaction thread.
self.onmessage = (event: MessageEvent<{ id: number; bitmap: ImageBitmap; height: number }>) => {
  const { id, bitmap, height } = event.data;
  try {
    const ratio = Math.min(1,1600/bitmap.width,2400/bitmap.height);
    const canvas = new OffscreenCanvas(Math.max(1,Math.round(bitmap.width*ratio)),Math.max(1,Math.round(bitmap.height*ratio)));
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const image: RasterSelectionImage = { key: String(id), width: canvas.width, height: canvas.height,
      pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data, fits: new Map(), slopes: new Map() };
    const lines: SelectionLine[] = [];
    for (const x of [.25, .5, .75]) for (const line of rasterImageSelectionLines(image, x, .5, height, true)) {
      if (!lines.some(l => Math.abs(l.x-line.x)<.002 && Math.abs(l.y-line.y)<.002 && Math.abs(l.width-line.width)<.002)) lines.push(line);
    }
    self.postMessage({ id, lines });
  } catch { self.postMessage({ id, lines: [] }); }
  finally { bitmap.close(); }
};
