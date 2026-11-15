import {HIGHLIGHT_NOTE_ICON_SIZE} from './annotationUi';
export type PagePoint = {x:number;y:number;dx:number;dy:number};
/** Percentages locate the PDF ink; pixel offsets describe UI at committed zoom.
 * CSS applies the live gesture only once, without screen-to-page round trips. */
export function pageNoteGeometry(rect:{x:number;y:number;width:number;height:number;rise:number},zoom:number,above:boolean,popupHeight:number,popupWidth:number,offsetX=0) {
  const icon=HIGHLIGHT_NOTE_ICON_SIZE*zoom,gap=6*zoom;
  const at:PagePoint={x:rect.x+rect.width,y:above?rect.y+Math.max(0,rect.rise):rect.y+rect.height-Math.max(0,-rect.rise),dx:-icon/2,dy:above?-icon+5*zoom:-5*zoom};
  const popup:PagePoint={...at,dx:at.dx+icon-popupWidth+offsetX*zoom,dy:above?at.dy-gap-popupHeight:at.dy+icon+gap};
  // Cover the route even when the popup is shifted sideways to fit the view.
  // One pixel of overlap avoids hit-test cracks after device-pixel alignment.
  const overlap=zoom;
  const left=Math.min(at.dx,popup.dx),right=Math.max(at.dx+icon,popup.dx+popupWidth);
  const upper=above?{x:popup.dx,width:popupWidth}:{x:at.dx,width:icon};
  const lower=above?{x:at.dx,width:icon}:{x:popup.dx,width:popupWidth};
  const percent=(x:number)=>(x-left)/(right-left)*100;
  const bridge={...popup,dx:left,dy:(above?popup.dy+popupHeight:at.dy)-overlap,
    width:right-left,height:gap+icon+2*overlap,
    clipPath:`polygon(${percent(upper.x)}% 0%, ${percent(upper.x+upper.width)}% 0%, ${percent(lower.x+lower.width)}% 100%, ${percent(lower.x)}% 100%)`};
  return {icon:at,popup,bridge};
}

export function pointStyle(point:PagePoint) {
  return {left:`calc(${point.x}% + ${point.dx}px * var(--pdf-live-zoom, 1))`,top:`calc(${point.y}% + ${point.dy}px * var(--pdf-live-zoom, 1))`};
}
