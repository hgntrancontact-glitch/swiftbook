type Release = () => void;
type Job = { priority:number; resolve:(release:Release|null)=>void; preempt?:()=>void; preempting:boolean; granted:boolean; cancelled:boolean };

/** A granted slot is held until its actual render settles, including cancellation. */
export class PdfRenderQueue {
  private pending:Job[]=[];
  private running=new Set<Job>();
  private scheduled=false;
  peak=0;
  constructor(private defer:(callback:()=>void)=>void, private limit=2) {}
  get active() {return this.running.size;}
  get queued() {return this.pending.length;}
  private schedule() {
    if(this.scheduled) return;
    this.scheduled=true;
    this.defer(()=>{this.scheduled=false;this.pump();});
  }
  private preemptBackground() {
    let required=this.pending.filter(job=>job.priority<10).length-Math.max(0,this.limit-this.active);
    required-=[...this.running].filter(job=>job.preempting).length;
    if(required<=0)return;
    for(const job of this.running) if(job.priority>=10 && job.preempt && !job.preempting) {
      if(required--<=0)break;
      job.preempting=true;job.preempt();
    }
  }
  private pump() {
    this.pending.sort((a,b)=>a.priority-b.priority);
    while(this.active<this.limit && this.pending.length) {
      // Prefetch never fills the raster slots ahead of a visible page.
      const index=this.pending.findIndex(job=>job.priority<10 || this.active===0);
      if(index<0) return;
      const [job]=this.pending.splice(index,1);
      if(job.cancelled) {job.resolve(null);continue;}
      job.granted=true;this.running.add(job);this.peak=Math.max(this.peak,this.active);
      let released=false;
      job.resolve(()=>{if(released)return;released=true;this.running.delete(job);this.pump();});
    }
  }
  request(priority:number, preempt?:()=>void) {
    let resolve!:(release:Release|null)=>void;
    const promise=new Promise<Release|null>(done=>{resolve=done;});
    const job:Job={priority,resolve,preempt,preempting:false,granted:false,cancelled:false};
    this.pending.push(job);this.preemptBackground();this.schedule();
    return {promise,
      cancel:()=>{
        if(job.granted || job.cancelled)return;
        job.cancelled=true;this.pending=this.pending.filter(other=>other!==job);job.resolve(null);this.schedule();
      },
      setPriority:(value:number)=>{
        if(job.cancelled)return;
        job.priority=value;
        this.preemptBackground();
        if(!job.granted)this.schedule();
      },
    };
  }
}
