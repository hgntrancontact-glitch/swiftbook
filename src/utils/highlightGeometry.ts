import type { NormalizedRect } from '../types';

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
