/** Align the displayed UI to physical pixels without changing its scale policy. */
export function snapUiPixel(value:number,dpr:number):number {
  const ratio=Number.isFinite(dpr) && dpr>0?dpr:1;
  return Math.round(value*ratio)/ratio;
}

export function pageLabelZoom(zoom:number):number {
  const value=Number.isFinite(zoom) && zoom>0?zoom:1;
  return 1+Math.min(.35,.3*Math.abs(value-1));
}
