import type {DrawingStroke} from '../types';
export type TemporaryShape=DrawingStroke & {fileId:string;expiresAt:number};
type Options={now:()=>number;schedule:(callback:()=>void,delay:number)=>unknown;cancel:(timer:unknown)=>void;changed:(shapes:TemporaryShape[])=>void};
/** Timers belong to the workspace, so scrolling/unmounting a page cannot restart 3 seconds. */
export class TemporaryShapes {
  private shapes=new Map<string,TemporaryShape>();
  private timers=new Map<string,unknown>();
  constructor(private options:Options) {}
  private emit(){this.options.changed([...this.shapes.values()]);}
  add(shape:DrawingStroke,fileId:string) {
    this.remove(shape.id,false);
    this.shapes.set(shape.id,{...shape,fileId,expiresAt:this.options.now()+3000});
    this.timers.set(shape.id,this.options.schedule(()=>this.remove(shape.id),3000));this.emit();
  }
  update(id:string,patch:Partial<DrawingStroke>) {
    const old=this.shapes.get(id);if(!old) return;
    this.shapes.set(id,{...old,...patch,id:old.id,fileId:old.fileId,expiresAt:old.expiresAt});this.emit();
  }
  remove(id:string,notify=true) {
    if(this.timers.has(id)) this.options.cancel(this.timers.get(id));
    this.timers.delete(id);const removed=this.shapes.delete(id);if(removed && notify)this.emit();
  }
  prune() {
    let changed=false;
    for(const shape of this.shapes.values()) if(shape.expiresAt<=this.options.now()) {this.remove(shape.id,false);changed=true;}
    if(changed)this.emit();
  }
  clear(notify=true) {
    for(const timer of this.timers.values()) this.options.cancel(timer);
    this.timers.clear();this.shapes.clear();if(notify)this.emit();
  }
}
