import type { ViewMode } from '../types';

export const SPREAD_GAP = 8;
export const CONTINUOUS_GAP = 12;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 50;
export type PageSize = { width: number; height: number };

export function continuousRenderWindow(nearby: Iterable<number>, currentPage: number, totalPages: number, retained: Iterable<number> = []): Set<number> {
  return new Set([...nearby, currentPage - 1, currentPage, currentPage + 1, ...retained]
    .filter(page => page >= 1 && page <= totalPages));
}

// Client-space movement, including any translation left by cursor-anchored
// zoom. Native scrollWidth cannot describe content translated past the left edge.
export function horizontalPanShift(left: number, width: number, viewportLeft: number, viewportWidth: number, delta: number): number {
  const center = viewportLeft + (viewportWidth - width) / 2;
  // Pinch may deliberately leave content off-centre to preserve the cursor.
  // A wheel moves back from that position gradually; it never snaps to a bound.
  const minimum = width <= viewportWidth + 1 ? Math.min(left, center) : Math.min(left, viewportLeft + viewportWidth - width);
  const maximum = width <= viewportWidth + 1 ? Math.max(left, center) : Math.max(left, viewportLeft);
  return Math.max(minimum, Math.min(maximum, left - delta)) - left;
}

export function viewportPages(mode: ViewMode, currentPage: number, totalPages: number): number[] {
  if (mode !== 'double') return [currentPage];
  const left = currentPage % 2 ? currentPage : currentPage - 1;
  return left < totalPages ? [left, left + 1] : [left];
}

// The viewport's content box already excludes its outer gutters. Gaps remain
// screen pixels and are subtracted before calculating the page/spread scale.
export function fitPageScale(mode: ViewMode, pages: PageSize[], width: number, height: number): number {
  const pageWidth = mode === 'double'
    ? pages.reduce((sum, page) => sum + page.width, 0)
    : pages[0].width;
  const pageHeight = Math.max(...pages.map((page) => page.height));
  const gap = mode === 'double' ? (pages.length - 1) * SPREAD_GAP : 0;
  const usableHeight = mode === 'continuous' ? Math.max(1, height - CONTINUOUS_GAP) * 0.88 : height;
  return Math.max(0.0001, Math.min(Math.max(1, width - gap) / pageWidth, Math.max(1, usableHeight) / pageHeight));
}

// Native scroll bounds do not include cursor-zoom translation. Permit a small
// useful gutter around fitting content and prevent accumulating empty space.
export function boundedPanShift(start: number, size: number, viewStart: number, viewSize: number, delta: number): number {
  const gutter = Math.min(120, viewSize * 0.2);
  const center = viewStart + (viewSize-size)/2;
  const low = size <= viewSize ? center-gutter : viewStart+viewSize-size-gutter;
  const high = size <= viewSize ? center+gutter : viewStart+gutter;
  return Math.max(Math.min(start,low), Math.min(Math.max(start,high), start-delta))-start;
}
