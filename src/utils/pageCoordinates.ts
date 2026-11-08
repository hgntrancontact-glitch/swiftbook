// A PDF viewport can have fractional dimensions while a backing canvas cannot.
// Fit the complete viewport to the integer buffer so page-relative overlays
// and rendered text share exactly the same extent at every zoom/export scale.
export function canvasViewportTransform(viewport: { width: number; height: number }, canvas: { width: number; height: number }): [number, number, number, number, number, number] {
  return [canvas.width / viewport.width, 0, 0, canvas.height / viewport.height, 0, 0];
}
