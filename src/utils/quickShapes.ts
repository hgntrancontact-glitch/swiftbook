import type {ActiveTool,DrawingPoint,DrawingStroke,QuickShapeKind,QuickShapeTool} from '../types';

export interface QuickShapeSettings {color:string;size:number;dashStyle:'solid'|'dashed'}
export const DEFAULT_QUICK_SHAPE_SETTINGS:QuickShapeSettings={color:'#ef4444',size:4,dashStyle:'solid'};
export function isQuickShapeTool(tool:ActiveTool):tool is QuickShapeTool {return tool.startsWith('quick_');}
export function quickToolKind(tool:QuickShapeTool):QuickShapeKind {
  return tool.includes('rectangle')?'rectangle':tool.includes('line')?'line':'arrow';
}
export function quickPoints(kind:QuickShapeKind,start:DrawingPoint,end:DrawingPoint,shift=false):DrawingPoint[] {
  const last={x:Math.max(0,Math.min(100,end.x)),y:Math.max(0,Math.min(100,end.y))};
  if(kind==='rectangle') return [{...start},{x:Math.max(start.x,last.x),y:Math.max(start.y,last.y)}];
  if(shift) last.y=start.y;
  return [{...start},{x:(start.x+last.x)/2,y:(start.y+last.y)/2},last];
}
export function quickGeometry(stroke:Pick<DrawingStroke,'points'|'quickShape'|'size'|'referenceScale'>,width:number,height:number,scale:number) {
  const px=(p:DrawingPoint)=>({x:p.x/100*width,y:p.y/100*height});
  const start=px(stroke.points[0]),end=px(stroke.points[stroke.points.length-1]);
  const unit=scale/(stroke.referenceScale || 1),lineWidth=stroke.size*unit;
  if(stroke.quickShape==='rectangle') {
    const left=Math.min(start.x,end.x),top=Math.min(start.y,end.y),right=Math.max(start.x,end.x),bottom=Math.max(start.y,end.y);
    return {start,end,control:null,arrow:[] as DrawingPoint[],lineWidth,unit,
      path:`M ${left} ${top} L ${right} ${top} L ${right} ${bottom} L ${left} ${bottom} Z`,
      shaft:`M ${left} ${top} L ${right} ${top} L ${right} ${bottom} L ${left} ${bottom} Z`,head:''};
  }
  const mid=px(stroke.points[1] || {x:(stroke.points[0].x+stroke.points.at(-1)!.x)/2,y:(stroke.points[0].y+stroke.points.at(-1)!.y)/2});
  // The middle handle lies ON the curve, rather than on an invisible control point.
  const control={x:2*mid.x-(start.x+end.x)/2,y:2*mid.y-(start.y+end.y)/2};
  let dx=end.x-control.x,dy=end.y-control.y;
  if(Math.hypot(dx,dy)<1e-6) {dx=end.x-start.x;dy=end.y-start.y;}
  const length=Math.max(12*unit,lineWidth*3),angle=Math.atan2(dy,dx);
  const arrow=stroke.quickShape==='arrow' && Math.hypot(dx,dy)>1e-6?[{x:end.x-length*Math.cos(angle-Math.PI/6),y:end.y-length*Math.sin(angle-Math.PI/6)},end,
    {x:end.x-length*Math.cos(angle+Math.PI/6),y:end.y-length*Math.sin(angle+Math.PI/6)}]:[];
  const head=arrow.length?` M ${arrow[0].x} ${arrow[0].y} L ${end.x} ${end.y} L ${arrow[2].x} ${arrow[2].y}`:'';
  const shaft=`M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
  return {start,end,control,arrow,lineWidth,unit,path:shaft+head,shaft,head};
}
export function quickHandles(stroke:Pick<DrawingStroke,'points'|'quickShape'>):DrawingPoint[] {
  if(stroke.quickShape!=='rectangle') return stroke.points;
  const [a,b]=stroke.points;
  return [a,{x:b.x,y:a.y},b,{x:a.x,y:b.y}];
}
export function moveQuickHandle(stroke:DrawingStroke,index:number,point:DrawingPoint):DrawingPoint[] {
  if(stroke.quickShape!=='rectangle') return stroke.points.map((p,i)=>i===index?point:p);
  const [a,b]=stroke.points;
  return index===0?[point,b]:index===2?[a,point]:index===1?[{x:a.x,y:point.y},{x:point.x,y:b.y}]:[{x:point.x,y:a.y},{x:b.x,y:point.y}];
}
export function translateQuickPoints(points:DrawingPoint[],dx:number,dy:number) {
  const x=Math.max(-Math.min(...points.map(p=>p.x)),Math.min(100-Math.max(...points.map(p=>p.x)),dx));
  const y=Math.max(-Math.min(...points.map(p=>p.y)),Math.min(100-Math.max(...points.map(p=>p.y)),dy));
  return points.map(p=>({x:p.x+x,y:p.y+y}));
}
export function hitQuickShape(stroke:DrawingStroke,point:DrawingPoint,width:number,height:number,scale:number,radius=12):boolean {
  const g=quickGeometry(stroke,width,height,scale),p={x:point.x/100*width,y:point.y/100*height};
  const distance=(a:DrawingPoint,b:DrawingPoint)=>{
    const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy || 1)));
    return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<=radius+g.lineWidth/2;
  };
  if(!g.control) {
    const [a,b]=[g.start,g.end],corners=[a,{x:b.x,y:a.y},b,{x:a.x,y:b.y},a];
    return corners.slice(1).some((b,i)=>distance(corners[i],b));
  }
  let previous=g.start;
  for(let i=1;i<=48;i++) {
    const t=i/48,u=1-t,current={x:u*u*g.start.x+2*u*t*g.control.x+t*t*g.end.x,y:u*u*g.start.y+2*u*t*g.control.y+t*t*g.end.y};
    if(distance(previous,current)) return true;previous=current;
  }
  return g.arrow.slice(1).some((b,i)=>distance(g.arrow[i],b));
}
/** Canvas exports replay the exact same curve/arrow geometry as the SVG overlay. */
export function drawQuickShape(ctx:CanvasRenderingContext2D,stroke:DrawingStroke,width:number,height:number,scale:number) {
  const g=quickGeometry(stroke,width,height,scale);
  ctx.lineWidth=g.lineWidth;ctx.setLineDash(stroke.dashStyle==='dashed'?[6*g.unit,4*g.unit]:[]);
  ctx.beginPath();ctx.moveTo(g.start.x,g.start.y);
  if(g.control) ctx.quadraticCurveTo(g.control.x,g.control.y,g.end.x,g.end.y);
  else {ctx.lineTo(g.end.x,g.start.y);ctx.lineTo(g.end.x,g.end.y);ctx.lineTo(g.start.x,g.end.y);ctx.closePath();}
  ctx.stroke();
  if(g.arrow.length) {
    ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(g.arrow[0].x,g.arrow[0].y);ctx.lineTo(g.arrow[1].x,g.arrow[1].y);ctx.lineTo(g.arrow[2].x,g.arrow[2].y);ctx.stroke();
  }
}
