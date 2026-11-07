import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import {
  HighlightAnnotation,
  TextNoteAnnotation,
  DrawingStroke,
  BoxAnnotation,
  FreeTextAnnotation,
  HIGHLIGHT_COLORS,
  NOTE_PAPER_COLORS,
  DrawingPoint,
  NormalizedRect,
} from '../types';

export interface ExportOptions {
  pdfDoc: any;
  bookTitle: string;
  selectedPages: number[];
  format: 'pdf' | 'png' | 'jpeg';
  resolutionScale?: number; // 1.5, 2.0 (default), 3.0
  includeAnnotations?: boolean; // default true
  highlights: HighlightAnnotation[];
  textNotes: TextNoteAnnotation[];
  drawings: DrawingStroke[];
  boxes: BoxAnnotation[];
  freeTexts: FreeTextAnnotation[];
  screenScale?: number;
  onProgress?: (current: number, total: number, statusText: string) => void;
}

/**
 * Parse page range string into an array of sorted unique page numbers.
 * Examples: "150", "150-156", "1, 3, 5-8", "1-5, 10, 15-20"
 */
export function parsePageRange(rangeStr: string, totalPages: number): number[] {
  if (!rangeStr || !rangeStr.trim()) {
    // Default to all pages
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pagesSet = new Set<number>();
  const parts = rangeStr.split(/[,;\s]+/).filter(Boolean);

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        const from = Math.max(1, Math.min(start, end));
        const to = Math.min(totalPages, Math.max(start, end));
        for (let p = from; p <= to; p++) {
          pagesSet.add(p);
        }
      }
    } else {
      const p = parseInt(part, 10);
      if (!isNaN(p) && p >= 1 && p <= totalPages) {
        pagesSet.add(p);
      }
    }
  }

  const result = Array.from(pagesSet).sort((a, b) => a - b);
  return result.length > 0 ? result : [1];
}

/**
 * Helper to merge contiguous/overlapping line rects into unified solid blocks without seam lines
 * (Matches HighlightOverlay.tsx)
 */
function mergeContiguousRects(rects: NormalizedRect[]): NormalizedRect[] {
  if (!rects || rects.length <= 1) return rects || [];

  const sorted = [...rects].sort((a, b) => a.y - b.y);
  const merged: NormalizedRect[] = [];

  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const currentBottom = current.y + current.height;
    const touchesVertically = next.y <= currentBottom + 0.6;

    const currentRight = current.x + current.width;
    const nextRight = next.x + next.width;
    const similarX = Math.abs(current.x - next.x) < 8;
    const similarRight = Math.abs(currentRight - nextRight) < 8;
    const horizontallyOverlaps = Math.max(current.x, next.x) < Math.min(currentRight, nextRight);

    if (touchesVertically && (similarX || similarRight || horizontallyOverlaps)) {
      const newX = Math.min(current.x, next.x);
      const newY = Math.min(current.y, next.y);
      const newRight = Math.max(currentRight, nextRight);
      const newBottom = Math.max(currentBottom, next.y + next.height);

      current = {
        x: newX,
        y: newY,
        width: newRight - newX,
        height: newBottom - newY,
      };
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);
  return merged;
}

/**
 * Draw stroke on canvas context (supports straight polygon edges for smart shapes)
 */
function drawSmoothStroke(
  ctx: CanvasRenderingContext2D,
  points: DrawingPoint[],
  w: number,
  h: number,
  isPolygon = false
) {
  if (points.length < 2) return;

  const p0 = { x: (points[0].x / 100) * w, y: (points[0].y / 100) * h };

  ctx.moveTo(p0.x, p0.y);

  if (points.length === 2 || isPolygon) {
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo((points[i].x / 100) * w, (points[i].y / 100) * h);
    }
    return;
  }

  for (let i = 1; i < points.length - 1; i++) {
    const curr = { x: (points[i].x / 100) * w, y: (points[i].y / 100) * h };
    const next = { x: (points[i + 1].x / 100) * w, y: (points[i + 1].y / 100) * h };
    const midX = (curr.x + next.x) / 2;
    const midY = (curr.y + next.y) / 2;
    ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
  }

  const last = {
    x: (points[points.length - 1].x / 100) * w,
    y: (points[points.length - 1].y / 100) * h,
  };
  ctx.lineTo(last.x, last.y);
}

/**
 * Safely extract formatted text lines from HTML or plain text strings
 * Preserves intentional empty lines and spaces without leaking tags
 */
function extractCleanLines(htmlOrText: string): string[] {
  if (!htmlOrText) return [];
  if (!htmlOrText.includes('<') && !htmlOrText.includes('&')) {
    return htmlOrText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  }

  if (typeof document !== 'undefined') {
    try {
      const container = document.createElement('div');
      container.style.whiteSpace = 'pre-wrap';
      container.innerHTML = htmlOrText;

      // Convert <br> tags to newline
      const brs = container.querySelectorAll('br');
      brs.forEach((br) => {
        br.replaceWith('\n');
      });

      // Convert block elements to newline
      const blocks = container.querySelectorAll('div, p, li, h1, h2, h3, h4, h5, h6, tr');
      blocks.forEach((block) => {
        block.appendChild(document.createTextNode('\n'));
      });

      const text = (container.textContent || container.innerText || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');

      const lines = text.split('\n');
      if (lines.length > 1 && lines[lines.length - 1] === '') {
        lines.pop();
      }
      return lines;
    } catch (_) {}
  }

  // Fallback regex parser for non-DOM contexts
  const clean = htmlOrText
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const lines = clean.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

/**
 * Break a single line of text into wrapped lines matching CSS word-break & overflow-wrap
 */
function wrapTextLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  if (!text) return [''];
  if (maxWidth <= 0 || ctx.measureText(text).width <= maxWidth) {
    return [text];
  }

  const words = text.split(' ');
  const result: string[] = [];
  let currentLine = '';

  for (let w = 0; w < words.length; w++) {
    const word = words[w];
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        result.push(currentLine);
        currentLine = '';
      }
      // If a single word is wider than maxWidth, break character by character
      if (ctx.measureText(word).width > maxWidth) {
        let chunk = '';
        for (let c = 0; c < word.length; c++) {
          const char = word[c];
          if (ctx.measureText(chunk + char).width <= maxWidth) {
            chunk += char;
          } else {
            if (chunk) result.push(chunk);
            chunk = char;
          }
        }
        currentLine = chunk;
      } else {
        currentLine = word;
      }
    }
  }
  if (currentLine) {
    result.push(currentLine);
  }
  return result.length > 0 ? result : [text];
}

/**
 * Standard SVG shape paths for FreeTextAnnotation backgrounds (matching ShapeRenderer in FreeTextLayer.tsx)
 */
const SVG_SHAPE_PATHS: Record<string, string[]> = {
  note: ['M4 4h16v11l-5 5H4z', 'M15 15h5v5'],
  rectangle: ['M2 2h20v20H2z'],
  rounded: ['M6 2h12a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4z'],
  oval: ['M12 6c5.52 0 10 2.69 10 6s-4.48 6-10 6-10-2.69-10-6 4.48-6 10-6z'],
  diamond: ['M12 2l10 10-10 10L2 12z'],
  circle: ['M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z'],
  cylinder: ['M12 3c4.42 0 8 1.34 8 3s-3.58 3-8 3-8-1.34-8-3 3.58-3 8-3z', 'M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6z'],
  'arrow-right-ribbon': ['M4 6h12l4 6-4 6H4l4-6-4-6z'],
  'arrow-left-ribbon': ['M20 6H8L4 12l4 6h12l-4-6 4-6z'],
  parallelogram: ['M6 18l4-12h12l-4 12z'],
  trapezoid: ['M6 6h12l4 12H2z'],
  'speech-round': ['M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z'],
  'speech-square': ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  'triangle-right': ['M4 20h16L4 4v16z'],
  triangle: ['M12 2L2 20h20z'],
  star: ['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'],
  hexagon: ['M12 2l9 5v10l-9 5-9-5V7l9-5z'],
  pentagon: ['M12 2l10 7v13H2V9l10-7z'],
  'double-circle': ['M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9z', 'M12 7a5 5 0 1 0 5 5 5 5 0 0 0-5-5z'],
  'arrow-left': ['M10 18v-4h10v-4H10V6l-7 6 7 6z'],
  'arrow-right': ['M14 18v-4H4v-4h10V6l7 6-7 6z'],
  'arrow-both': ['M7 10h10V7l4 5-4 5v-3H7v3l-4-5 4-5v3z'],
  cloud: ['M17.5 19c2.5 0 4.5-2 4.5-4.5S20 10 17.5 10c-.5-3.5-3.5-6-7-6S4 6.5 3.5 10C1 10 0 12 0 14.5S2 19 4.5 19h13z'],
  'brace-left': ['M8 4v4c0 2-2 2-2 4s2 2 2 4v4', 'M14 8h6M14 12h6M14 16h6'],
  'brace-right': ['M16 4v4c0 2 2 2 2 4s-2 2-2 4v4', 'M4 8h6M4 12h6M4 16h6'],
  cross: ['M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7V3z'],
  cube: [
    'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
    'M3.27 6.96L12 12.01l8.73-5.05',
    'M12 22.08V12',
  ],
};

/**
 * Draw custom shape path on 2D Canvas with exact vector fidelity
 */
function drawShapeOnCanvas(
  ctx: CanvasRenderingContext2D,
  shape: string,
  x: number,
  y: number,
  w: number,
  h: number,
  bgColor: string,
  bgOpacity: number = 1
) {
  if (!bgColor || bgColor === 'transparent') return;

  ctx.save();
  ctx.fillStyle = bgColor;
  ctx.globalAlpha = bgOpacity;

  if (shape === 'none' || shape === 'text' || !shape) {
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    return;
  }

  const paths = SVG_SHAPE_PATHS[shape];
  if (paths && typeof Path2D !== 'undefined') {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(w / 24, h / 24);
    paths.forEach((pStr) => {
      const path = new Path2D(pStr);
      ctx.fill(path);
    });
    ctx.restore();
  } else {
    ctx.fillRect(x, y, w, h);
  }

  ctx.restore();
}

/**
 * Helper to draw Lucide vector icon paths crisply on Canvas 2D
 */
function drawLucideIcon(
  ctx: CanvasRenderingContext2D,
  pathData: string,
  x: number,
  y: number,
  size: number,
  strokeColor: string,
  lineWidth: number = 1.5
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth * (24 / size);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  try {
    const p = new Path2D(pathData);
    ctx.stroke(p);
  } catch (_) {}
  ctx.restore();
}

interface RichSpan {
  text: string;
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  isStrikethrough: boolean;
  color: string;
  bgColor?: string;
  fontSize: number;
}

interface RichLineBlock {
  spans: RichSpan[];
  bulletPrefix?: string;
}

function parseHtmlToRichSpans(
  html: string,
  baseStyle: {
    color: string;
    fontSize: number;
    isBold: boolean;
    isItalic: boolean;
    isUnderline: boolean;
    isStrikethrough: boolean;
  },
  scale: number = 1
): RichLineBlock[] {
  if (!html) return [];
  const lineBlocks: RichLineBlock[] = [];
  let currentSpans: RichSpan[] = [];

  const flush = (bullet?: string) => {
    lineBlocks.push({ spans: currentSpans, bulletPrefix: bullet });
    currentSpans = [];
  };

  if (!html.includes('<') && !html.includes('&')) {
    const raw = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    return raw.map((line) => ({
      spans: line ? [{ text: line, ...baseStyle }] : [],
    }));
  }

  if (typeof DOMParser === 'undefined') {
    const raw = extractCleanLines(html);
    return raw.map((line) => ({
      spans: line ? [{ text: line, ...baseStyle }] : [],
    }));
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const walk = (
    node: Node,
    style: typeof baseStyle & { bgColor?: string },
    listPrefix?: string
  ) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const rawText = (node.textContent || '').replace(/\u00a0/g, ' ');
      if (rawText) {
        if (rawText.includes('\n')) {
          const parts = rawText.split('\n');
          for (let p = 0; p < parts.length; p++) {
            if (parts[p]) {
              currentSpans.push({ text: parts[p], ...style });
            }
            if (p < parts.length - 1) {
              flush(listPrefix);
            }
          }
        } else {
          currentSpans.push({ text: rawText, ...style });
        }
      }
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      if (tag === 'br') {
        flush(listPrefix);
        return;
      }

      const nextStyle = { ...style };
      if (tag === 'b' || tag === 'strong' || el.style.fontWeight === 'bold' || parseInt(el.style.fontWeight) >= 600) {
        nextStyle.isBold = true;
      }
      if (tag === 'i' || tag === 'em' || el.style.fontStyle === 'italic') {
        nextStyle.isItalic = true;
      }
      if (tag === 'u' || el.style.textDecoration?.includes('underline') || tag === 'a') {
        nextStyle.isUnderline = true;
      }
      if (tag === 's' || tag === 'strike' || tag === 'del' || el.style.textDecoration?.includes('line-through')) {
        nextStyle.isStrikethrough = true;
      }
      if (tag === 'a') {
        nextStyle.color = '#2563eb';
      }

      // Parse custom per-span font size (data-size, data-orig-size, inline style font-size, font size attribute)
      const dataOrig = el.getAttribute('data-orig-size');
      const dataSize = el.getAttribute('data-size');
      let parsed = dataOrig ? parseFloat(dataOrig) : (dataSize ? parseFloat(dataSize) : NaN);
      if (isNaN(parsed) && el.style.fontSize) {
        const match = el.style.fontSize.match(/(\d+(?:\.\d+)?)\s*px/);
        if (match) {
          parsed = parseFloat(match[1]);
        } else {
          parsed = parseFloat(el.style.fontSize);
        }
      }
      if (isNaN(parsed) && el.getAttribute('size')) {
        const fontAttr = el.getAttribute('size');
        const fontSizes: Record<string, number> = {
          '1': 10, '2': 13, '3': 16, '4': 18, '5': 24, '6': 32, '7': 48
        };
        if (fontAttr && fontSizes[fontAttr]) parsed = fontSizes[fontAttr];
      }
      if (!isNaN(parsed) && parsed > 0) {
        nextStyle.fontSize = parsed * scale;
      }

      let colorAttr = el.getAttribute('color') || el.style.color;
      if (!colorAttr && el.hasAttribute('style')) {
        const styleStr = el.getAttribute('style') || '';
        const colorMatch = styleStr.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
        if (colorMatch && colorMatch[1]) {
          colorAttr = colorMatch[1].trim();
        }
      }
      if (colorAttr && colorAttr !== 'inherit') {
        nextStyle.color = colorAttr;
      }

      let bgAttr = el.style.backgroundColor || el.style.background;
      if (!bgAttr && el.hasAttribute('style')) {
        const styleStr = el.getAttribute('style') || '';
        const bgMatch = styleStr.match(/background(?:-color)?\s*:\s*([^;]+)/i);
        if (bgMatch && bgMatch[1]) {
          bgAttr = bgMatch[1].trim();
        }
      }
      if (!bgAttr && el.hasAttribute('bgcolor')) {
        bgAttr = el.getAttribute('bgcolor') || '';
      }
      if (bgAttr && bgAttr !== 'transparent' && bgAttr !== 'inherit') {
        nextStyle.bgColor = bgAttr;
      } else if (tag === 'mark') {
        nextStyle.bgColor = nextStyle.bgColor || '#fef08a';
      }

      if (tag === 'ul' || tag === 'ol') {
        const isOl = tag === 'ol';
        let idx = 1;
        el.childNodes.forEach((child) => {
          if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).tagName.toLowerCase() === 'li') {
            const prefix = isOl ? `${idx++}. ` : '• ';
            child.childNodes.forEach((liC) => walk(liC, nextStyle, prefix));
            flush(prefix);
          } else {
            walk(child, nextStyle);
          }
        });
        return;
      }

      const isBlock = ['div', 'p', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'].includes(tag);
      if (isBlock && currentSpans.length > 0) {
        flush();
      }

      el.childNodes.forEach((child) => walk(child, nextStyle, listPrefix));

      if (isBlock && currentSpans.length > 0) {
        flush();
      }
    }
  };

  doc.body.childNodes.forEach((c) => walk(c, baseStyle));
  if (currentSpans.length > 0) {
    flush();
  }

  // Remove trailing empty line blocks so trailing breaks don't inflate background height
  while (lineBlocks.length > 1 && lineBlocks[lineBlocks.length - 1].spans.length === 0 && !lineBlocks[lineBlocks.length - 1].bulletPrefix) {
    lineBlocks.pop();
  }

  return lineBlocks;
}

/**
 * Native 2D Canvas FreeText renderer matching FreeTextLayer.tsx CSS & metrics
 */
function renderFreeTextOnCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scale: number,
  canvasToWebRatio: number,
  ft: FreeTextAnnotation
) {
  const tx = (ft.x / 100) * width;
  const ty = (ft.y / 100) * height;
  const baseFontSize = Math.max(0.5, (ft.fontSize || 16) * scale);
  const baseLineHeight = baseFontSize * 1.25;
  const boxPaddingX = 1 * canvasToWebRatio;

  const baseStyle = {
    color: ft.color || '#1D2129',
    fontSize: baseFontSize,
    isBold: !!ft.isBold,
    isItalic: !!ft.isItalic,
    isUnderline: !!ft.isUnderline,
    isStrikethrough: !!ft.isStrikethrough,
  };

  const lineBlocks = parseHtmlToRichSpans(ft.text || '', baseStyle, scale);
  if (lineBlocks.length === 0 && (!ft.bgColor || ft.bgColor === 'transparent')) return;

  const maxPageWidthPx = Math.max(5, ((100 - ft.x) / 100) * width);
  const forcedBoxWidth = ft.width ? (ft.width / 100) * width : undefined;
  const wrapLimit = forcedBoxWidth ?? maxPageWidthPx;

  // Measure and wrap spans into physical rendered lines
  interface MeasuredLine {
    spans: Array<RichSpan & { width: number }>;
    bulletPrefix?: string;
    bulletWidth: number;
    totalWidth: number;
    lineHeight: number;
  }

  const measuredLines: MeasuredLine[] = [];

  lineBlocks.forEach((block) => {
    let bulletW = 0;
    if (block.bulletPrefix) {
      ctx.font = `normal ${baseFontSize}px 'Inter', sans-serif`;
      bulletW = ctx.measureText(block.bulletPrefix).width;
    }

    if (block.spans.length === 0) {
      measuredLines.push({
        spans: [],
        bulletPrefix: block.bulletPrefix,
        bulletWidth: bulletW,
        totalWidth: bulletW,
        lineHeight: baseLineHeight,
      });
      return;
    }

    const availableW = Math.max(10, wrapLimit - bulletW);
    let curLineSpans: Array<RichSpan & { width: number }> = [];
    let curLineWidth = 0;

    const pushCurLine = (isFirst: boolean) => {
      const maxSpanLineH = curLineSpans.reduce(
        (max, s) => Math.max(max, s.fontSize * 1.25),
        baseLineHeight
      );
      measuredLines.push({
        spans: curLineSpans,
        bulletPrefix: isFirst ? block.bulletPrefix : undefined,
        bulletWidth: isFirst ? bulletW : 0,
        totalWidth: (isFirst ? bulletW : 0) + curLineWidth,
        lineHeight: maxSpanLineH,
      });
      curLineSpans = [];
      curLineWidth = 0;
    };

    let isFirstSubLine = true;

    block.spans.forEach((span) => {
      const fontStyle = span.isItalic ? 'italic ' : '';
      const fontWeight = span.isBold ? 'bold ' : 'normal ';
      ctx.font = `${fontStyle}${fontWeight}${span.fontSize}px 'Inter', sans-serif`;

      // Split into words while preserving spaces
      const words = span.text.split(/(\s+)/);
      words.forEach((word) => {
        if (!word) return;
        const wWidth = ctx.measureText(word).width;

        // Break very long words character by character if exceeding line width
        if (wWidth > availableW) {
          for (let c = 0; c < word.length; c++) {
            const char = word[c];
            const charW = ctx.measureText(char).width;
            if (curLineWidth + charW > availableW && curLineSpans.length > 0) {
              pushCurLine(isFirstSubLine);
              isFirstSubLine = false;
            }
            curLineSpans.push({ ...span, text: char, width: charW });
            curLineWidth += charW;
          }
        } else {
          if (curLineWidth + wWidth > availableW && curLineSpans.length > 0) {
            pushCurLine(isFirstSubLine);
            isFirstSubLine = false;
          }
          curLineSpans.push({ ...span, text: word, width: wWidth });
          curLineWidth += wWidth;
        }
      });
    });

    if (curLineSpans.length > 0 || isFirstSubLine) {
      pushCurLine(isFirstSubLine);
    }
  });

  let maxRenderedW = 0;
  measuredLines.forEach((l) => {
    if (l.totalWidth > maxRenderedW) maxRenderedW = l.totalWidth;
  });

  const totalTextH = measuredLines.reduce((acc, l) => acc + l.lineHeight, 0);
  const totalBoxW = forcedBoxWidth ?? (maxRenderedW + boxPaddingX * 2);
  const totalBoxH = ft.height
    ? (ft.height / 100) * height
    : totalTextH;

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  (ctx as any).textRendering = 'geometricPrecision';

  // Rotation
  if (ft.rotation) {
    const cx = tx + totalBoxW / 2;
    const cy = ty + totalBoxH / 2;
    ctx.translate(cx, cy);
    ctx.rotate((ft.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  // Drop shadow
  if (ft.hasShadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.36)';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 10 * canvasToWebRatio;
    ctx.shadowBlur = 2 * canvasToWebRatio;
  }

  // Background shape (with extra top & bottom padding for Vietnamese diacritics strictly matching FreeTextLayer.tsx)
  const exportTopExtra = Math.round(baseFontSize * 0.12);
  const exportBottomExtra = Math.round(baseFontSize * 0.04);
  if (ft.bgColor && ft.bgColor !== 'transparent') {
    drawShapeOnCanvas(
      ctx,
      ft.shape || 'text',
      tx,
      ty - exportTopExtra,
      totalBoxW,
      totalBoxH + exportTopExtra + exportBottomExtra,
      ft.bgColor,
      ft.bgOpacity ?? 1
    );
  }

  ctx.shadowColor = 'transparent';
  ctx.globalAlpha = ft.opacity ?? 1;
  ctx.textBaseline = 'top';

  const startOffsetY = Math.max(0, (totalBoxH - totalTextH) / 2);

  interface PlacedSpan {
    span: RichSpan & { width: number };
    x: number;
    width: number;
  }

  interface PlacedLine {
    lineY: number;
    lineHeight: number;
    lineStartX: number;
    bulletPrefix?: string;
    bulletWidth: number;
    bulletX: number;
    spans: PlacedSpan[];
  }

  let accumulatedY = 0;
  const placedLines: PlacedLine[] = measuredLines.map((line) => {
    let lineStartX = tx + boxPaddingX;
    if (ft.textAlign === 'center') {
      lineStartX = tx + (totalBoxW - line.totalWidth) / 2;
    } else if (ft.textAlign === 'right') {
      lineStartX = tx + totalBoxW - boxPaddingX - line.totalWidth;
    }

    const lineY = ty + startOffsetY + accumulatedY;
    accumulatedY += line.lineHeight;

    let curX = lineStartX;
    const bulletX = curX;
    if (line.bulletPrefix) {
      curX += line.bulletWidth;
    }

    const spans: PlacedSpan[] = [];
    line.spans.forEach((s) => {
      spans.push({
        span: s,
        x: curX,
        width: s.width,
      });
      curX += s.width;
    });

    return {
      lineY,
      lineHeight: line.lineHeight,
      lineStartX,
      bulletPrefix: line.bulletPrefix,
      bulletWidth: line.bulletWidth,
      bulletX,
      spans,
    };
  });

  // PASS 1: Render All Span Background Colors (Merged runs per line, seamless vertical alignment covering Vietnamese diacritics)
  interface BgRun {
    bgColor: string;
    startX: number;
    endX: number;
    maxFontSize: number;
    startIndex: number;
    endIndex: number;
  }

  const lineRuns: BgRun[][] = placedLines.map((pLine) => {
    const runs: BgRun[] = [];
    let currentRun: BgRun | null = null;

    pLine.spans.forEach((ps, idx) => {
      const bg = ps.span.bgColor;
      if (bg && bg !== 'transparent') {
        if (currentRun && currentRun.bgColor === bg) {
          currentRun.endX = ps.x + ps.width;
          currentRun.maxFontSize = Math.max(currentRun.maxFontSize, ps.span.fontSize);
          currentRun.endIndex = idx;
        } else {
          if (currentRun) runs.push(currentRun);
          currentRun = {
            bgColor: bg,
            startX: ps.x,
            endX: ps.x + ps.width,
            maxFontSize: ps.span.fontSize,
            startIndex: idx,
            endIndex: idx,
          };
        }
      } else {
        if (currentRun) {
          runs.push(currentRun);
          currentRun = null;
        }
      }
    });
    if (currentRun) runs.push(currentRun);
    return runs;
  });

  lineRuns.forEach((runs, lineIdx) => {
    const pLine = placedLines[lineIdx];
    const prevRuns = lineIdx > 0 ? lineRuns[lineIdx - 1] : [];
    const nextRuns = lineIdx < lineRuns.length - 1 ? lineRuns[lineIdx + 1] : [];

    runs.forEach((run) => {
      // Check if previous line had a matching contiguous background run
      const hasPrevMatch = prevRuns.some(
        (pr) => pr.bgColor === run.bgColor && Math.max(pr.startX, run.startX) < Math.min(pr.endX, run.endX)
      );

      // Check if next line has a matching contiguous background run
      const hasNextMatch = nextRuns.some(
        (nr) => nr.bgColor === run.bgColor && Math.max(nr.startX, run.startX) < Math.min(nr.endX, run.endX)
      );

      let runTop = pLine.lineY;
      if (lineIdx === 0) {
        // First line: expand upwards by exportTopExtra to completely enclose highest Vietnamese uppercase diacritics (Á, Ế, Ố, Ỹ)
        runTop = pLine.lineY - exportTopExtra;
      } else if (!hasPrevMatch) {
        // Start of highlight run: expand upward to cover diacritics cleanly without leaking
        const textY = pLine.lineY + (pLine.lineHeight - run.maxFontSize) * 0.5;
        const accentExtra = Math.max(3 * scale, run.maxFontSize * 0.22);
        runTop = Math.max(pLine.lineY - exportTopExtra, textY - accentExtra);
      }

      // Bottom boundary: lines join seamlessly without seams or bleeding into subsequent lines
      let runBottom = pLine.lineY + pLine.lineHeight;

      // Small horizontal padding for natural web-like inline highlight
      const hPad = Math.max(1, 1.5 * scale);
      const isAtLineStart = run.startIndex === 0;
      const isAtLineEnd = run.endIndex === pLine.spans.length - 1;

      const rectX = Math.max(tx, run.startX - (isAtLineStart ? 0 : hPad));
      const rectW = Math.min(tx + totalBoxW, run.endX + (isAtLineEnd ? 0 : hPad)) - rectX;

      ctx.fillStyle = run.bgColor;
      ctx.fillRect(rectX, runTop, Math.max(0, rectW), Math.max(0, runBottom - runTop));
    });
  });

  // PASS 2: Render All Text, Underlines, Strikethroughs & Bullets cleanly on top
  placedLines.forEach((pLine) => {
    if (pLine.bulletPrefix) {
      ctx.font = `normal ${baseFontSize}px 'Inter', sans-serif`;
      ctx.fillStyle = ft.color || '#1D2129';
      ctx.fillText(pLine.bulletPrefix, pLine.bulletX, pLine.lineY + (pLine.lineHeight - baseFontSize) * 0.5);
    }

    pLine.spans.forEach((ps) => {
      const { span } = ps;
      const fontStyle = span.isItalic ? 'italic ' : '';
      const fontWeight = span.isBold ? 'bold ' : 'normal ';
      ctx.font = `${fontStyle}${fontWeight}${span.fontSize}px 'Inter', sans-serif`;

      ctx.fillStyle = span.color || '#1D2129';
      const textY = pLine.lineY + (pLine.lineHeight - span.fontSize) * 0.5;
      ctx.fillText(span.text, ps.x, textY);

      if (span.isUnderline) {
        ctx.beginPath();
        ctx.strokeStyle = span.color || '#1D2129';
        ctx.lineWidth = Math.max(1, 1.2 * canvasToWebRatio);
        const uY = Math.min(pLine.lineY + pLine.lineHeight - 1, textY + span.fontSize * 0.96 + 1.2 * canvasToWebRatio);
        ctx.moveTo(ps.x, uY);
        ctx.lineTo(ps.x + ps.width, uY);
        ctx.stroke();
      }

      if (span.isStrikethrough) {
        ctx.beginPath();
        ctx.strokeStyle = span.color || '#1D2129';
        ctx.lineWidth = Math.max(1, 1.2 * canvasToWebRatio);
        const sY = textY + span.fontSize * 0.55;
        ctx.moveTo(ps.x, sY);
        ctx.lineTo(ps.x + ps.width, sY);
        ctx.stroke();
      }
    });
  });

  ctx.restore();
}

/**
 * Native 2D Canvas Sticky Note renderer matching StickyNotesLayer.tsx exactly without UI control buttons.
 */
function renderStickyNoteOnCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  ratio: number,
  note: TextNoteAnnotation
) {
  const theme =
    NOTE_PAPER_COLORS.find(
      (c) =>
        c.contentBg === note.color ||
        c.headerBg === note.color ||
        c.noteBg === note.color ||
        c.id === note.color
    ) || NOTE_PAPER_COLORS[0];

  const fontSans = "'Inter', sans-serif";

  // 1. Authoritative state from annotation object
  const isMinimized = typeof note.isMinimized === 'boolean' ? note.isMinimized : false;

  // Exact coordinates matching percentages
  const nx = (note.x / 100) * width;
  const ny = (note.y / 100) * height;

  // -------------------------------------------------------------
  // STATE 1: MINIMIZED STICKY NOTE (Circular Badge with MessageSquare Icon)
  // -------------------------------------------------------------
  if (isMinimized) {
    // 24px diameter on screen at 1.0 -> scale proportionally to canvas
    const diameterPx = 24 * ratio;
    const radius = Math.max(6, diameterPx / 2);
    const cx = nx + radius;
    const cy = ny + radius;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
    ctx.shadowBlur = Math.max(2, Math.round(4 * ratio));
    ctx.shadowOffsetY = Math.max(1, Math.round(2 * ratio));

    ctx.fillStyle = theme.noteBg || theme.headerBg || '#ffefae';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = Math.max(1, Math.round(1 * ratio));
    ctx.stroke();

    const iconSize = Math.max(8, Math.round(13 * ratio));
    ctx.save();
    ctx.translate(cx - iconSize / 2, cy - iconSize / 2);
    ctx.scale(iconSize / 24, iconSize / 24);
    ctx.fillStyle = '#000000';
    try {
      const p = new Path2D('M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z');
      ctx.fill(p);
    } catch {
      ctx.fillRect(3, 3, 18, 14);
    }
    ctx.restore();
    ctx.restore();
    return;
  }

  // -------------------------------------------------------------
  // STATE 2: EXPANDED STICKY NOTE (Pristine Post-it Note Paper Card with 3 Layers)
  // -------------------------------------------------------------
  let cardW = 224 * ratio;
  let cardH = 160 * ratio;

  if (typeof note.width === 'number' && note.width > 0) {
    if (note.width <= 100) {
      cardW = (note.width / 100) * width;
    } else {
      cardW = note.width * ratio;
    }
  }

  if (typeof note.height === 'number' && note.height > 0) {
    if (note.height <= 100) {
      cardH = (note.height / 100) * height;
    } else {
      cardH = note.height * ratio;
    }
  }

  const r = Math.max(2, Math.round(12 * ratio));

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.shadowColor = 'rgba(0, 0, 0, 0.16)';
  ctx.shadowBlur = Math.max(2, Math.round(6 * ratio));
  ctx.shadowOffsetY = Math.max(1, Math.round(2 * ratio));

  ctx.fillStyle = theme.contentBg || '#fff4c9';
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(nx, ny, cardW, cardH, r);
  } else {
    ctx.rect(nx, ny, cardW, cardH);
  }
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.lineWidth = Math.max(1, Math.round(1 * ratio));
  ctx.stroke();

  // Clip to card rounded rectangle for internal rendering
  ctx.save();
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(nx, ny, cardW, cardH, r);
  } else {
    ctx.rect(nx, ny, cardW, cardH);
  }
  ctx.clip();

  // LAYER 1: Header Bar (height = 28 * ratio)
  const headerH = Math.max(16, Math.round(28 * ratio));
  ctx.fillStyle = theme.headerBg || '#fde047';
  ctx.fillRect(nx, ny, cardW, headerH);

  // Header bottom border
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
  ctx.lineWidth = Math.max(1, Math.round(1 * ratio));
  ctx.beginPath();
  ctx.moveTo(nx, ny + headerH);
  ctx.lineTo(nx + cardW, ny + headerH);
  ctx.stroke();

  // Header text "Note" & Move icon
  const moveIconSize = Math.max(8, Math.round(13 * ratio));
  const headerPadLeft = Math.round(10 * ratio);
  drawLucideIcon(
    ctx,
    'M5 9l-3 3 3 3M9 5l3-3 3 3M15 9l3 3-3 3M9 19l3 3 3 3M2 12h20M12 2v20',
    nx + headerPadLeft,
    ny + (headerH - moveIconSize) / 2,
    moveIconSize,
    'rgba(0,0,0,0.7)',
    1.6
  );

  ctx.fillStyle = '#000000';
  ctx.font = `bold ${Math.max(8, Math.round(11.5 * ratio))}px ${fontSans}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(note.title || 'Note', nx + headerPadLeft + moveIconSize + Math.round(6 * ratio), ny + headerH / 2, Math.max(1, cardW - headerPadLeft * 2 - moveIconSize - 6 * ratio));

  // LAYER 3: Footer Bar (height = 24 * ratio) at bottom
  const footerH = Math.max(14, Math.round(24 * ratio));
  const footerY = ny + cardH - footerH;

  ctx.fillStyle = theme.contentBg || '#fff4c9';
  ctx.fillRect(nx, footerY, cardW, footerH);

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
  ctx.lineWidth = Math.max(1, Math.round(1 * ratio));
  ctx.beginPath();
  ctx.moveTo(nx, footerY);
  ctx.lineTo(nx + cardW, footerY);
  ctx.stroke();

  // Footer page indicator right aligned
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.font = `normal ${Math.max(7, Math.round(9.5 * ratio))}px ${fontSans}`;
  ctx.textBaseline = 'middle';
  const pageStr = `P.${note.pageNumber || 1}`;
  const pageTextW = ctx.measureText(pageStr).width;
  ctx.fillText(pageStr, nx + cardW - Math.round(10 * ratio) - pageTextW, footerY + footerH / 2);

  // Footer color dots left aligned
  const dotRadius = Math.max(2, Math.round(5 * ratio));
  const dotSpacing = Math.max(2, Math.round(5 * ratio));
  let dotX = nx + Math.round(10 * ratio);
  const dotY = footerY + footerH / 2;
  NOTE_PAPER_COLORS.forEach((c) => {
    ctx.fillStyle = c.noteBg;
    ctx.beginPath();
    ctx.arc(dotX + dotRadius, dotY, dotRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = theme.id === c.id ? '#000000' : 'rgba(0,0,0,0.3)';
    ctx.lineWidth = theme.id === c.id ? Math.max(1, 1.5 * ratio) : 0.5;
    ctx.stroke();
    dotX += dotRadius * 2 + dotSpacing;
  });

  // LAYER 2: Textarea Body Area
  const padX = Math.max(4, Math.round(10 * ratio));
  const bodyTop = ny + headerH + Math.round(8 * ratio);

  if (cardH > headerH + footerH) {
    const bodyFontSize = Math.max(7, Math.round(12 * ratio));
    const bodyLineH = Math.max(10, Math.round(18 * ratio));

    ctx.fillStyle = '#171717';
    ctx.font = `normal ${bodyFontSize}px ${fontSans}`;
    ctx.textBaseline = 'top';

    const textMaxWidth = Math.max(10, cardW - padX * 2);
    const rawLines = extractCleanLines(note.text || '');
    const wrappedLines: string[] = [];

    rawLines.forEach((rawLine) => {
      if (!rawLine) {
        wrappedLines.push('');
        return;
      }
      wrappedLines.push(...wrapTextLine(ctx, rawLine, textMaxWidth));
    });

    wrappedLines.forEach((line, i) => {
      const lineY = bodyTop + i * bodyLineH;
      if (lineY + bodyFontSize <= footerY - 2) {
        ctx.fillText(line, nx + padX, lineY);
      }
    });
  }

  ctx.restore(); // restore clip
  ctx.restore(); // restore save
}

/**
 * Render a single PDF page with all its flattened annotations onto an Offscreen Canvas
 * strictly preserving DOM layer ordering and visual fidelity.
 */
export async function renderPageWithAnnotations(
  pdfDoc: any,
  pageNumber: number,
  scale: number = 2.0,
  includeAnnotations: boolean = true,
  annotations?: {
    highlights: HighlightAnnotation[];
    textNotes: TextNoteAnnotation[];
    drawings: DrawingStroke[];
    boxes: BoxAnnotation[];
    freeTexts: FreeTextAnnotation[];
  },
  _screenScale?: number
): Promise<HTMLCanvasElement> {

  // Ensure custom and web fonts are fully loaded before rendering
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch (_) {}
  }

  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const width = Math.max(1, Math.floor(viewport.width));
  const height = Math.max(1, Math.floor(viewport.height));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Cannot create 2d canvas context');

  // Fill background white
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  (ctx as any).textRendering = 'geometricPrecision';

  // 1. Render base PDF layer using PDF.js at target scale (crisp vector graphics)
  await page.render({
    canvasContext: ctx,
    viewport,
  }).promise;

  // Immediately release PDF.js internal decoded page caches
  try {
    page.cleanup();
  } catch (_) {}

  if (!includeAnnotations || !annotations) {
    return canvas;
  }

  // Annotation geometry belongs to the page, never to the viewer's current
  // zoom. Pixel-sized legacy tools have a stored reference scale below.
  const canvasToWebRatio = scale;

  const pageHighlights = annotations.highlights.filter((h) => h.pageNumber === pageNumber);
  const pageDrawings = annotations.drawings.filter((d) => d.pageNumber === pageNumber);
  const pageBoxes = annotations.boxes.filter((b) => b.pageNumber === pageNumber);
  const pageFreeTexts = annotations.freeTexts.filter((ft) => ft.pageNumber === pageNumber);
  const pageNotes = annotations.textNotes.filter((n) => n.pageNumber === pageNumber);

  const hasAnnotations =
    pageHighlights.length > 0 ||
    pageDrawings.length > 0 ||
    pageBoxes.length > 0 ||
    pageFreeTexts.length > 0 ||
    pageNotes.length > 0;

  if (!hasAnnotations) {
    return canvas;
  }

  // 2. Offscreen High-Fidelity 2D Canvas Annotation Pipeline
  // Strictly independent of browser viewport, zoom scale, DOM container, and window state.
  // Never mutates or queries live DOM elements, completely eliminating screen flickering and layout shifts.

  // Layer 1: Highlights (Highlighter Overlay)
  pageHighlights.forEach((hl) => {
    const colorConfig = HIGHLIGHT_COLORS[hl.color] || HIGHLIGHT_COLORS.yellow;
    const displayRects = mergeContiguousRects(hl.rects);

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = colorConfig.hex;

    displayRects.forEach((rect) => {
      const rx = (rect.x / 100) * width;
      const ry = (rect.y / 100) * height;
      const rw = (rect.width / 100) * width;
      const rh = (rect.height / 100) * height;
      ctx.fillRect(rx, ry, rw, rh);
    });
    ctx.restore();
  });

  // Layer 2: Freehand Pen, Smart Shapes & Freehand Highlighter
  pageDrawings.forEach((stroke) => {
    if (!stroke.points || stroke.points.length < 2) return;

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = Math.max(1, stroke.size * scale / (stroke.referenceScale || 1));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (stroke.isHighlighter) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = stroke.opacity ?? 0.45;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = stroke.opacity ?? 1;
    }

    const isPolygon = stroke.isSmartShape || (stroke.points && stroke.points.length <= 6);
    drawSmoothStroke(ctx, stroke.points, width, height, isPolygon);

    const isGeom =
      !stroke.isHighlighter &&
      stroke.isSmartShape &&
      (stroke.shapeType === 'circle' ||
        stroke.shapeType === 'ellipse' ||
        stroke.shapeType === 'rectangle' ||
        stroke.shapeType === 'square' ||
        stroke.shapeType === 'triangle' ||
        stroke.shapeType === 'parallelogram' ||
        stroke.shapeType === 'trapezoid');

    if (isGeom) {
      ctx.closePath();
      if ((stroke as any).fillColor && (stroke as any).fillColor !== 'transparent') {
        ctx.fillStyle = (stroke as any).fillColor;
        ctx.fill();
      }
    }

    ctx.stroke();
    ctx.restore();
  });

  // Box Annotations
  pageBoxes.forEach((box) => {
    const bx = (box.x / 100) * width;
    const by = (box.y / 100) * height;
    const bw = (box.width / 100) * width;
    const bh = (box.height / 100) * height;
    const lineWidth = Math.max(1, (box.borderWidth || 2) * scale / (box.referenceScale || 1));

    ctx.save();
    if (box.fillColor && box.fillColor !== 'transparent') {
      ctx.fillStyle = box.fillColor;
      ctx.fillRect(bx, by, bw, bh);
    }

    ctx.strokeStyle = box.color || '#ef4444';
    ctx.lineWidth = lineWidth;
    if (box.borderStyle === 'dashed') {
      ctx.setLineDash([6 * scale / (box.referenceScale || 1), 4 * scale / (box.referenceScale || 1)]);
    } else if (box.borderStyle === 'dotted') {
      ctx.setLineDash([lineWidth, lineWidth * 1.5]);
    } else {
      ctx.setLineDash([]);
    }
    const halfLine = lineWidth / 2;
    ctx.strokeRect(
      bx + halfLine,
      by + halfLine,
      Math.max(0, bw - lineWidth),
      Math.max(0, bh - lineWidth)
    );

    ctx.restore();
  });

  // Free Text
  pageFreeTexts.forEach((ft) => {
    renderFreeTextOnCanvas(ctx, width, height, scale, canvasToWebRatio, ft);
  });

  // Sticky Notes
  pageNotes.forEach((note) => {
    renderStickyNoteOnCanvas(ctx, width, height, scale / (note.referenceScale || 1), note);
  });

  return canvas;
}


/**
 * Run asynchronous tasks with controlled concurrency
 */
async function asyncPool<T, R>(
  concurrency: number,
  items: T[],
  iteratorFn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const ret: R[] = new Array(items.length);
  const executing = new Set<Promise<void>>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const index = i;
    const p = Promise.resolve().then(() => iteratorFn(item, index)).then((res) => {
      ret[index] = res;
    });

    const e: Promise<void> = p.then(() => {
      executing.delete(e);
    });
    executing.add(e);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return ret;
}

/**
 * Execute full export workflow: PDF or PNG/JPG (individual/ZIP)
 * Highly optimized with concurrent worker pipeline and zero-redundancy packaging
 */
export async function executeExportPages(options: ExportOptions): Promise<void> {
  const {
    pdfDoc,
    bookTitle,
    selectedPages,
    format,
    resolutionScale = 3.0,
    includeAnnotations = true,
    highlights,
    textNotes,
    drawings,
    boxes,
    freeTexts,
    screenScale,
    onProgress,
  } = options;

  if (!pdfDoc || selectedPages.length === 0) {
    throw new Error('Không có trang nào được chọn để xuất.');
  }

  // Pre-load web & custom fonts once for the entire export session
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch (_) {}
  }

  const total = selectedPages.length;
  const safeTitle = (bookTitle || 'Swiftbook')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 50);

  const annotationsMap = {
    highlights,
    textNotes,
    drawings,
    boxes,
    freeTexts,
  };

  // Determine optimal concurrency based on system hardware (3-6 parallel workers)
  const CONCURRENCY = Math.min(
    6,
    Math.max(
      3,
      typeof navigator !== 'undefined' && navigator.hardwareConcurrency
        ? navigator.hardwareConcurrency
        : 4
    )
  );

  // 1. PDF EXPORT MODE
  if (format === 'pdf') {
    let usedFastPdfLib = false;

    // Fast path: Native PDF binary page extraction via pdf-lib
    // Copies unannotated pages in <0.5ms per page without rasterization, preserving 100% vector quality & tiny file size
    try {
      if (typeof pdfDoc.getData === 'function') {
        const rawBytes = await pdfDoc.getData();
        if (rawBytes && rawBytes.length > 0) {
          const srcPdfDoc = await PDFDocument.load(rawBytes, { ignoreEncryption: true });
          const outDoc = await PDFDocument.create();

          // Check which pages have annotations
          const annotatedPageSet = new Set<number>();
          if (includeAnnotations) {
            for (const pageNum of selectedPages) {
              const has =
                highlights.some((h) => h.pageNumber === pageNum) ||
                textNotes.some((n) => n.pageNumber === pageNum) ||
                drawings.some((d) => d.pageNumber === pageNum) ||
                boxes.some((b) => b.pageNumber === pageNum) ||
                freeTexts.some((f) => f.pageNumber === pageNum);
              if (has) {
                annotatedPageSet.add(pageNum);
              }
            }
          }

          // Pre-render ONLY the pages with annotations concurrently
          const renderedAnnotatedImages = new Map<number, Uint8Array>();
          if (annotatedPageSet.size > 0) {
            const annotatedPagesList = Array.from(annotatedPageSet);
            let renderedCount = 0;
            await asyncPool(CONCURRENCY, annotatedPagesList, async (pageNum) => {
              onProgress?.(
                renderedCount + 1,
                total,
                `Đang vẽ trang chú thích ${pageNum} (${renderedCount + 1}/${annotatedPagesList.length})...`
              );
              const canvas = await renderPageWithAnnotations(
                pdfDoc,
                pageNum,
                resolutionScale,
                includeAnnotations,
                annotationsMap,
                screenScale
              );
              const blob = await new Promise<Blob | null>((resolve) => {
                canvas.toBlob((b) => resolve(b), 'image/png');
              });
              canvas.width = 1;
              canvas.height = 1;
              if (blob) {
                const arr = new Uint8Array(await blob.arrayBuffer());
                renderedAnnotatedImages.set(pageNum, arr);
              }
              renderedCount++;
            });
          }

          // Assemble the final PDF in exact order
          for (let idx = 0; idx < total; idx++) {
            const pageNum = selectedPages[idx];
            onProgress?.(
              idx + 1,
              total,
              `Đang hoàn thiện trang ${pageNum} (${idx + 1}/${total})...`
            );

            if (annotatedPageSet.has(pageNum) && renderedAnnotatedImages.has(pageNum)) {
              // Embed rendered page with annotations (Lossless PNG)
              const imgBytes = renderedAnnotatedImages.get(pageNum)!;
              const embeddedImage = await outDoc.embedPng(imgBytes);
              const page = await pdfDoc.getPage(pageNum);
              const baseViewport = page.getViewport({ scale: 1.0 });
              try {
                page.cleanup();
              } catch (_) {}
              const widthPt = baseViewport.width;
              const heightPt = baseViewport.height;
              const newPage = outDoc.addPage([widthPt, heightPt]);
              newPage.drawImage(embeddedImage, { x: 0, y: 0, width: widthPt, height: heightPt });
            } else {
              // Instant vector copy (0.5ms per page, zero quality loss, vector fonts preserved)
              const [copiedPage] = await outDoc.copyPages(srcPdfDoc, [pageNum - 1]);
              outDoc.addPage(copiedPage);
            }
          }

          onProgress?.(total, total, 'Đang hoàn tất tệp PDF...');
          const pdfBytes = await outDoc.save();
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          const rangeSuffix =
            total === 1
              ? `Trang_${selectedPages[0]}`
              : `Trang_${selectedPages[0]}-${selectedPages[total - 1]}`;
          link.download = `${safeTitle}_${rangeSuffix}.pdf`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          usedFastPdfLib = true;
        }
      }
    } catch (fastErr) {
      console.warn('Fast PDF extraction fallback to streaming canvas pipeline:', fastErr);
      usedFastPdfLib = false;
    }

    if (usedFastPdfLib) {
      return;
    }

    // Fallback streaming canvas pipeline with jsPDF
    let outDoc: jsPDF | null = null;
    let nextIndexToRender = 0;
    let nextIndexToAdd = 0;
    let completedCount = 0;
    const inFlight = new Map<
      number,
      Promise<{
        canvas: HTMLCanvasElement;
        widthPt: number;
        heightPt: number;
        orientation: 'l' | 'p';
      }>
    >();

    const startNext = () => {
      if (nextIndexToRender >= total) return;
      const currIdx = nextIndexToRender++;
      const pageNum = selectedPages[currIdx];

      const promise = (async () => {
        const canvas = await renderPageWithAnnotations(
          pdfDoc,
          pageNum,
          resolutionScale,
          includeAnnotations,
          annotationsMap,
          screenScale
        );
        const page = await pdfDoc.getPage(pageNum);
        const baseViewport = page.getViewport({ scale: 1.0 });
        try {
          page.cleanup();
        } catch (_) {}
        const widthPt = baseViewport.width;
        const heightPt = baseViewport.height;
        const orientation: 'l' | 'p' = widthPt > heightPt ? 'l' : 'p';
        return { canvas, widthPt, heightPt, orientation };
      })();

      inFlight.set(currIdx, promise);
    };

    // Prime the pipeline with concurrent background rendering tasks
    for (let c = 0; c < Math.min(CONCURRENCY, total); c++) {
      startNext();
    }

    // Stream rendered pages into jsPDF in strictly preserved order
    while (nextIndexToAdd < total) {
      const currIdx = nextIndexToAdd;
      const pageNum = selectedPages[currIdx];
      onProgress?.(
        completedCount + 1,
        total,
        `Đang xử lý trang ${pageNum} (${completedCount + 1}/${total})...`
      );

      const { canvas, widthPt, heightPt, orientation } = await inFlight.get(currIdx)!;
      inFlight.delete(currIdx);

      // Start the next page in background immediately
      startNext();

      if (!outDoc) {
        outDoc = new jsPDF({
          orientation,
          unit: 'pt',
          format: [widthPt, heightPt],
        });
        outDoc.addImage(canvas, 'PNG', 0, 0, widthPt, heightPt, undefined, 'FAST');
      } else {
        outDoc.addPage([widthPt, heightPt], orientation);
        outDoc.addImage(canvas, 'PNG', 0, 0, widthPt, heightPt, undefined, 'FAST');
      }

      // Immediately free canvas GPU & memory buffers
      canvas.width = 1;
      canvas.height = 1;

      completedCount++;
      nextIndexToAdd++;
    }

    if (outDoc) {
      onProgress?.(total, total, 'Đang hoàn tất tệp PDF...');
      const rangeSuffix =
        total === 1
          ? `Trang_${selectedPages[0]}`
          : `Trang_${selectedPages[0]}-${selectedPages[total - 1]}`;
      outDoc.save(`${safeTitle}_${rangeSuffix}.pdf`);
    }
    return;
  }

  // 2. IMAGE EXPORT MODE (PNG / JPG)
  const isPng = format === 'png';
  const mimeType = isPng ? 'image/png' : 'image/jpeg';
  const fileExt = isPng ? 'png' : 'jpg';
  const imageQuality = isPng ? undefined : 0.92;

  // Single Page: Direct download image
  if (total === 1) {
    const pageNum = selectedPages[0];
    onProgress?.(1, 1, `Đang kết xuất trang ${pageNum}...`);

    const canvas = await renderPageWithAnnotations(
      pdfDoc,
      pageNum,
      resolutionScale,
      includeAnnotations,
      annotationsMap,
      screenScale
    );

    const dataUrl = canvas.toDataURL(mimeType, imageQuality);
    canvas.width = 1;
    canvas.height = 1;

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${safeTitle}_Trang_${pageNum}.${fileExt}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return;
  }

  // Multiple Pages: Parallel rendering + fast STORE ZIP packaging
  const zip = new JSZip();
  let completedCount = 0;

  await asyncPool(CONCURRENCY, selectedPages, async (pageNum) => {
    const canvas = await renderPageWithAnnotations(
      pdfDoc,
      pageNum,
      resolutionScale,
      includeAnnotations,
      annotationsMap,
      screenScale
    );

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), mimeType, imageQuality);
    });

    // Free canvas GPU & memory buffers immediately
    canvas.width = 1;
    canvas.height = 1;

    if (blob) {
      const pageIndexStr = String(pageNum).padStart(3, '0');
      zip.file(`${safeTitle}_Trang_${pageIndexStr}.${fileExt}`, blob);
    }

    completedCount++;
    onProgress?.(
      completedCount,
      total,
      `Đang xử lý trang ${pageNum} (${completedCount}/${total})...`
    );
  });

  onProgress?.(total, total, 'Đang nén các trang thành file ZIP...');
  // STORE compression avoids re-compressing already-compressed PNG/JPG images, making zip generation 10x faster
  const zipBlob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'STORE',
    },
    (metadata) => {
      onProgress?.(
        total,
        total,
        `Đang đóng gói file ZIP (${Math.round(metadata.percent)}%)...`
      );
    }
  );

  const zipUrl = URL.createObjectURL(zipBlob);
  const link = document.createElement('a');
  link.href = zipUrl;
  link.download = `${safeTitle}_Trang_${selectedPages[0]}-${selectedPages[total - 1]}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(zipUrl);
}
