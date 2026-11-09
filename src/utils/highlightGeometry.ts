import type { NormalizedRect } from '../types';

/** Display geometry is shared by selections, saved annotations and exports.
 * Keep stored OCR coordinates intact; old sloping highlights also become level.
 */
export function highlightDisplayRects(rects: NormalizedRect[], isText = true): NormalizedRect[] {
  if (!isText) return rects;
  // Form each row once. Independent pairwise comparisons gave three fragments
  // three different bounds when A matched B, B matched C, but A missed C.
  const groups: NormalizedRect[][]=[];
  for(const rect of [...rects].sort((a,b)=>a.y+a.height/2-b.y-b.height/2)) {
    const group=groups.at(-1);
    if(group && group.some(other=>Math.abs(other.y+other.height/2-rect.y-rect.height/2)<Math.min(other.height,rect.height)*.35)) group.push(rect);
    else groups.push([rect]);
  }
  const bounds=new Map<NormalizedRect,{y:number;height:number}>();
  for(const group of groups) {
    const y=Math.min(...group.map(r=>r.y)),bottom=Math.max(...group.map(r=>r.y+r.height));
    for(const rect of group) bounds.set(rect,{y,height:bottom-y});
  }
  const rows=rects.map(({rise,...rect},i)=>({...rect,...bounds.get(rects[i])!}));
  return rows.map(rect => {
    let above = rect.height * 0.18, below = above;
    for (const other of rows) {
      if (other === rect || Math.min(rect.x + rect.width, other.x + other.width) <= Math.max(rect.x, other.x)) continue;
      if (other.y + other.height <= rect.y) above = Math.min(above, (rect.y - other.y - other.height) / 2.1);
      if (other.y >= rect.y + rect.height) below = Math.min(below, (other.y - rect.y - rect.height) / 2.1);
    }
    const y = Math.max(0, rect.y - Math.max(0, above));
    return { ...rect, y, height: Math.min(100, rect.y + rect.height + Math.max(0, below)) - y };
  });
}

/** Same quadrilateral for preview, hit testing, saved highlight and export. */
export function highlightCorners(r: NormalizedRect): [number,number][] {
  const rise=Math.max(-r.height,Math.min(r.height,r.rise || 0));
  return [[r.x,r.y+Math.max(0,-rise)],[r.x+r.width,r.y+Math.max(0,rise)],
    [r.x+r.width,r.y+r.height-Math.max(0,-rise)],[r.x,r.y+r.height-Math.max(0,rise)]];
}

export function highlightClip(r: NormalizedRect): string | undefined {
  if(!r.rise || !r.height) return undefined;
  return `polygon(${highlightCorners(r).map(([x,y])=>`${(x-r.x)/r.width*100}% ${(y-r.y)/r.height*100}%`).join(',')})`;
}
