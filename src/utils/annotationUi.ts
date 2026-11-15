export const HIGHLIGHT_TOOLBAR_SIZE = 0.89;
export const HIGHLIGHT_NOTE_SIZE = 0.88;

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
  scale: number, preferredAbove: boolean, preserveAnchorGap: boolean, align: 'left' | 'center') {
  const width = size.width * scale;
  const height = size.height * scale;
  const gap = 10 * scale;
  const left = Math.max(limits.left, Math.min(Math.max(limits.left, limits.right - width),
    align === 'left' ? anchor.left : (anchor.left + anchor.right - width) / 2));
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
