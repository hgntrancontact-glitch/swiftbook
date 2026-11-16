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

/** Box controls must fit the visible paper, including when it is narrower than the viewport. */
export function toolbarLimitsWithinPage(limits:Bounds,page:Bounds):Bounds {
  const left=Math.max(limits.left,page.left+4),right=Math.min(limits.right,page.right-4);
  const top=Math.max(limits.top,page.top+4),bottom=Math.min(limits.bottom,page.bottom-4);
  return {left,right:Math.max(left+1,right),top,bottom:Math.max(top+1,bottom)};
}

export function placeAnnotationToolbar(anchor: Bounds, size: { width: number; height: number }, limits: Bounds,
  scale: number, preferredAbove: boolean, preserveAnchorGap: boolean, align: 'left' | 'center', fitAnchorEdges = false) {
  const width = size.width * scale;
  const height = size.height * scale;
  const gap = 10 * scale;
  // Box controls stay centred until a paper edge requires shifting. Clamping
  // this continuous position avoids jumping between opposite box edges.
  const requestedLeft = align === 'left' && !fitAnchorEdges ? anchor.left : (anchor.left + anchor.right - width) / 2;
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
