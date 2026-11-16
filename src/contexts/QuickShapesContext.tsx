import React,{createContext,useCallback,useContext,useEffect,useRef,useState,useMemo} from 'react';
import type {ActiveTool,DrawingStroke,QuickShapeTool} from '../types';
import {DEFAULT_QUICK_SHAPE_SETTINGS,type QuickShapeSettings} from '../utils/quickShapes';
import {TemporaryShapes,type TemporaryShape} from '../utils/temporaryShapes';
type Selection={fileId:string;pageNumber:number;id:string;kind:'quick'|'draw'}|null;
const Context=createContext<ReturnType<typeof useQuickState>|null>(null);
const ResetContext=createContext<()=>void>(()=>{});
const SettingsContext=createContext<Pick<ReturnType<typeof useQuickState>,'settings'|'updateSettings'|'highlightSize'|'updateHighlightSize'>|null>(null);
function useQuickState() {
  const [settings,setSettings]=useState({...DEFAULT_QUICK_SHAPE_SETTINGS});
  const [highlightSize,setHighlightSize]=useState(10);
  const [highlightRevision,setHighlightRevision]=useState(0);
  const updateHighlightSize=useCallback((size:number)=>{setHighlightSize(size);setHighlightRevision(n=>n+1);},[]);
  const [revision,setRevision]=useState(0),[open,setOpen]=useState(false);
  const [group,setGroup]=useState<'quick'|'draw'>('quick');
  const [lastDrawTool,setLastDrawTool]=useState<ActiveTool>('pen');
  const [lastTool,setLastTool]=useState<QuickShapeTool>('quick_arrow');
  const [selection,setSelection]=useState<Selection>(null);
  const [temporary,setTemporary]=useState<TemporaryShape[]>([]);
  const [previewShapes,setPreviewShapes]=useState<(DrawingStroke & {fileId:string})[]>([]);
  const store=useRef<TemporaryShapes|null>(null);
  if(!store.current) store.current=new TemporaryShapes({now:Date.now,schedule:(fn,ms)=>setTimeout(fn,ms),cancel:timer=>clearTimeout(timer as ReturnType<typeof setTimeout>),changed:setTemporary});
  useEffect(()=>{
    const resume=()=>store.current?.prune();
    window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
    return()=>{store.current?.clear(false);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};
  },[]);
  const updateSettings=useCallback((patch:Partial<QuickShapeSettings>)=>{setSettings(old=>({...old,...patch}));setRevision(n=>n+1);},[]);
  const select=useCallback((shape:DrawingStroke,fileId:string)=>{
    setSelection({fileId,pageNumber:shape.pageNumber,id:shape.id,kind:shape.quickShape?'quick':'draw'});
    setGroup(shape.quickShape?'quick':'draw');setOpen(true);
    if(shape.quickShape)setLastTool(old=>old.startsWith(`quick_${shape.quickShape}`)?old:`quick_${shape.quickShape}` as QuickShapeTool);
    else setLastDrawTool(shape.isHighlighter?(shape.isSmartShape?'smart_highlighter':'highlighter'):(shape.isSmartShape?'smart_pen':'pen'));
    if(shape.isHighlighter)setHighlightSize(shape.size);
    setSettings(old=>({...old,color:shape.color,...(!shape.isHighlighter?{size:shape.size}:{}),dashStyle:shape.dashStyle || 'solid'}));
  },[]);
  const reset=useCallback(()=>{
    setSettings({...DEFAULT_QUICK_SHAPE_SETTINGS});setHighlightSize(10);setOpen(false);setGroup('quick');setLastDrawTool('pen');setLastTool('quick_arrow');setSelection(null);setPreviewShapes([]);store.current?.clear();
  },[]);
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{
      const target=event.target as Element|null;
      if(!target?.closest?.('[data-quick-shape-ui], [data-annotation-id]')) setSelection(null);
    };
    window.addEventListener('pointerdown',outside);return()=>window.removeEventListener('pointerdown',outside);
  },[]);
  return {group,setGroup,lastDrawTool,setLastDrawTool,settings,highlightSize,highlightRevision,updateHighlightSize,revision,updateSettings,open,setOpen,lastTool,setLastTool,selection,setSelection,select,temporary,previewShapes,setPreviewShapes,store:store.current,reset};
}
export function QuickShapesProvider({children}:{children:React.ReactNode}) {
  const state=useQuickState();
  const settings=useMemo(()=>({settings:state.settings,updateSettings:state.updateSettings,highlightSize:state.highlightSize,updateHighlightSize:state.updateHighlightSize}),[state.settings,state.updateSettings,state.highlightSize,state.updateHighlightSize]);
  return <ResetContext.Provider value={state.reset}><SettingsContext.Provider value={settings}><Context.Provider value={state}>{children}</Context.Provider></SettingsContext.Provider></ResetContext.Provider>;
}
export function useQuickShapes(){return useContext(Context);}
export function useQuickShapesReset(){return useContext(ResetContext);}

export function useDrawingSettings(){return useContext(SettingsContext);}
