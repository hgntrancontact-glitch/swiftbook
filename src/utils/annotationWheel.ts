// Fixed annotation UI is portalled outside the PDF's native scroll tree.
// Preserve its existing scroll/pinch routing to the owning document.
export function routeAnnotationWheel(event: WheelEvent, viewport: HTMLElement, scrollRoot: HTMLElement | null): void {
  event.preventDefault();
  event.stopPropagation();
  if (!event.ctrlKey && !event.metaKey && scrollRoot?.contains(event.target as Node)) {
    let element = event.target instanceof HTMLElement ? event.target : (event.target as Element | null)?.parentElement;
    while (element && scrollRoot.contains(element)) {
      const remaining = element.scrollHeight - element.clientHeight;
      const overflow = getComputedStyle(element).overflowY;
      if ((overflow === 'auto' || overflow === 'scroll') && ((event.deltaY > 0 && element.scrollTop < remaining) || (event.deltaY < 0 && element.scrollTop > 0))) {
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
        element.scrollTop += event.deltaY * unit;
        return;
      }
      if (element === scrollRoot) break;
      element = element.parentElement;
    }
  }
  const forwarded = new WheelEvent('wheel', {
    deltaX: event.deltaX, deltaY: event.deltaY, deltaZ: event.deltaZ, deltaMode: event.deltaMode,
    ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, altKey: event.altKey,
    clientX: event.clientX, clientY: event.clientY, bubbles: true, cancelable: true,
  });
  viewport.dispatchEvent(forwarded);
  if (!forwarded.defaultPrevented && !event.ctrlKey && !event.metaKey) {
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
    viewport.scrollLeft += (event.deltaX || (event.shiftKey ? event.deltaY : 0)) * unit;
    if (!event.shiftKey) viewport.scrollTop += event.deltaY * unit;
  }
}
