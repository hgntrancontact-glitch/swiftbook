import React,{createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import type {DrawingStroke,QuickShapeTool} from '../types';
import {DEFAULT_QUICK_SHAPE_SETTINGS,type QuickShapeSettings} from '../utils/quickShapes';
import {TemporaryShapes,type TemporaryShape} from '../utils/temporaryShapes';
type Selection={fileId:string;pageNumber:number;id:string}|null;
const Context=createContext<ReturnType<typeof useQuickState>|null>(null);
const ResetContext=createContext<()=>void>(()=>{});
function useQuickState() {
  const [settings,setSettings]=useState({...DEFAULT_QUICK_SHAPE_SETTINGS});
  const [revision,setRevision]=useState(0),[open,setOpen]=useState(false);
  const [lastTool,setLastTool]=useState<QuickShapeTool>('quick_arrow');
  const [selection,setSelection]=useState<Selection>(null);
  const [temporary,setTemporary]=useState<TemporaryShape[]>([]);
  const store=useRef<TemporaryShapes|null>(null);
  if(!store.current) store.current=new TemporaryShapes({now:Date.now,schedule:(fn,ms)=>setTimeout(fn,ms),cancel:timer=>clearTimeout(timer as ReturnType<typeof setTimeout>),changed:setTemporary});
  useEffect(()=>{
    const resume=()=>store.current?.prune();
    window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
    return()=>{store.current?.clear(false);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};
  },[]);
  const updateSettings=useCallback((patch:Partial<QuickShapeSettings>)=>{setSettings(old=>({...old,...patch}));setRevision(n=>n+1);},[]);
  const select=useCallback((shape:DrawingStroke,fileId:string)=>{
    setSelection({fileId,pageNumber:shape.pageNumber,id:shape.id});
    setSettings({color:shape.color,size:shape.size,dashStyle:shape.dashStyle || 'solid'});
  },[]);
  const reset=useCallback(()=>{
    setSettings({...DEFAULT_QUICK_SHAPE_SETTINGS});setOpen(false);setLastTool('quick_arrow');setSelection(null);store.current?.clear();
  },[]);
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{
      const target=event.target as Element|null;
      if(!target?.closest?.('[data-quick-shape-ui], [data-quick-shape-hit]')) setSelection(null);
    };
    window.addEventListener('pointerdown',outside);return()=>window.removeEventListener('pointerdown',outside);
  },[]);
  return {settings,revision,updateSettings,open,setOpen,lastTool,setLastTool,selection,setSelection,select,temporary,store:store.current,reset};
}
export function QuickShapesProvider({children}:{children:React.ReactNode}) {
  const state=useQuickState();
  return <ResetContext.Provider value={state.reset}><Context.Provider value={state}>{children}</Context.Provider></ResetContext.Provider>;
}
export function useQuickShapes(){return useContext(Context);}
export function useQuickShapesReset(){return useContext(ResetContext);}
