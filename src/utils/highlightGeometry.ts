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
    const combinedHeight = group ? Math.max(rect.y + rect.height, ...group.map(r => r.y + r.height)) - Math.min(rect.y, ...group.map(r => r.y)) : 0;
    if(group && combinedHeight <= Math.max(rect.height, ...group.map(r => r.height)) * 1.65
      && group.some(other=>Math.abs(other.y+other.height/2-rect.y-rect.height/2)<Math.min(other.height,rect.height)*.35)) group.push(rect);
    else groups.push([rect]);
  }
  const rows = groups.map(group => ({ group,
    x: Math.min(...group.map(r => r.x)), right: Math.max(...group.map(r => r.x + r.width)),
    y: Math.min(...group.map(r => r.y)), bottom: Math.max(...group.map(r => r.y + r.height)),
  }));
  const bounds = new Map<NormalizedRect, { y: number; height: number }>();
  for (const row of rows) {
    let above = (row.bottom - row.y) * 0.08, below = above;
    for (const other of rows) {
      if (other === row || Math.min(row.right, other.right) <= Math.max(row.x, other.x)) continue;
      if (other.bottom <= row.y) above = Math.min(above, (row.y - other.bottom) / 2.1);
      if (other.y >= row.bottom) below = Math.min(below, (other.y - row.bottom) / 2.1);
    }
    // Apply neighbouring-line clearance once to the entire row. Per-fragment
    // clearance can give the left and right halves different upper/lower edges.
    const y = Math.max(0, row.y - Math.max(0, above));
    const height = Math.min(100, row.bottom + Math.max(0, below)) - y;
    row.group.forEach(rect => bounds.set(rect, { y, height }));
  }
  return rects.map(({ rise, ...rect }, i) => ({ ...rect, ...bounds.get(rects[i])! }));
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
