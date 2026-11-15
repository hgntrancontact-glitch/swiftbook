/** Persist the fitted PDF scale corresponding to the viewer's 100% zoom.
 * Tool sizes are CSS pixels at that reference, regardless of creation zoom. */
export function annotationCreationScale(pageScale:number,userZoom:number):number {
  const zoom=Number.isFinite(userZoom) && userZoom>0?userZoom:1;
  return Number.isFinite(pageScale) && pageScale>0?pageScale/zoom:1;
}
