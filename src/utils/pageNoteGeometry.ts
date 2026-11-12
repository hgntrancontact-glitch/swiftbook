export type PagePoint = {x:number;y:number;dx:number;dy:number};
/** Percentages locate the PDF ink; pixel offsets describe UI at committed zoom.
 * CSS applies the live gesture only once, without screen-to-page round trips. */
export function pageNoteGeometry(rect:{x:number;y:number;width:number;height:number;rise:number},zoom:number,above:boolean,popupHeight:number,popupWidth:number,offsetX=0) {
  const icon=18.5*zoom,gap=6*zoom;
  const at:PagePoint={x:rect.x+rect.width,y:above?rect.y+Math.max(0,rect.rise):rect.y+rect.height-Math.max(0,-rect.rise),dx:-icon/2,dy:above?-icon+5*zoom:-5*zoom};
  const popup:PagePoint={...at,dx:at.dx+icon-popupWidth+offsetX*zoom,dy:above?at.dy-gap-popupHeight:at.dy+icon+gap};
  const bridge:PagePoint={...popup,dy:above?popup.dy+popupHeight:at.dy+icon};
  return {icon:at,popup,bridge};
}

export function pointStyle(point:PagePoint) {
  return {left:`calc(${point.x}% + ${point.dx}px * var(--pdf-live-zoom, 1))`,top:`calc(${point.y}% + ${point.dy}px * var(--pdf-live-zoom, 1))`};
}
