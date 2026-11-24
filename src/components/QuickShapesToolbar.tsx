import React,{useEffect,useRef,useState} from 'react';
import {ArrowUpRight,Minus,Square,Shapes,Eraser,X,ChevronDown,Pencil,Highlighter,PencilRuler,Sparkles} from 'lucide-react';
import type {ActiveTool,QuickShapeTool} from '../types';
import {useQuickShapes} from '../contexts/QuickShapesContext';
import {isQuickShapeTool,isDrawingHighlighter} from '../utils/quickShapes';
import {StrokeWidthInput,STROKE_SLIDER_MAX} from './StrokeWidthInput';
type Props={activeTool:ActiveTool;onActiveToolChange:(tool:ActiveTool)=>void};
export const DRAWING_COLORS=[
  {name:'Đen',hex:'#171717'},{name:'Xám đậm',hex:'#4b5563'},{name:'Xám nhạt',hex:'#9ca3af'},
  {name:'Tím',hex:'#a855f7'},{name:'Xanh lam',hex:'#3b82f6'},{name:'Xanh lá',hex:'#22c55e'},
  {name:'Vàng',hex:'#eab308'},{name:'Cam',hex:'#f97316'},{name:'Đỏ',hex:'#ef4444'},{name:'Hồng',hex:'#ec4899'},
];
const shapes:{tool:QuickShapeTool;label:string;icon:typeof ArrowUpRight;temporary?:boolean}[]=[
  {tool:'quick_arrow',label:'Mũi tên',icon:ArrowUpRight},{tool:'quick_line',label:'Đường Line',icon:Minus},
  {tool:'quick_rectangle',label:'Khung chữ nhật',icon:Square},
  {tool:'quick_arrow_temporary',label:'Mũi tên tạm — mất sau 3 giây',icon:ArrowUpRight,temporary:true},
  {tool:'quick_line_temporary',label:'Line tạm — mất sau 3 giây',icon:Minus,temporary:true},
  {tool:'quick_rectangle_temporary',label:'Khung tạm — mất sau 3 giây',icon:Square,temporary:true},
];
const pens:{tool:ActiveTool;label:string;icon:typeof Pencil;smart?:boolean}[]=[
  {tool:'pen',label:'Bút vẽ tự do',icon:Pencil},{tool:'highlighter',label:'Highlight tự do',icon:Highlighter},
  {tool:'smart_pen',label:'Bút vẽ thông minh',icon:PencilRuler,smart:true},
  {tool:'smart_highlighter',label:'Highlight thông minh',icon:Highlighter,smart:true},
];
function ShapeToolIcon({icon:Icon,temporary}:{icon:typeof ArrowUpRight;temporary?:boolean}) {
  const glyph=(className?:string)=>Icon===ArrowUpRight?
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20 20 4M4 4h16v16"/></svg>:
    <Icon className={className} size={24} strokeWidth={1.8} aria-hidden="true"/>;
  return temporary?<span className="drawing-temporary-icon" aria-hidden="true">{glyph('drawing-temporary-gold')}{glyph('drawing-temporary-black')}</span>:glyph();
}
export function QuickShapesToggle({activeTool,onActiveToolChange}:Props) {
  const state=useQuickShapes();if(!state)return null;
  const chosen=state.group==='quick' && (isQuickShapeTool(activeTool) || activeTool==='eraser');
  return <button data-quick-shape-ui type="button" aria-label="Mũi tên, Line và khung" title="Mũi tên, Line và khung"
    aria-expanded={state.open && state.group==='quick'} onClick={()=>{
      if(state.open && chosen){state.setOpen(false);onActiveToolChange('select');}
      else {state.setGroup('quick');state.setOpen(true);onActiveToolChange(state.lastTool==='quick_eraser'?'quick_arrow':state.lastTool);}
    }} className={`p-2 rounded-full transition-all flex items-center justify-center text-xs font-semibold ${chosen?'bg-neutral-900 text-white shadow-xs':'text-neutral-700 hover:bg-neutral-100'}`}>
    <Shapes size={15}/>
  </button>;
}
/** Both launchers use this one panel and this one set of controls/settings. */
export function QuickShapesPanel(props:Props) {
  const state=useQuickShapes();return state?<Panel {...props} state={state}/>:null;
}
function Panel({activeTool,onActiveToolChange,state}:Props & {state:NonNullable<ReturnType<typeof useQuickShapes>>}) {
  const [popover,setPopover]=useState<'size'|'color'|null>(null);
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(isQuickShapeTool(activeTool) && activeTool!=='quick_eraser') {state.setGroup('quick');state.setOpen(true);state.setLastTool(activeTool);}
    else if(pens.some(p=>p.tool===activeTool)) {state.setGroup('draw');state.setOpen(true);state.setLastDrawTool(activeTool);state.setSelection(null);}
    else if(activeTool==='eraser' || activeTool==='quick_eraser')state.setOpen(true);
    else {state.setOpen(false);setPopover(null);}
  },[activeTool]);
  useEffect(()=>{setPopover(null);},[state.open,state.group]);
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setPopover(null);};
    document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
  },[]);
  if(!state.open)return null;
  const choose=(tool:ActiveTool)=>{onActiveToolChange(tool);setPopover(null);};
  const highlighting=isDrawingHighlighter(activeTool) || ((activeTool==='eraser' || (activeTool==='select' && !!state.selection)) && state.group==='draw' && isDrawingHighlighter(state.lastDrawTool));
  const size=highlighting?state.highlightSize:state.settings.size;
  const changeSize=(size:number)=>highlighting?state.updateHighlightSize(size):state.updateSettings({size});
  const progress=Math.max(0,Math.min(100,(size-1)/(STROKE_SLIDER_MAX-1)*100));
  return <div ref={root} data-quick-shape-ui data-drawing-tools-panel={state.group} data-annotation-editor={state.selection ? 'true' : undefined} className="drawing-tools-panel noto-ui">
    <div className="drawing-tools-row">
      {state.group==='quick'?shapes.map(({tool,label,icon:Icon,temporary},index)=><React.Fragment key={tool}>
        {index===3 && <span className="drawing-tools-divider"/>}
        <button type="button" className="drawing-tool-button" data-active={activeTool===tool} data-temporary={temporary || undefined} style={{color:'#000'}}
          title={label} aria-label={label} aria-pressed={activeTool===tool} onClick={()=>choose(tool)}><ShapeToolIcon icon={Icon} temporary={temporary}/></button>
      </React.Fragment>):pens.map(({tool,label,icon:Icon,smart})=><button key={tool} type="button" className="drawing-tool-button drawing-pen-button"
        data-active={activeTool===tool} title={label} aria-label={label} aria-pressed={activeTool===tool} onClick={()=>choose(tool)}>
        <Icon size={24} strokeWidth={1.8}/>{smart && <Sparkles size={10} className="drawing-smart-sparkles"/>}
      </button>)}
      <span className="drawing-tools-divider"/>
      <div data-shared-drawing-controls className="drawing-shared-controls">
        <button type="button" className="drawing-tool-button drawing-control" data-active={activeTool==='eraser'} title="Xóa nét vẽ và hình" aria-label="Xóa nét vẽ và hình" onClick={()=>choose('eraser')}><Eraser size={24} strokeWidth={1.8}/></button>
        <button type="button" className="drawing-tool-button drawing-px-control" title="Độ dày nét" aria-label="Độ dày nét" aria-expanded={popover==='size'} onClick={()=>setPopover(popover==='size'?null:'size')}>
          {size}px<ChevronDown size={12} strokeWidth={1.8}/>
        </button>
        <button type="button" className="drawing-tool-button drawing-color-control" title="Màu nét" aria-label="Màu nét" aria-expanded={popover==='color'} onClick={()=>setPopover(popover==='color'?null:'color')}>
          <span className="drawing-color-dot" style={{backgroundColor:state.settings.color}}/><ChevronDown size={12} strokeWidth={1.8}/>
        </button>
        <button type="button" className="drawing-tool-button drawing-line-control" title="Đổi nét liền/đứt" aria-label="Đổi nét liền hoặc nét đứt" aria-pressed={state.settings.dashStyle==='dashed'} onClick={()=>{state.updateSettings({dashStyle:state.settings.dashStyle==='solid'?'dashed':'solid'});setPopover(null);}}>
          <svg width="28" height="24" aria-hidden="true"><path d="M1 12H27" fill="none" stroke="#000" strokeWidth="1.8" strokeDasharray={state.settings.dashStyle==='dashed'?'2.8 2.8':undefined}/></svg>
        </button>
        <button type="button" className="drawing-tool-button drawing-close-control" title="Đóng thanh công cụ" aria-label="Đóng thanh công cụ" onClick={()=>{state.setOpen(false);state.setSelection(null);onActiveToolChange('select');}}><X size={24} strokeWidth={1.8}/></button>
      </div>
    </div>
    {popover==='size' && <div className="drawing-settings-popover drawing-size-popover" data-quick-shape-ui>
      <label className="drawing-size-heading">Độ dày nét
        <StrokeWidthInput aria-label="Độ dày nét (px)" value={size} onChange={changeSize}/>
      </label>
      <input aria-label="Điều chỉnh độ dày nét" type="range" min={1} max={STROKE_SLIDER_MAX} step={1} value={Math.min(STROKE_SLIDER_MAX,size)}
        className="drawing-size-slider" style={{background:`linear-gradient(to right, #f5c41a 0%, #f5c41a ${progress}%, #000 ${progress}%, #000 100%)`}} onChange={e=>changeSize(Number(e.target.value))}/>
    </div>}
    {popover==='color' && <div className="drawing-settings-popover drawing-color-popover" data-quick-shape-ui>
      {DRAWING_COLORS.map(c=><button key={c.hex} type="button" title={c.name} aria-label={`Chọn màu ${c.name}`} aria-pressed={state.settings.color===c.hex}
        className="drawing-palette-color" style={{backgroundColor:c.hex}} onClick={()=>state.updateSettings({color:c.hex})}/>)}
    </div>}
  </div>;
}
