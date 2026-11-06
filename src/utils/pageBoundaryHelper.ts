/**
 * Utility helper for multi-page boundary detection and > 50% page transfer snapping.
 * When dragging annotations (Box, Highlight, Drawing Strokes, Sticky Notes, Free Text)
 * across page boundaries:
 * 1. Calculates the percentage area overlap with each page container on screen.
 * 2. If > 50% (or majority overlap in gutter) lies on target page B, snaps & transfers to that page.
 * 3. If <= 50% lies on target page B, snaps & returns to current page A.
 * 4. Normalizes and clamps coordinates so the element is 100% cleanly placed inside the target page.
 */

export interface PageMatchResult {
  targetPage: number;
  targetPageRect: DOMRect;
  relXPct: number; // 0..100 percentage relative to target page width
  relYPct: number; // 0..100 percentage relative to target page height
  elementWidthPct: number;
  elementHeightPct: number;
  overlapRatio: number;
  transferred: boolean; // whether it was transferred to another page
}

/**
 * Given a client bounding box of an annotation element, find the best matching page (> 50% rule)
 */
export function findBestMatchingPage(
  elementRect: { left: number; top: number; right: number; bottom: number; width: number; height: number },
  currentPageNumber: number,
  elementWidthPct: number = 0,
  elementHeightPct: number = 0,
  docId?: string
): PageMatchResult | null {
  let pageEls: HTMLElement[] = [];
  if (docId) {
    pageEls = Array.from(document.querySelectorAll<HTMLElement>(`[id^="page-container-${docId}-"]`));
  }
  if (pageEls.length === 0) {
    pageEls = Array.from(document.querySelectorAll<HTMLElement>('[id^="page-container-"]'));
  }
  if (pageEls.length === 0) return null;

  const elementArea = Math.max(1, elementRect.width * elementRect.height);
  const elementCenterX = elementRect.left + elementRect.width / 2;
  const elementCenterY = elementRect.top + elementRect.height / 2;

  let bestPageEl: HTMLElement | null = null;
  let bestPageNum: number = currentPageNumber;
  let maxOverlapArea = 0;
  let maxOverlapRatio = 0;
  let bestPageRect: DOMRect | null = null;

  const currentContainerEl = docId
    ? (document.getElementById(`page-container-${docId}-${currentPageNumber}`) || document.getElementById(`page-container-${currentPageNumber}`))
    : document.getElementById(`page-container-${currentPageNumber}`);
  const currentContainerRect = currentContainerEl?.getBoundingClientRect() || null;

  let currentOverlapArea = 0;
  let currentOverlapRatio = 0;
  let totalAllPagesOverlapArea = 0;

  for (const pageEl of pageEls) {
    const rawId = pageEl.id.replace('page-container-', '');
    const parts = rawId.split('-');
    const pageNum = parseInt(parts[parts.length - 1], 10);
    if (isNaN(pageNum)) continue;

    const pageRect = pageEl.getBoundingClientRect();

    const interLeft = Math.max(elementRect.left, pageRect.left);
    const interRight = Math.min(elementRect.right, pageRect.right);
    const interTop = Math.max(elementRect.top, pageRect.top);
    const interBottom = Math.min(elementRect.bottom, pageRect.bottom);

    if (interRight > interLeft && interBottom > interTop) {
      const interArea = (interRight - interLeft) * (interBottom - interTop);
      const ratio = interArea / elementArea;
      totalAllPagesOverlapArea += interArea;

      if (pageNum === currentPageNumber) {
        currentOverlapArea = interArea;
        currentOverlapRatio = ratio;
      }

      if (interArea > maxOverlapArea) {
        maxOverlapArea = interArea;
        maxOverlapRatio = ratio;
        bestPageEl = pageEl;
        bestPageNum = pageNum;
        bestPageRect = pageRect;
      }
    }
  }

  // Determine final page based on strict >50% rule and gutter edge cases
  let finalPageNum = currentPageNumber;
  let finalPageRect = currentContainerRect;
  let isTransferred = false;

  if (bestPageNum !== currentPageNumber && bestPageRect) {
    // Check condition 1: > 50% of the entire element area is on Target Page B
    const isOver50PercentTotal = maxOverlapRatio > 0.5;
    
    // Check condition 2: element center is inside Target Page B, or majority visible overlap
    const isMajorityOfVisibleOverlap = totalAllPagesOverlapArea > 0 && (maxOverlapArea / totalAllPagesOverlapArea) >= 0.5;
    const isCenterInsideTarget = (
      elementCenterX >= bestPageRect.left &&
      elementCenterX <= bestPageRect.right &&
      elementCenterY >= bestPageRect.top &&
      elementCenterY <= bestPageRect.bottom
    );

    if (isOver50PercentTotal || isCenterInsideTarget || isMajorityOfVisibleOverlap) {
      finalPageNum = bestPageNum;
      finalPageRect = bestPageRect;
      isTransferred = true;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('page-activated', { detail: { pageNumber: finalPageNum } }));
      }
    } else if (currentContainerRect) {
      finalPageNum = currentPageNumber;
      finalPageRect = currentContainerRect;
      isTransferred = false;
    }
  } else if (currentContainerRect) {
    finalPageNum = currentPageNumber;
    finalPageRect = currentContainerRect;
    isTransferred = false;
  } else if (bestPageRect) {
    finalPageNum = bestPageNum;
    finalPageRect = bestPageRect;
    isTransferred = bestPageNum !== currentPageNumber;
    if (isTransferred && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('page-activated', { detail: { pageNumber: finalPageNum } }));
    }
  }

  if (!finalPageRect) return null;

  // Calculate clean relative top-left position on the target page in percentage
  const rawXPct = ((elementRect.left - finalPageRect.left) / finalPageRect.width) * 100;
  const rawYPct = ((elementRect.top - finalPageRect.top) / finalPageRect.height) * 100;

  const targetWidthPct = elementWidthPct > 0 
    ? (isTransferred ? (elementRect.width / finalPageRect.width) * 100 : elementWidthPct)
    : (elementRect.width / finalPageRect.width) * 100;

  const targetHeightPct = elementHeightPct > 0 
    ? (isTransferred ? (elementRect.height / finalPageRect.height) * 100 : elementHeightPct)
    : (elementRect.height / finalPageRect.height) * 100;

  // Absolute page snapping: clamp coordinates firmly inside [0, 100 - elementDimension]
  // This guarantees 0% edge clipping, no cut-off borders, and zero overlap from origin page
  const clampedXPct = Math.max(0, Math.min(Math.max(0, 100 - targetWidthPct), rawXPct));
  const clampedYPct = Math.max(0, Math.min(Math.max(0, 100 - targetHeightPct), rawYPct));

  return {
    targetPage: finalPageNum,
    targetPageRect: finalPageRect,
    relXPct: clampedXPct,
    relYPct: clampedYPct,
    elementWidthPct: targetWidthPct,
    elementHeightPct: targetHeightPct,
    overlapRatio: maxOverlapRatio,
    transferred: isTransferred,
  };
}

/**
 * Dynamically elevates the z-index of the active dragging page and its parent container
 * so that any dragged annotation floats cleanly ABOVE all neighboring PDF pages and spines.
 */
export function elevatePageZIndex(pageNumber: number, docId?: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('page-elevate', { detail: { pageNumber, docId } }));
    try {
      document.documentElement.dataset.gesturingPage = String(pageNumber);
      document.body.classList.add('is-annotation-gesturing');
    } catch (_) {}
  }
  const pageEl = docId
    ? (document.getElementById(`page-container-${docId}-${pageNumber}`) || document.getElementById(`page-container-${pageNumber}`))
    : document.getElementById(`page-container-${pageNumber}`);
  if (pageEl) {
    let current: HTMLElement | null = pageEl;
    while (
      current &&
      current.tagName !== 'MAIN' &&
      !current.id.startsWith('pdf-transform-wrapper')
    ) {
      // Do not elevate any container that directly houses the previous/next navigation buttons
      if (current.querySelector(':scope > button[title*="Trang"], :scope > button[title*="trang"]')) {
        break;
      }
      current.style.zIndex = '9999';
      if (window.getComputedStyle(current).position === 'static') {
        current.style.position = 'relative';
      }
      current = current.parentElement;
    }
  }
}

/**
 * Resets the z-index after dragging ends.
 */
export function resetPageZIndex(pageNumber?: number, docId?: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('page-reset', { detail: { pageNumber, docId } }));
    try {
      if (!pageNumber || document.documentElement.dataset.gesturingPage === String(pageNumber)) {
        delete document.documentElement.dataset.gesturingPage;
        document.body.classList.remove('is-annotation-gesturing');
      }
    } catch (_) {}
  }
  if (pageNumber) {
    const pageEl = docId
      ? (document.getElementById(`page-container-${docId}-${pageNumber}`) || document.getElementById(`page-container-${pageNumber}`))
      : document.getElementById(`page-container-${pageNumber}`);
    if (pageEl) {
      let current: HTMLElement | null = pageEl;
      while (
        current &&
        current.tagName !== 'MAIN' &&
        !current.id.startsWith('pdf-transform-wrapper')
      ) {
        if (current.querySelector(':scope > button[title*="Trang"], :scope > button[title*="trang"]')) {
          break;
        }
        current.style.zIndex = '';
        current = current.parentElement;
      }
    }
  } else {
    const pageEls = docId
      ? document.querySelectorAll<HTMLElement>(`[id^="page-container-${docId}-"]`)
      : document.querySelectorAll<HTMLElement>('[id^="page-container-"]');
    pageEls.forEach((el) => {
      let current: HTMLElement | null = el;
      while (
        current &&
        current.tagName !== 'MAIN' &&
        !current.id.startsWith('pdf-transform-wrapper')
      ) {
        if (current.querySelector(':scope > button[title*="Trang"], :scope > button[title*="trang"]')) {
          break;
        }
        current.style.zIndex = '';
        current = current.parentElement;
      }
    });
  }
}


