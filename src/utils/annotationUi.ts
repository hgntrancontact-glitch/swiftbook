export const HIGHLIGHT_TOOLBAR_SIZE = 0.94;
export const HIGHLIGHT_NOTE_SIZE = 0.94;
export const HIGHLIGHT_NOTE_ICON_SIZE = 22;
export const HIGHLIGHT_NOTE_GLYPH_SIZE = 11.5;

/** Fit-to-page scale is deliberately excluded: 100% is the UI size reference. */
export function annotationZoom(userZoom: number, renderedPageWidth: number, layoutPageWidth: number): number {
  const zoom = Number.isFinite(userZoom) && userZoom > 0 ? userZoom : 1;
  const liveRatio = renderedPageWidth > 0 && layoutPageWidth > 0 ? renderedPageWidth / layoutPageWidth : 1;
  return Math.max(0.2, zoom * liveRatio);
}

export function getAnnotationZoom(anchor: HTMLElement): number {
  const wrapper = anchor.closest<HTMLElement>('[data-user-zoom]');
  const page = anchor.closest<HTMLElement>('[data-page-container="true"]');
  return annotationZoom(Number(wrapper?.dataset.userZoom || 1), page?.getBoundingClientRect().width || 0,
    page ? parseFloat(page.style.width) : 0);
}

type Bounds = { left: number; right: number; top: number; bottom: number };

export function placeAnnotationToolbar(anchor: Bounds, size: { width: number; height: number }, limits: Bounds,
  scale: number, preferredAbove: boolean, preserveAnchorGap: boolean, align: 'left' | 'center', fitAnchorEdges = false) {
  const width = size.width * scale;
  const height = size.height * scale;
  const gap = 10 * scale;
  let requestedLeft = align === 'left' ? anchor.left : (anchor.left + anchor.right - width) / 2;
  // Box controls open toward the available side, retaining an edge of the
  // box as their reference before falling back to viewport clamping.
  if (fitAnchorEdges && requestedLeft + width > limits.right) requestedLeft = anchor.right - width;
  const left = Math.max(limits.left, Math.min(Math.max(limits.left, limits.right - width), requestedLeft));
  let above = preferredAbove;
  // Highlight controls travel with the page. Re-evaluating their side from
  // viewport space on scroll makes them jump across the selected text.
  if (!preserveAnchorGap) {
    if (above && anchor.top - height - gap < limits.top && anchor.bottom + height + gap <= limits.bottom) above = false;
    if (!above && anchor.bottom + height + gap > limits.bottom && anchor.top - height - gap >= limits.top) above = true;
  }
  const requestedTop = above ? anchor.top - height - gap : anchor.bottom + gap;
  const top = preserveAnchorGap ? requestedTop : Math.max(limits.top, Math.min(limits.bottom - height, requestedTop));
  return { left, top, width, height, above, gap };
}
