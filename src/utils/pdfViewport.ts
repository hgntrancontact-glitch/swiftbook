import type { ViewMode } from '../types';

export const SPREAD_GAP = 8;
export const CONTINUOUS_GAP = 12;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 50;
export type PageSize = { width: number; height: number };

// Client-space movement, including any translation left by cursor-anchored
// zoom. Native scrollWidth cannot describe content translated past the left edge.
export function horizontalPanShift(left: number, width: number, viewportLeft: number, viewportWidth: number, delta: number): number {
  if (width <= viewportWidth + 1) return viewportLeft + (viewportWidth - width) / 2 - left;
  const minimum = viewportLeft + viewportWidth - left - width;
  const maximum = viewportLeft - left;
  return Math.max(minimum, Math.min(maximum, -delta));
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
