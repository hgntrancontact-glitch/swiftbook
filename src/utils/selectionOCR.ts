import { canvasViewportTransform } from './pageCoordinates';
import { rasterSelectionLines, type SelectionLine } from './selectionLines';
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
    // Recognition may finish after another pinch/page change has started.
    // Do not run the pixel-analysis pass on the input-critical thread then.
    if (!isRelevant()) { cache!.delete(page); return []; }
    const lines: SelectionLine[] = [];
    for (const block of data.blocks || []) for (const paragraph of block.paragraphs) for (const line of paragraph.lines) {
      if (!line.text.trim()) continue;
      const { x0, y0, x1, y1 } = line.bbox;
      const glyphs = line.words.flatMap((word,index) => [...(index ? [{x:line.words[index-1].bbox.x1/image.width,right:word.bbox.x0/image.width,text:" "}] : []), ...word.symbols.map(symbol => ({
        x: symbol.bbox.x0 / image.width, right: symbol.bbox.x1 / image.width, text: symbol.text,
      }))]);
      lines.push({ x: x0 / image.width, y: y0 / image.height, width: (x1 - x0) / image.width, height: (y1 - y0) / image.height, glyphs, source: 'ocr', textReliable: line.confidence >= 35, aspect: image.width / image.height });
    }
    const heights=lines.map(l=>l.height).sort((a,b)=>a-b);
    const height=heights[Math.floor(heights.length/2)] || 0.015;
    // Ink geometry decides the line bounds, recognition supplies its text.
    // OCR line boxes can contain a detached margin speck or several cards.
    const visual: SelectionLine[]=[];
    for(const x of [0.25,0.5,0.75]) for(const band of rasterSelectionLines(image,x,0.5,height,true)) {
      if(!visual.some(v=>Math.abs(v.x-band.x)<0.002 && Math.abs(v.y-band.y)<0.002 && Math.abs(v.width-band.width)<0.002)) visual.push(band);
    }
    const refined: SelectionLine[]=[];
    for(const line of lines) {
      const bands=visual.filter(v=> {
        const oy=Math.min(v.y+v.height,line.y+line.height)-Math.max(v.y,line.y);
        const ox=Math.min(v.x+v.width,line.x+line.width)-Math.max(v.x,line.x);
        return oy>=Math.min(v.height,line.height)*0.55 && ox>=Math.min(v.width,line.width)*0.5;
      });
      if(!bands.length) {refined.push(line);continue;}
      const groups: SelectionLine[]=[];
      for(const band of bands.sort((a,b)=>a.x-b.x)) {
        const previous=groups.at(-1);
        const gap=previous ? band.x-previous.x-previous.width : Infinity;
        const sameBaseline=previous && Math.abs(band.y+band.height-previous.y-previous.height)<Math.max(band.height,previous.height)*0.6;
        const inkBetween=previous && line.glyphs?.some(g=>g.text.trim() && g.x>=previous.x+previous.width && g.right<=band.x);
        if(previous && sameBaseline && (inkBetween || gap<Math.max(previous.height,band.height)/(line.aspect || .75)*1.5)) {
          const right=Math.max(previous.x+previous.width,band.x+band.width),bottom=Math.max(previous.y+previous.height,band.y+band.height);
          previous.y=Math.min(previous.y,band.y);previous.height=bottom-previous.y;previous.width=right-previous.x;
        } else groups.push({...band});
      }
      for(const band of groups) {
        const glyphs=line.glyphs?.filter(g=>(g.x+g.right)/2>=band.x-0.001 && (g.x+g.right)/2<=band.x+band.width+0.001);
        if(!glyphs?.some(g=>/[\p{L}\p{N}]/u.test(g.text))) continue;
        refined.push({...line,...band,source:'ocr',glyphs});
      }
    }
    for(const band of visual) if(!refined.some(l=> {
      const oy=Math.min(l.y+l.height,band.y+band.height)-Math.max(l.y,band.y);
      const ox=Math.min(l.x+l.width,band.x+band.width)-Math.max(l.x,band.x);
      return oy>=Math.min(l.height,band.height)*0.5 && ox>=Math.min(l.width,band.width)*0.6;
    })) refined.push(band);
    return refined.sort((a,b)=>a.y-b.y || a.x-b.x);
  }).catch(error => { cache!.delete(page); console.warn('Could not recognize selection lines', error); return []; }).finally(() => { image.width = image.height = 0; });
  queue = pending;
  cache.set(page, pending);
  return pending;
}
