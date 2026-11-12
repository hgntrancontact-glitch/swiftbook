export type WheelAxis = 'x' | 'y';

/** Lock the dominant axis for one wheel/momentum sequence. Small trackpad
 * noise cannot switch documents or pull a vertical read sideways. */
export class WheelGesture {
  private axis:WheelAxis|null=null;
  private last=-Infinity;
  private x=0;
  private y=0;
  reset() {this.axis=null;this.last=-Infinity;this.x=this.y=0;}
  read(dx:number,dy:number,now:number):{axis:WheelAxis|null;delta:number} {
    if(now-this.last>180) {this.axis=null;this.x=0;this.y=0;}
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

export function wheelOwner(axis:WheelAxis,zoom:number,contentWidth:number,viewWidth:number,documents:number):'pdf'|'workspace' {
  return axis==='x' && zoom<=1.0001 && contentWidth<=viewWidth+1 && documents>2 ? 'workspace':'pdf';
}
