/** Use the same page-space dash rhythm in live previews, saved SVGs and exports. */
export function drawingDashArray(style:'solid'|'dashed'|undefined,scale:number,referenceScale=1,live=1):string|undefined {
  const unit=scale/(referenceScale || 1)*live;
  return style==='dashed'?`${6*unit} ${4*unit}`:undefined;
}
