export type WheelAxis = 'x' | 'y';
export const WHEEL_IDLE_MS=180;

/** Lock the dominant axis for one wheel/momentum sequence. Small trackpad
 * noise cannot switch documents or pull a vertical read sideways. */
export class WheelGesture {
  private axis:WheelAxis|null=null;
  private last=-Infinity;
  private x=0;
  private y=0;
  reset() {this.axis=null;this.last=-Infinity;this.x=this.y=0;}
  read(dx:number,dy:number,now:number):{axis:WheelAxis|null;delta:number} {
    if(now-this.last>WHEEL_IDLE_MS) {this.axis=null;this.x=0;this.y=0;}
    this.last=now;
    if(this.axis) return {axis:this.axis,delta:this.axis==='x'?dx:dy};
    this.x+=dx;this.y+=dy;
    const x=Math.abs(this.x),y=Math.abs(this.y);
    if(Math.max(x,y)<8) return {axis:null,delta:0};
    // Ambiguous diagonals favour reading vertically. Once decided, inertia
    // keeps that axis until the next gesture, even if its last ticks wobble.
    this.axis=x>y*1.5?'x':'y';
    const delta=this.axis==='x'?this.x:this.y;
    this.x=this.y=0;
    return {axis:this.axis,delta};
  }
}

/** One router for the whole workspace, not one per PDF under the pointer.
 * Once assigned, even inertia crossing a neighbouring PDF keeps its owner.
 * PDFs retain both pan axes; dominant-axis detection is only for routing. */
export class WorkspaceWheelRouter<T> {
  private gesture=new WheelGesture();
  private last=-Infinity;
  private choose:((axis:WheelAxis)=>T)|null=null;
  private owner:T|undefined;
  private x=0;
  private y=0;
  reset() {this.gesture.reset();this.last=-Infinity;this.choose=null;this.owner=undefined;this.x=this.y=0;}
  read(dx:number,dy:number,now:number,choose:(axis:WheelAxis)=>T) {
    if(now-this.last>WHEEL_IDLE_MS) this.reset();
    this.last=now;
    this.choose ||= choose;
    this.x+=dx;this.y+=dy;
    const intent=this.gesture.read(dx,dy,now);
    if(!intent.axis) return null;
    if(this.owner===undefined) this.owner=this.choose(intent.axis);
    const result={owner:this.owner,axis:intent.axis,dx:this.x,dy:this.y};
    this.x=this.y=0;
    return result;
  }
}

export function wheelOwner(axis:WheelAxis,zoom:number,contentWidth:number,viewWidth:number,documents:number):'pdf'|'workspace' {
  return axis==='x' && zoom<=1.0001 && contentWidth<=viewWidth+1 && documents>2 ? 'workspace':'pdf';
}
