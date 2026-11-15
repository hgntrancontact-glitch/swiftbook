import React,{useEffect,useRef,useState} from 'react';
import {ArrowUpRight,Minus,Square,Shapes,Timer,Eraser,X,ChevronDown} from 'lucide-react';
import type {ActiveTool,QuickShapeTool} from '../types';
import {useQuickShapes} from '../contexts/QuickShapesContext';
import {isQuickShapeTool} from '../utils/quickShapes';
type Props={activeTool:ActiveTool;onActiveToolChange:(tool:ActiveTool)=>void};
const tools:{tool:QuickShapeTool;label:string;icon:typeof ArrowUpRight;temporary?:boolean}[]=[
  {tool:'quick_arrow',label:'Mũi tên',icon:ArrowUpRight},
  {tool:'quick_line',label:'Đường Line',icon:Minus},
  {tool:'quick_rectangle',label:'Khung chữ nhật',icon:Square},
  {tool:'quick_arrow_temporary',label:'Mũi tên tạm — mất sau 3 giây',icon:ArrowUpRight,temporary:true},
  {tool:'quick_line_temporary',label:'Line tạm — mất sau 3 giây',icon:Minus,temporary:true},
  {tool:'quick_rectangle_temporary',label:'Khung tạm — mất sau 3 giây',icon:Square,temporary:true},
];
export function QuickShapesToggle({activeTool,onActiveToolChange}:Props) {
  const state=useQuickShapes();if(!state)return null;
  const chosen=isQuickShapeTool(activeTool);
  return <button data-quick-shape-ui type="button" aria-label="Mũi tên, Line và khung" title="Mũi tên, Line và khung"
    aria-expanded={state.open} onClick={()=>{
      if(state.open && chosen){state.setOpen(false);onActiveToolChange('select');}
      else {state.setOpen(true);onActiveToolChange(state.lastTool);}
    }} className={`p-2 rounded-full transition-all flex items-center justify-center text-xs font-semibold ${chosen?'bg-neutral-900 text-white shadow-xs':'text-neutral-700 hover:bg-neutral-100'}`}>
    <Shapes size={15}/>
  </button>;
}
export function QuickShapesPanel(props:Props) {
  const state=useQuickShapes();return state?<Panel {...props} state={state}/>:null;
}
function Panel({activeTool,onActiveToolChange,state}:Props & {state:NonNullable<ReturnType<typeof useQuickShapes>>}) {
  const [popover,setPopover]=useState<'size'|'color'|null>(null);
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!isQuickShapeTool(activeTool)){state.setOpen(false);setPopover(null);}
  },[activeTool]);
  useEffect(()=>{
    if(!state.open)setPopover(null);
  },[state.open]);
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setPopover(null);};
    document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
  },[]);
  if(!state.open || !isQuickShapeTool(activeTool))return null;
  const choose=(tool:QuickShapeTool)=>{state.setLastTool(tool);onActiveToolChange(tool);setPopover(null);};
  const button=(chosen:boolean)=>`p-2 rounded-full flex items-center justify-center transition-colors cursor-pointer shrink-0 ${chosen?'bg-neutral-900 text-white shadow-xs':'text-neutral-600 hover:bg-neutral-100'}`;
  return <div ref={root} data-quick-shape-ui className="absolute bottom-full mb-2.5 left-1/2 -translate-x-1/2 z-50 w-max max-w-[95vw]">
    <div className="bg-white/95 backdrop-blur-md rounded-full shadow-2xl border border-neutral-200/90 px-2.5 py-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar">
      {tools.map(({tool,label,icon:Icon,temporary},index)=><React.Fragment key={tool}>
        {index===3 && <div className="w-px h-4 bg-neutral-200 mx-1 shrink-0"/>}
        <button type="button" className={`${button(activeTool===tool)} relative`} title={label} aria-label={label} aria-pressed={activeTool===tool} onClick={()=>choose(tool)}>
          <Icon size={18}/>{temporary && <Timer size={9} className="absolute bottom-0.5 right-0.5 text-[#d9a900]"/>}
        </button>
      </React.Fragment>)}
      <div className="w-px h-4 bg-neutral-200 mx-1 shrink-0"/>
      <button type="button" className={button(activeTool==='quick_eraser')} title="Xóa hình trong nhóm công cụ này" aria-label="Xóa hình nhanh" onClick={()=>choose('quick_eraser')}><Eraser size={18}/></button>
      <button type="button" className={`${button(popover==='size')} gap-1 text-[11px] font-medium`} title="Độ dày nét" aria-label="Độ dày nét" onClick={()=>setPopover(popover==='size'?null:'size')}>
        {state.settings.size}px<ChevronDown size={10}/>
      </button>
      <button type="button" className={button(popover==='color')} title="Màu nét" aria-label="Màu nét" onClick={()=>setPopover(popover==='color'?null:'color')}>
        <span className="w-4 h-4 rounded-full border border-black/10" style={{backgroundColor:state.settings.color}}/>
      </button>
      <button type="button" className={`${button(state.settings.dashStyle==='dashed')} text-[11px] gap-1`} title={state.settings.dashStyle==='solid'?'Nét liền — nhấn để đổi nét đứt':'Nét đứt — nhấn để đổi nét liền'}
        aria-label="Đổi nét liền hoặc nét đứt" aria-pressed={state.settings.dashStyle==='dashed'} onClick={()=>state.updateSettings({dashStyle:state.settings.dashStyle==='solid'?'dashed':'solid'})}>
        <svg width="20" height="14" aria-hidden="true"><path d="M1 7H19" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray={state.settings.dashStyle==='dashed'?'4 3':undefined}/></svg>
      </button>
      <button type="button" className={button(false)} title="Đóng thanh công cụ" aria-label="Đóng thanh công cụ hình nhanh" onClick={()=>{state.setOpen(false);state.setSelection(null);onActiveToolChange('select');}}><X size={15}/></button>
    </div>
    {popover==='size' && <div className="absolute bottom-full right-2 mb-2 bg-white rounded-xl border border-neutral-200 shadow-xl p-3 w-56 text-xs">
      <label className="flex items-center justify-between gap-3 mb-2">Độ dày nét
        <input aria-label="Độ dày hình nhanh (px)" type="number" min={1} max={30} value={state.settings.size}
          className="w-14 rounded-md border border-neutral-200 px-1.5 py-1 text-right" onChange={e=>{const n=Number(e.target.value);if(n>=1 && n<=30)state.updateSettings({size:n});}}/>
      </label>
      <input aria-label="Điều chỉnh độ dày hình nhanh" type="range" min={1} max={30} value={state.settings.size} className="w-full accent-[#f5c41a]" onChange={e=>state.updateSettings({size:Number(e.target.value)})}/>
    </div>}
    {popover==='color' && <div className="absolute bottom-full right-2 mb-2 bg-white rounded-xl border border-neutral-200 shadow-xl p-3 flex items-center gap-2">
      {['#ef4444','#171717','#3b82f6','#22c55e','#eab308'].map(color=><button key={color} type="button" aria-label={`Chọn màu ${color}`} className={`w-6 h-6 rounded-full border border-black/10 ${state.settings.color===color?'ring-2 ring-neutral-900 ring-offset-2':''}`} style={{backgroundColor:color}} onClick={()=>state.updateSettings({color})}/>)}
      <input type="color" aria-label="Chọn màu khác cho hình nhanh" value={state.settings.color} onChange={e=>state.updateSettings({color:e.target.value})} className="w-7 h-7 cursor-pointer bg-transparent"/>
    </div>}
  </div>;
}
