import { rasterSelectionLines, type SelectionLine } from './selectionLines';

let worker: Worker | undefined;
let workerDoc: object | undefined;
let sequence = 0;
const pending = new Map<number, (lines: SelectionLine[]) => void>();
const pages = new WeakMap<object, Map<number, Promise<SelectionLine[]>>>();

export function loadVisualSelectionLines(doc: object, page: number, canvas: HTMLCanvasElement, height: number): Promise<SelectionLine[]> {
  let cache = pages.get(doc);
  if (!cache) { cache = new Map(); pages.set(doc, cache); }
  const known = cache.get(page);
  if (known) return known;
  const promise = (async () => {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function') {
      const lines: SelectionLine[] = [];
      for (const x of [.25,.5,.75]) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        lines.push(...rasterSelectionLines(canvas,x,.5,height,true));
      }
      return lines;
    }
    const bitmap = await createImageBitmap(canvas);
    // At most two visible-page analyses. A new document or a fast scroll must
    // not leave a queue of obsolete bitmap snapshots occupying CPU/memory.
    if (worker && (workerDoc !== doc || pending.size >= 2)) {
      worker.terminate(); worker = undefined;
      for (const resolve of pending.values()) resolve([]);
      pending.clear();
    }
    workerDoc = doc;
    if (!worker) {
      worker = new Worker(new URL('./selectionRaster.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = event => { pending.get(event.data.id)?.(event.data.lines); pending.delete(event.data.id); };
      worker.onerror = () => {
        for (const resolve of pending.values()) resolve([]);
        pending.clear(); worker?.terminate(); worker = undefined;
      };
    }
    const id = ++sequence;
    return new Promise<SelectionLine[]>(resolve => {
      pending.set(id, resolve);
      try { worker!.postMessage({ id, bitmap, height }, [bitmap]); }
      catch { pending.delete(id); bitmap.close(); resolve([]); }
    });
  })().catch(() => [] as SelectionLine[]);
  cache.set(page,promise);
  void promise.then(lines => { if (!lines.length) cache!.delete(page); });
  return promise;
}
