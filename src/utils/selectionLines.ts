export interface SelectionGlyph { x: number; right: number; text: string }
export interface SelectionLine { x: number; y: number; width: number; height: number; glyphs?: SelectionGlyph[]; source?: 'pdf' | 'ocr' | 'visual'; block?: string; cell?: string; order?: number; aspect?: number; textReliable?: boolean }
export interface LineGesture { lines: SelectionLine[]; start: number; current: number; textSelection: boolean; all?: SelectionLine[]; origin?: SelectionLine; region?: SelectionLine[] }
const textLines = new WeakMap<object, Map<number, Promise<SelectionLine[]>>>();

// A visual/OCR fallback must never bridge native text regions already known
// on that row. Native boxes remain authoritative even across a wide gutter.
export function selectionLineCovered(candidate: SelectionLine, lines: SelectionLine[]): boolean {
  return lines.some(line => {
    const x=Math.min(line.x+line.width,candidate.x+candidate.width)-Math.max(line.x,candidate.x);
    const y=Math.min(line.y+line.height,candidate.y+candidate.height)-Math.max(line.y,candidate.y);
    return x>=Math.min(line.width,candidate.width)*0.7 && y>=Math.min(line.height,candidate.height)*0.5;
  });
}

// PDF.js owns text positioning (including font ascent and page rotation).
// Measure its text-layer boxes once in a neutral, unzoomed coordinate space,
// then convert them to the page viewport. Never infer the vertical box from
// font metadata or from the current viewer's transformed DOM.
export function loadSelectionLines(pdfDoc: any, pageNumber: number): Promise<SelectionLine[]> {
  let pages = textLines.get(pdfDoc);
  if (!pages) { pages = new Map(); textLines.set(pdfDoc, pages); }
  const cached = pages.get(pageNumber);
  if (cached) return cached;
  const pending = (async () => {
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const measureViewport = page.getViewport({ scale: 2, rotation: 0 });
    const content = await page.getTextContent({ includeMarkedContent: true });
    const structure = new Map<string, { block: string; order: number; cell?: string }>();
    let rank = 0;
    const visit = (node: any, block = 'root', cell?: string) => {
      // Cells and paragraphs are semantic boundaries, not PDF stream order.
      const own = /^(P|H[1-6]?|LI|TD|TH)$/.test(node.role || '') ? `${node.role}:${rank++}` : block;
      const ownCell = /^(TD|TH)$/.test(node.role || '') ? own : cell;
      if (node.type === 'content') structure.set(node.id, { block: own, cell: ownCell, order: rank++ });
      for (const child of node.children || []) visit(child, own, ownCell);
    };
    try { const tree = await page.getStructTree?.(); if (tree) visit(tree); } catch { /* Untagged/malformed PDFs use geometry. */ }
    const semantics: ({ block: string; order: number; cell?: string } | undefined)[] = [];
    const marked: (string | undefined)[] = [];
    for (const item of content.items) {
      if (item.type === 'beginMarkedContentProps' || item.type === 'beginMarkedContent') marked.push(item.id);
      else if (item.type === 'endMarkedContent') marked.pop();
      else if (typeof item.str === 'string') semantics.push([...marked].reverse().map(id => structure.get(id!)).find(Boolean));
    }
    if (!content.items.some((item: any) => item.str?.trim())) return [];
    const { pdfjsLib } = await import('./pdfWorker');
    const host = document.createElement('div');
    host.className = 'pdf-text-layer';
    host.setAttribute('aria-hidden', 'true');
    host.inert = true;
    host.style.cssText = 'position:fixed;left:0;top:0;right:auto;bottom:auto;visibility:hidden;pointer-events:none;line-height:1;';
    host.style.setProperty('--scale-factor', String(measureViewport.scale));
    document.body.append(host);
    const divs: HTMLElement[] = [];
    try {
      await pdfjsLib.renderTextLayer({ textContentSource: content, container: host, viewport: measureViewport, textDivs: divs }).promise;
      // PDF.js rounds its layer dimensions on browsers supporting CSS round().
      // Our page layout is fractional; undo only that layer-size rounding before
      // reading percentage-positioned spans, otherwise the measuring scale leaks
      // into normalized page coordinates.
      host.style.width = `${measureViewport.width}px`;
      host.style.height = `${measureViewport.height}px`;
      const origin = host.getBoundingClientRect();
      const items = content.items.filter((item: any) => typeof item.str === 'string');
      const runs: { box: SelectionLine; baseline: number; fontHeight: number }[] = [];
      const measure = document.createElement('canvas').getContext('2d')!;
      for (let i = 0; i < items.length; i++) {
        const item = items[i], div = divs[i];
        if (!item.str?.trim() || !div?.isConnected || !item.width) continue;
        const a = viewport.transform, b = item.transform;
        const xx = a[0] * b[0] + a[2] * b[1], xy = a[1] * b[0] + a[3] * b[1];
        if (Math.abs(xy) > Math.abs(xx) * 0.3) continue;
        const h = Math.hypot(a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3]);
        if (!h) continue;
        const x = a[0] * b[4] + a[2] * b[5] + a[4];
        const baseline = a[1] * b[4] + a[3] * b[5] + a[5];
        const r = div.getBoundingClientRect();
        const corners = [[r.left - origin.left, r.top - origin.top], [r.right - origin.left, r.top - origin.top],
          [r.left - origin.left, r.bottom - origin.top], [r.right - origin.left, r.bottom - origin.top]]
          .map(([cx, cy]) => viewport.convertToViewportPoint(...measureViewport.convertToPdfPoint(cx, cy)));
        const top = Math.min(...corners.map(point => point[1]));
        const bottom = Math.max(...corners.map(point => point[1]));
        // Keep PDF.js vertical line boxes; measure individual character edges below.
        measure.font = `${h}px ${content.styles[item.fontName]?.fontFamily || 'sans-serif'}`;
        const chars = Array.from(item.str as string);
        const advances = chars.map((_, j) => measure.measureText(chars.slice(0, j + 1).join('')).width);
        const total = advances.at(-1) || 1;
        let glyphs = chars.map((text, j) => ({ text,
          x: (x + (advances[j - 1] || 0) / total * Math.abs(item.width)) / viewport.width,
          right: (x + advances[j] / total * Math.abs(item.width)) / viewport.width }));
        // Use the reader's actual character boxes (including embedded font
        // transforms), rather than fitting a substitute font to the whole run.
        if (div.firstChild?.nodeType === Node.TEXT_NODE) {
          const range = document.createRange();
          let offset = 0;
          glyphs = chars.map((text,j) => {
            range.setStart(div.firstChild!,offset); offset += text.length;
            range.setEnd(div.firstChild!,offset);
            const bounds = range.getBoundingClientRect();
            if (!bounds.width) return glyphs[j];
            const ends = [[bounds.left,bounds.top],[bounds.right,bounds.top],[bounds.left,bounds.bottom],[bounds.right,bounds.bottom]]
              .map(([cx,cy]) => viewport.convertToViewportPoint(...measureViewport.convertToPdfPoint(cx-origin.left,cy-origin.top))[0]/viewport.width);
            return {text,x:Math.min(...ends),right:Math.max(...ends)};
          });
        }
        runs.push({ baseline, fontHeight: h, box: { glyphs, x: x / viewport.width, y: top / viewport.height,
          width: Math.abs(item.width) / viewport.width, height: (bottom - top) / viewport.height, source: 'pdf', aspect: viewport.width / viewport.height, ...semantics[i] } });
      }
      const fragments: typeof runs = [];
      for (const run of runs) {
        const chunks: SelectionGlyph[][] = [[]];
        const gs = run.box.glyphs || [];
        for (let j=0;j<gs.length;j++) {
          if (/\s/.test(gs[j].text)) {
            let end=j;
            while(end+1<gs.length && /\s/.test(gs[end+1].text)) end++;
            if ((gs[end].right-gs[j].x)*viewport.width > run.fontHeight*0.9) {
              if(chunks.at(-1)!.length) chunks.push([]);
              j=end; continue;
            }
          }
          chunks.at(-1)!.push(gs[j]);
        }
        for(const glyphs of chunks.filter(c=>c.some(g=>g.text.trim()))) {
          const x=Math.min(...glyphs.map(g=>g.x)),right=Math.max(...glyphs.map(g=>g.right));
          fragments.push({...run,box:{...run.box,x,width:right-x,glyphs}});
        }
      }
      // Establish persistent gutters before joining font runs on a baseline.
      // A large word/font gap on one row is not itself a new column.
      const lanes = new Map<SelectionLine, number>();
      selectionRegions(fragments.map(run=>run.box)).forEach((region,index)=>region.forEach(box=>lanes.set(box,index)));
      const groups: typeof runs = [];
      for (const run of fragments.sort((a, b) => a.baseline - b.baseline || a.box.x - b.box.x)) {
        const box = run.box;
        const group = groups.find(group => Math.abs(group.baseline - run.baseline) < Math.max(group.fontHeight, run.fontHeight) * 0.15
          && lanes.get(group.box) === lanes.get(box)
          && (!group.box.block || !box.block || group.box.block === box.block)
          && (Math.max(group.box.x, box.x) - Math.min(group.box.x + group.box.width, box.x + box.width)) * viewport.width < Math.max(group.fontHeight, run.fontHeight) * 2.5);
        if (!group) { const copy={...box}; lanes.set(copy,lanes.get(box)!); groups.push({ ...run, box: copy }); continue; }
        const line = group.box;
        const right = Math.max(line.x + line.width, box.x + box.width), bottom = Math.max(line.y + line.height, box.y + box.height);
        line.x = Math.min(line.x, box.x); line.y = Math.min(line.y, box.y);
        line.width = right - line.x; line.height = bottom - line.y;
        line.glyphs = [...(line.glyphs || []), ...(box.glyphs || [])].sort((a,b)=>a.x-b.x);
        const joined: SelectionGlyph[] = [];
        for(const glyph of line.glyphs) {
          const previous=joined.at(-1);
          if(previous && glyph.x-previous.right > Math.max(group.fontHeight,run.fontHeight)/viewport.width*0.12
            && previous.text.trim() && glyph.text.trim()) joined.push({x:previous.right,right:glyph.x,text:' '});
          joined.push(glyph);
        }
        line.glyphs=joined;
      }
      return groups.map(group => group.box).sort((a, b) => a.y - b.y || a.x - b.x);
    } finally { host.remove(); }
  })().catch(() => []);
  pages.set(pageNumber, pending);
  return pending;
}

// Visual geometry fills missing OCR rows. It does not invent recognized text.
// Sample the full page so dragging beyond the initial rows cannot skip content.
const rasterCache = new WeakMap<HTMLCanvasElement, { key: string; width: number; height: number; pixels: Uint8ClampedArray }>();
export function rasterSelectionLines(canvas: HTMLCanvasElement | undefined, x: number, y: number, fallbackHeight: number, fullPage = false): SelectionLine[] {
  if (!canvas?.width || !canvas.height) return [];
  try {
    const left = 0, right = 1;
    const top = 0, bottom = 1;
    const sample = document.createElement('canvas');
    sample.width = Math.min(1600, Math.ceil((right - left) * canvas.width));
    sample.height = Math.max(1, Math.ceil(sample.width * (bottom - top) * canvas.height / ((right - left) * canvas.width)));
    const ctx = sample.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];
    const cacheKey = `${canvas.width}:${canvas.height}:${canvas.dataset.renderedScale}`;
    let cached = rasterCache.get(canvas);
    if (!cached || cached.key !== cacheKey) {
    ctx.drawImage(canvas, left * canvas.width, top * canvas.height, (right - left) * canvas.width, (bottom - top) * canvas.height, 0, 0, sample.width, sample.height);
    cached = {key:cacheKey,width:sample.width,height:sample.height,pixels:ctx.getImageData(0,0,sample.width,sample.height).data};
    rasterCache.set(canvas,cached);
    }
    const pixels = cached.pixels;
    const darkAt = (row: number, col: number) => {
      const i = (row * sample.width + col) * 4;
      return pixels[i + 3] > 128 && pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114 < 175;
    };
    // Find the text column around the initial point. Sampling a whole column
    // gives the same glyph height when dragging forwards or backwards, even
    // when only one end of the sentence contains ascenders/descenders.
    const occupied = Array.from({ length: sample.width }, (_, col) => {
      for (let row = (fullPage ? 0 : Math.max(0,Math.floor((y-fallbackHeight*3)*sample.height))); row < (fullPage ? sample.height : Math.min(sample.height,(y+fallbackHeight*3)*sample.height)); row++) if (darkAt(row, col)) return true;
      return false;
    });
    const minGap = Math.max(8, fallbackHeight * canvas.height / canvas.width * sample.width * 1.5);
    const cursor = x * sample.width;
    let from = 0, to = sample.width, gapStart = -1;
    for (let col = 0; col <= occupied.length; col++) {
      if (!occupied[col] && gapStart < 0) gapStart = col;
      if ((occupied[col] || col === occupied.length) && gapStart >= 0) {
        if (col - gapStart >= minGap) {
          if (gapStart <= cursor && col >= cursor) return [];
          if (col < cursor) from = col;
          else if (gapStart > cursor) { to = gapStart; break; }
        }
        gapStart = -1;
      }
    }
    const ink: boolean[] = [];
    for (let row = 0; row < sample.height; row++) {
      let count = 0, changes = 0, darkBefore = false;
      for (let col = from; col < to; col++) {
        const dark = darkAt(row, col);
        if (dark) count++;
        if (dark !== darkBefore) changes++;
        darkBefore = dark;
      }
      ink.push(count > (to - from) * 0.015 && count < (to - from) * 0.65 && changes >= 6);
    }
    for (let i = 1; i < ink.length - 1; i++) if (ink[i - 1] && ink[i + 1]) ink[i] = true;
    const lines: SelectionLine[] = [];
    let start = -1;
    for (let i = 0; i <= ink.length; i++) {
      if (ink[i] && start < 0) start = i;
      if (!ink[i] && start >= 0) {
        const height = (i - start) / sample.height * (bottom - top);
        if (i-start>=2 && height<fallbackHeight*2.5) {
          let inkLeft=to,inkRight=from;
          for(let row=start;row<i;row++) for(let col=from;col<to;col++) if(darkAt(row,col)) {inkLeft=Math.min(inkLeft,col);inkRight=Math.max(inkRight,col+1);}
          if(inkRight>inkLeft) lines.push({x:inkLeft/sample.width,y:start/sample.height,width:(inkRight-inkLeft)/sample.width,height,source:'visual',aspect:canvas.width/canvas.height});
        }
        start = -1;
      }
    }
    const merged: SelectionLine[] = [];
    for (const line of lines) {
      const previous = merged.at(-1);
      const gap = previous ? line.y - previous.y - previous.height : Infinity;
      if (previous && Math.min(previous.height, line.height) < Math.max(previous.height, line.height) * 0.45
        && gap < Math.max(previous.height, line.height) * 0.4
        && line.y + line.height - previous.y < Math.max(previous.height, line.height) * 1.6) {
        previous.height = line.y + line.height - previous.y;
      } else merged.push({ ...line });
    }
    return merged;
  } catch { return []; }
}

// Partition by persistent whitespace, independently of the PDF's item stream.
// Wide headings cannot bridge two columns; short/indented lines keep their lane.
const regionCache = new WeakMap<SelectionLine[], SelectionLine[][]>();
export function selectionRegions(lines: SelectionLine[]): SelectionLine[][] {
  const cached = regionCache.get(lines);
  if (cached) return cached;
  const partition = (items: SelectionLine[], depth: number): SelectionLine[][] => {
    if (items.length < 2 || depth > 8) return [items];
    const left = Math.min(...items.map(l => l.x)), right = Math.max(...items.map(l => l.x + l.width));
    const height = items.map(l => l.height / (l.aspect || 0.75)).sort((a,b) => a-b)[Math.floor(items.length / 2)];
    const edges = [...new Set(items.flatMap(l => [l.x, l.x + l.width]))].sort((a,b) => a-b);
    let best: { cut: number; score: number; a: SelectionLine[]; b: SelectionLine[]; spans: SelectionLine[] } | undefined;
    for (let i = 1; i < edges.length; i++) {
      const gap = edges[i] - edges[i-1];
      if (gap < height * 0.9) continue;
      const cut = (edges[i] + edges[i-1]) / 2;
      const a = items.filter(l => l.x + l.width <= cut), b = items.filter(l => l.x >= cut);
      const spans = items.filter(l => l.x < cut && l.x + l.width > cut);
      if (a.length<2 || b.length<2 || spans.some(l => l.width < (right-left) * 0.72)) continue;
      // A gap between unrelated paragraphs at different heights is not a column.
      const overlap = Math.min(Math.max(...a.map(l => l.y+l.height)), Math.max(...b.map(l => l.y+l.height)))
        - Math.max(Math.min(...a.map(l => l.y)), Math.min(...b.map(l => l.y)));
      if (overlap <= 0) continue;
      const score = gap * Math.min(a.length, b.length) / (1 + spans.length);
      if (!best || score > best.score) best = { cut, score, a, b, spans };
    }
    if (!best) return [items];
    return [...partition(best.a, depth+1), ...partition(best.b, depth+1), ...(best.spans.length ? [best.spans] : [])];
  };
  // Tagged table cells are independent selection regions even with narrow
  // gutters. Paragraph tags alone do not prevent normal multi-paragraph drags.
  const cells = new Map<string, SelectionLine[]>();
  for (const line of lines) if (line.cell) {
    const cell = cells.get(line.cell) || []; cell.push(line); cells.set(line.cell, cell);
  }
  const ordinary = lines.filter(l => !l.cell);
  const regions = [...(ordinary.length ? partition(ordinary,0) : []), ...cells.values()];
  const result = regions.map(region => {
    const geometric = [...region].sort((a,b) => a.y-b.y || a.x-b.x);
    // Trust tags only when their order agrees with the actual progression of
    // this spatial lane. Corrupt tagging must not send a drag to another area.
    const tagged = geometric.every(l => l.order !== undefined);
    if (tagged && geometric.every((l,i) => !i || l.order! >= geometric[i-1].order!)) return [...geometric].sort((a,b) => a.order!-b.order! || a.x-b.x);
    return geometric;
  });
  result.sort((a,b) => {
    const bounds = (region: SelectionLine[]) => ({left:Math.min(...region.map(l=>l.x)),top:Math.min(...region.map(l=>l.y)),bottom:Math.max(...region.map(l=>l.y+l.height))});
    const ar=bounds(a),br=bounds(b);
    if(ar.bottom<=br.top || br.bottom<=ar.top) return ar.top-br.top;
    return ar.left-br.left || ar.top-br.top;
  });
  regionCache.set(lines,result);
  return result;
}

export function beginLineGesture(lines: SelectionLine[], x: number, y: number, fallbackHeight: number): LineGesture {
  const candidates = lines.filter(line => x >= line.x - 0.012 && x <= line.x + line.width + 0.012);
  const nearest = candidates.reduce<SelectionLine | undefined>((best, line) => !best || Math.abs(y-line.y-line.height/2) < Math.abs(y-best.y-best.height/2) ? line : best, undefined);
  if (nearest && Math.abs(y-nearest.y-nearest.height/2) <= nearest.height * 0.85) {
    const region = selectionRegions(lines).find(region => region.includes(nearest))!;
    const start = region.indexOf(nearest);
    return { lines: region, start, current: start, textSelection: true, all: lines, origin: nearest, region };
  }
  const height = Math.max(0.0001, fallbackHeight), pitch = height * 1.25;
  const first = -Math.ceil(y / pitch), last = Math.ceil((1-y)/pitch);
  const virtual = Array.from({length:last-first+1}, (_,i) => ({x:0,y:y+(i+first)*pitch-height/2,width:1,height}));
  return { lines:virtual,start:-first,current:-first,textSelection:false };
}

export function moveLineGesture(gesture: LineGesture, y: number, x?: number): void {
  if (gesture.all && gesture.origin && x !== undefined) {
    const regions = selectionRegions(gesture.all);
    const target = regions.find(region => region.some(l => x >= l.x && x <= l.x+l.width && y >= l.y-l.height*0.3 && y <= l.y+l.height*1.3));
    const originRegion = regions.find(region => region.includes(gesture.origin!))!;
    const previousRegion = regions.find(region => region.some(l => gesture.region?.includes(l)));
    const active = target || previousRegion || originRegion;
    gesture.region = active;
    // Only explicitly hit regions participate; intervening, unrelated blocks
    // are not selected because of adjacent IDs or proximity.
    const next = active.includes(gesture.origin) ? originRegion
      : regions.indexOf(originRegion)<regions.indexOf(active) ? [...originRegion,...active] : [...active,...originRegion];
    if (next.length!==gesture.lines.length || next.some((l,i)=>l!==gesture.lines[i])) {
      gesture.lines=next; gesture.start=next.indexOf(gesture.origin); gesture.current=gesture.start;
    }
    if (!active.includes(gesture.origin)) {
      const hit=active.reduce((a,b)=>Math.abs(y-a.y-a.height/2)<Math.abs(y-b.y-b.height/2)?a:b);
      gesture.current=next.indexOf(hit); return;
    }
  }
  const center = (i:number) => gesture.lines[i].y+gesture.lines[i].height/2;
  while (gesture.current+1 < gesture.lines.length) {
    const i=gesture.current, margin=Math.min(gesture.lines[i].height,gesture.lines[i+1].height)*0.2;
    if (y <= (center(i)+center(i+1))/2+margin) break;
    gesture.current++;
  }
  while (gesture.current>0) {
    const i=gesture.current,margin=Math.min(gesture.lines[i].height,gesture.lines[i-1].height)*0.2;
    if (y >= (center(i)+center(i-1))/2-margin) break;
    gesture.current--;
  }
}

export function lineSelectionRects(gesture: LineGesture, startX: number, endX: number): SelectionLine[] {
  const {lines,start,current}=gesture;
  if (!gesture.textSelection) {
    const a=lines[start],b=lines[current];
    return [{x:Math.max(0,Math.min(startX,endX)),y:Math.max(0,Math.min(a.y,b.y)),
      width:Math.min(1,Math.max(startX,endX))-Math.max(0,Math.min(startX,endX)),
      height:Math.min(1,Math.max(a.y+a.height,b.y+b.height))-Math.max(0,Math.min(a.y,b.y))}];
  }
  const snap=(line:SelectionLine,x:number) => {
    const edges=[...new Set((line.glyphs||[]).flatMap(g=>[g.x,g.right]))];
    return edges.reduce((best,edge)=>Math.abs(edge-x)<Math.abs(best-x)?edge:best,edges[0]??Math.max(line.x,Math.min(line.x+line.width,x)));
  };
  const forward=current>start || (current===start && endX>=startX);
  const first=Math.min(start,current),last=Math.max(start,current);
  const from=snap(lines[first],forward?startX:endX),to=snap(lines[last],forward?endX:startX);
  return lines.slice(first,last+1).flatMap((line,i)=> {
    const x=i===0?from:line.x,right=first+i===last?to:line.x+line.width;
    const glyphs=line.glyphs?.filter(g=>(g.x+g.right)/2>=x && (g.x+g.right)/2<=right);
    return right>x?[{...line,x,width:right-x,glyphs}]:[];
  });
}

export function selectedLineText(gesture: LineGesture, startX: number, endX: number, minimumWidth = 0): { text: string; textComplete: boolean } {
  const lines = lineSelectionRects(gesture,startX,endX).filter(l => Math.min(1,l.x+l.width)-Math.max(0,l.x)>minimumWidth);
  return { text: lines.map(l => l.glyphs?.map(g=>g.text).join('') || '').join('\n'),
    textComplete: lines.length > 0 && lines.every(l=>!!l.glyphs?.length && l.source !== 'visual' && l.textReliable !== false) };
}
