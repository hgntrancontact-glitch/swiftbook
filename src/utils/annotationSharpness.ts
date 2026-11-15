/** Align the displayed UI to physical pixels without changing its scale policy. */
export function snapUiPixel(value:number,dpr:number):number {
  const ratio=Number.isFinite(dpr) && dpr>0?dpr:1;
  return Math.round(value*ratio)/ratio;
}

export function pageLabelZoom(zoom:number):number {
  const value=Number.isFinite(zoom) && zoom>0?zoom:1;
  return 1+Math.min(.35,.3*Math.abs(value-1));
}

/** Match the glyph's physical-pixel parity to its box, so flex centring does
 * not introduce a half-pixel origin even after both sizes were rounded. */
export function centeredGlyphSize(outer:number,border:number,glyph:number,dpr:number):number {
  const inner=Math.max(1,Math.round((outer-2*border)*dpr));
  let pixels=Math.max(1,Math.round(glyph*dpr));
  if((inner-pixels)%2!==0) pixels+=1;
  return Math.min(inner,pixels)/dpr;
}

type Metrics={font?:number;line?:number;width?:number;height?:number;stroke?:number;viewWidth?:number};
const metrics=new WeakMap<Element,Metrics>();
/** CSS zoom lays out the card at its original design size. Round leaf text and
 * SVG dimensions at the final device size so small labels/strokes do not land
 * on arbitrary fractional pixel sizes. Always derive from the unmodified base. */
export function sharpenAnnotation(root:HTMLElement,scale:number,dpr:number) {
  const elements=[root,...root.querySelectorAll<HTMLElement|SVGSVGElement>('*')].filter(element=>
    element.tagName.toLowerCase()==='svg' || element.matches('input,textarea') ||
    [...element.childNodes].some(node=>node.nodeType===3 && node.textContent?.trim()));
  const measured=elements.map(element=> {
    let base=metrics.get(element);
    if(!base) {
      const style=getComputedStyle(element);
      if(element.tagName.toLowerCase()==='svg') {
        base={width:parseFloat(element.getAttribute('width')||style.width),height:parseFloat(element.getAttribute('height')||style.height),
          stroke:parseFloat(element.getAttribute('stroke-width')||'0'),viewWidth:(element as SVGSVGElement).viewBox.baseVal.width || 24};
      } else base={font:parseFloat(style.fontSize),line:parseFloat(style.lineHeight)};
      metrics.set(element,base);
    }
    return {element,base};
  });
  const length=(value:number)=>`${Math.max(1/dpr,snapUiPixel(value*scale,dpr))/scale}px`;
  for(const {element,base} of measured) {
    if(base.font) element.style.fontSize=length(base.font);
    if(base.line) element.style.lineHeight=length(base.line);
    if(base.width && base.height) {
      element.style.width=length(base.width);element.style.height=length(base.height);
      if(base.stroke && base.viewWidth) {
        const width=parseFloat(element.style.width)*scale;
        element.style.strokeWidth=String(Math.max(1/dpr,snapUiPixel(base.stroke*width/base.viewWidth,dpr))*base.viewWidth/width);
      }
    }
  }
  // Respect native font rendering rather than inherited grayscale smoothing,
  // which makes the already-small note text appear thin on macOS displays.
  root.style.setProperty('-webkit-font-smoothing','auto');
}
