import { canvasViewportTransform } from './pageCoordinates';
import type { SelectionLine } from './selectionLines';
import type { Worker } from 'tesseract.js';

// One lazy local worker. No document/image bytes leave the browser. The queue
// is intentionally bounded to one running page; stale queued pages are skipped.
let worker: Promise<Worker> | undefined;
let queue: Promise<unknown> = Promise.resolve();
const pages = new WeakMap<object, Map<number, Promise<SelectionLine[]>>>();
export function loadOCRLines(doc: object, page: number, source: HTMLCanvasElement, isRelevant: () => boolean): Promise<SelectionLine[]> {
  let cache = pages.get(doc);
  if (!cache) { cache = new Map(); pages.set(doc, cache); }
  const cached = cache.get(page);
  if (cached) return cached;
  // Snapshot before the PDF renderer reuses its backing canvas.
  const image = document.createElement('canvas');
  const ratio = Math.min(1, 2200 / Math.max(source.width, source.height));
  image.width = Math.max(1, Math.round(source.width * ratio));
  image.height = Math.max(1, Math.round(source.height * ratio));
  image.getContext('2d')!.drawImage(source, 0, 0, image.width, image.height);
  const pending = queue.then(async () => {
    if (!isRelevant()) { cache!.delete(page); return []; }
    if (!worker) worker = import('tesseract.js').then(module => {
      const createWorker = module.createWorker || module.default.createWorker;
      const base = new URL(`${import.meta.env.BASE_URL}ocr/`, location.origin).href;
      return createWorker('vie+eng', 1, { workerPath: `${base}worker.min.js`, corePath: base, langPath: base, workerBlobURL: false });
    }).catch(error => { worker = undefined; throw error; });
    const engine = await worker;
    if (!isRelevant()) { cache!.delete(page); return []; }
    // OCR geometry must not depend on the zoom where the page was first read.
    // Use the same offscreen viewport whether the first gesture happens at
    // 20% or 400%; backing-canvas rounding must not become page coordinates.
    if ('getPage' in doc) {
      const pageProxy = await (doc as { getPage: (n: number) => Promise<any> }).getPage(page);
      const base = pageProxy.getViewport({ scale: 1 });
      const viewport = pageProxy.getViewport({ scale: 2200 / Math.max(base.width, base.height) });
      image.width = Math.ceil(viewport.width); image.height = Math.ceil(viewport.height);
      const task = pageProxy.render({ canvasContext: image.getContext('2d'), viewport, background: '#fff',
        transform: canvasViewportTransform(viewport, image) });
      const check = setInterval(() => { if (!isRelevant()) task.cancel(); }, 100);
      try { await task.promise; } finally { clearInterval(check); }
    }
    if (!isRelevant()) { cache!.delete(page); return []; }
    const { data } = await engine.recognize(image, { rotateAuto: false, rotateRadians: 0 }, { blocks: true, text: true });
    const lines: SelectionLine[] = [];
    for (const block of data.blocks || []) for (const paragraph of block.paragraphs) for (const line of paragraph.lines) {
      if (!line.text.trim() || line.confidence < 35) continue;
      const { x0, y0, x1, y1 } = line.bbox;
      const glyphs = line.words.flatMap(word => word.symbols.map(symbol => ({
        x: symbol.bbox.x0 / image.width, right: symbol.bbox.x1 / image.width, text: symbol.text,
      })));
      lines.push({ x: x0 / image.width, y: y0 / image.height, width: (x1 - x0) / image.width, height: (y1 - y0) / image.height, glyphs });
    }
    return lines.sort((a, b) => a.y - b.y || a.x - b.x);
  }).catch(error => { cache!.delete(page); console.warn('Could not recognize selection lines', error); return []; }).finally(() => { image.width = image.height = 0; });
  queue = pending;
  cache.set(page, pending);
  return pending;
}
