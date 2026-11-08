export interface SelectionGlyph { x: number; right: number; text: string }
export interface SelectionLine { x: number; y: number; width: number; height: number; glyphs?: SelectionGlyph[] }
export interface LineGesture { lines: SelectionLine[]; start: number; current: number; textSelection: boolean }
const textLines = new WeakMap<object, Map<number, Promise<SelectionLine[]>>>();

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
    const content = await page.getTextContent();
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
        // Preserve the existing horizontal character range and selected content.
        // Only the vertical bounds now come from the PDF reader's layout box.
        measure.font = `${h}px ${content.styles[item.fontName]?.fontFamily || 'sans-serif'}`;
        const chars = Array.from(item.str as string);
        const advances = chars.map((_, j) => measure.measureText(chars.slice(0, j + 1).join('')).width);
        const total = advances.at(-1) || 1;
        const glyphs = chars.map((text, j) => ({ text,
          x: (x + (advances[j - 1] || 0) / total * Math.abs(item.width)) / viewport.width,
          right: (x + advances[j] / total * Math.abs(item.width)) / viewport.width }));
        runs.push({ baseline, fontHeight: h, box: { glyphs, x: x / viewport.width, y: top / viewport.height,
          width: Math.abs(item.width) / viewport.width, height: (bottom - top) / viewport.height } });
      }
      const groups: typeof runs = [];
      for (const run of runs.sort((a, b) => a.baseline - b.baseline || a.box.x - b.box.x)) {
        const box = run.box;
        const group = groups.find(group => Math.abs(group.baseline - run.baseline) < Math.max(group.fontHeight, run.fontHeight) * 0.15
          && (Math.max(group.box.x, box.x) - Math.min(group.box.x + group.box.width, box.x + box.width)) * viewport.width < Math.max(group.fontHeight, run.fontHeight) * 2.5);
        if (!group) { groups.push({ ...run, box: { ...box } }); continue; }
        const line = group.box;
        const right = Math.max(line.x + line.width, box.x + box.width), bottom = Math.max(line.y + line.height, box.y + box.height);
        line.x = Math.min(line.x, box.x); line.y = Math.min(line.y, box.y);
        line.width = right - line.x; line.height = bottom - line.y;
        line.glyphs = [...(line.glyphs || []), ...(box.glyphs || [])].sort((a, b) => a.x - b.x);
      }
      return groups.map(group => group.box).sort((a, b) => a.y - b.y || a.x - b.x);
    } finally { host.remove(); }
  })().catch(() => []);
  pages.set(pageNumber, pending);
  return pending;
}

// Scanned PDFs and images have no text layer. Sample a small local raster strip
// to estimate glyph bands, never the full high-resolution page or OCR content.
export function rasterSelectionLines(canvas: HTMLCanvasElement | undefined, x: number, y: number, fallbackHeight: number): SelectionLine[] {
  if (!canvas?.width || !canvas.height) return [];
  try {
    const left = 0, right = 1;
    const top = Math.max(0, y - fallbackHeight * 4), bottom = Math.min(1, y + fallbackHeight * 4);
    const sample = document.createElement('canvas');
    sample.width = Math.min(640, Math.ceil((right - left) * canvas.width));
    sample.height = Math.max(1, Math.ceil(sample.width * (bottom - top) * canvas.height / ((right - left) * canvas.width)));
    const ctx = sample.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(canvas, left * canvas.width, top * canvas.height, (right - left) * canvas.width, (bottom - top) * canvas.height, 0, 0, sample.width, sample.height);
    const pixels = ctx.getImageData(0, 0, sample.width, sample.height).data;
    const darkAt = (row: number, col: number) => {
      const i = (row * sample.width + col) * 4;
      return pixels[i + 3] > 128 && pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114 < 175;
    };
    // Find the text column around the initial point. Sampling a whole column
    // gives the same glyph height when dragging forwards or backwards, even
    // when only one end of the sentence contains ascenders/descenders.
    const occupied = Array.from({ length: sample.width }, (_, col) => {
      for (let row = 0; row < sample.height; row++) if (darkAt(row, col)) return true;
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
        if (i - start >= 2 && height < fallbackHeight * 2.5) lines.push({ x: from / sample.width, y: top + start / sample.height * (bottom - top), width: (to - from) / sample.width, height });
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

export function beginLineGesture(lines: SelectionLine[], x: number, y: number, fallbackHeight: number): LineGesture {
  const candidates = lines.filter(line => x >= line.x - 0.02 && x <= line.x + line.width + 0.02);
  const nearest = candidates.reduce<SelectionLine | undefined>((best, line) => !best || Math.abs(y - line.y - line.height / 2) < Math.abs(y - best.y - best.height / 2) ? line : best, undefined);
  if (nearest && Math.abs(y - nearest.y - nearest.height / 2) <= nearest.height * 0.85) {
    const column = lines.filter(line => Math.min(line.x + line.width, nearest.x + nearest.width) > Math.max(line.x, nearest.x))
      .sort((a, b) => a.y - b.y);
    const start = column.indexOf(nearest);
    return { lines: column, start, current: start, textSelection: !!nearest.glyphs?.length };
  }
  const height = Math.max(0.0001, fallbackHeight), pitch = height * 1.25;
  const first = -Math.ceil(y / pitch), last = Math.ceil((1 - y) / pitch);
  const virtual = Array.from({ length: last - first + 1 }, (_, i) => ({ x: 0, y: y + (i + first) * pitch - height / 2, width: 1, height }));
  return { lines: virtual, start: -first, current: -first, textSelection: false };
}

export function moveLineGesture(gesture: LineGesture, y: number): void {
  const center = (i: number) => gesture.lines[i].y + gesture.lines[i].height / 2;
  while (gesture.current + 1 < gesture.lines.length) {
    const i = gesture.current, margin = Math.min(gesture.lines[i].height, gesture.lines[i + 1].height) * 0.2;
    if (y <= (center(i) + center(i + 1)) / 2 + margin) break;
    gesture.current++;
  }
  while (gesture.current > 0) {
    const i = gesture.current, margin = Math.min(gesture.lines[i].height, gesture.lines[i - 1].height) * 0.2;
    if (y >= (center(i) + center(i - 1)) / 2 - margin) break;
    gesture.current--;
  }
}

// Text selection is a range in reading order, rendered as one rectangle per
// line. Free-area selection keeps its existing rectangular behavior.
export function lineSelectionRects(gesture: LineGesture, startX: number, endX: number): { x: number; y: number; width: number; height: number }[] {
  const { lines, start, current } = gesture;
  if (!gesture.textSelection) {
    const a = lines[start], b = lines[current];
    return [{ x: Math.max(0, Math.min(startX, endX)), y: Math.max(0, Math.min(a.y, b.y)),
      width: Math.min(1, Math.max(startX, endX)) - Math.max(0, Math.min(startX, endX)),
      height: Math.min(1, Math.max(a.y + a.height, b.y + b.height)) - Math.max(0, Math.min(a.y, b.y)) }];
  }
  const snap = (line: SelectionLine, x: number) => {
    const edges = [...new Set((line.glyphs || []).flatMap(g => [g.x, g.right]))];
    return edges.reduce((best, edge) => Math.abs(edge - x) < Math.abs(best - x) ? edge : best, edges[0] ?? x);
  };
  const forward = current > start || (current === start && endX >= startX);
  const first = Math.min(start, current), last = Math.max(start, current);
  const from = snap(lines[first], forward ? startX : endX), to = snap(lines[last], forward ? endX : startX);
  return lines.slice(first, last + 1).flatMap((line, i) => {
    const x = i === 0 ? from : line.x;
    const right = first + i === last ? to : line.x + line.width;
    return right > x ? [{ x, y: line.y, width: right - x, height: line.height }] : [];
  });
}
