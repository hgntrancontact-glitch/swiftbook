import type {DrawingStroke} from '../types';

export function hasStrokeEndpoints(stroke:Pick<DrawingStroke,'points'|'quickShape'|'isSmartShape'|'shapeType'>):boolean {
  if(stroke.quickShape || stroke.points.length<2)return false;
  if(stroke.isSmartShape && !['line','arrow','freehand'].includes(stroke.shapeType || ''))return false;
  const first=stroke.points[0],last=stroke.points[stroke.points.length-1];
  return Math.hypot(last.x-first.x,last.y-first.y)>0.001;
}
