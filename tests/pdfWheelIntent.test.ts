import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act,useRef,useState} from 'react';
import {JSDOM} from 'jsdom';
import {PDFWorkspaceColumn} from '../src/components/PDFWorkspaceColumn';
import {clearDocCanvasCache} from '../src/components/PDFPageView';
import {WorkspaceWheelRouter} from '../src/utils/wheelGesture';
import {useWorkspaceWheelNavigation} from '../src/hooks/useWorkspaceWheelNavigation';
import type {WorkspaceDoc} from '../src/types';

test('real pinch commits preserve intent: click ends pan C, the next zoom restores pan C and finishing during a click cannot swallow it',async()=>{
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost'});
  const descriptors=new Map<string,PropertyDescriptor|undefined>(),frames=new Map<number,FrameRequestCallback>();let serial=0;
  const globals={window:dom.window,document:dom.window.document,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,SVGElement:dom.window.SVGElement,
    Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,MutationObserver:dom.window.MutationObserver,CSS:{escape:(s:string)=>s},getComputedStyle:dom.window.getComputedStyle,
    IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class {observe(){}unobserve(){}disconnect(){}},
    requestAnimationFrame:(fn:FrameRequestCallback)=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:(id:number)=>frames.delete(id)};
  for(const [key,value] of Object.entries(globals)){descriptors.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
  Object.defineProperty(dom.window.HTMLElement.prototype,'clientWidth',{get(){return 900;}});
  Object.defineProperty(dom.window.HTMLElement.prototype,'clientHeight',{get(){return 800;}});
  dom.window.HTMLElement.prototype.getBoundingClientRect=function(){
    const element=this as HTMLElement;
    const page=element.hasAttribute('data-page-container')?element:element.querySelector<HTMLElement>('[data-page-container]');
    const live=Number(page?.closest<HTMLElement>('[data-scale]')?.style.getPropertyValue('--pdf-live-zoom')) || 1;
    const width=this.classList.contains('pdf-viewport-container')?900:(parseFloat(page?.style.width || '') || 595)*live;
    const height=this.classList.contains('pdf-viewport-container')?800:(parseFloat(page?.style.height || '') || 842)*live;
    return {left:0,top:0,right:width,bottom:height,width,height,x:0,y:0,toJSON(){}};
  };
  dom.window.document.elementFromPoint=()=>dom.window.document.querySelector('[data-page-container]');
  dom.window.HTMLCanvasElement.prototype.getContext=function(){return new Proxy({} as any,{get:()=>()=>{}});};
  const pdfDoc={async getPage(){return {getViewport({scale}:{scale:number}){return {width:595*scale,height:842*scale};},render(){return {promise:Promise.resolve(),cancel(){}};}};}};
  const router=new WorkspaceWheelRouter<HTMLElement|'workspace'>(),commits:boolean[]=[];
  const noop=()=>{};
  const callbacks=Object.fromEntries(['onActivate','onPageChange','onResolveAnnotationScale','onUpdateBoxConfig','onTextSelected','onAddHighlight','onAddNote','onUpdateNote','onDeleteNote',
    'onAddBox','onUpdateBox','onDeleteBox','onAddFreeText','onUpdateFreeText','onDeleteFreeText','onDeleteHighlight','onUpdateHighlight','onUpdateHighlightNote','onUpdateHighlightColor',
    'onAddStroke','onUpdateStroke','onDeleteStroke','onActiveToolChange','onSelect','onClearSelection'].map(key=>[key,noop]));
  function App(){const ref=useRef<HTMLDivElement>(null);useWorkspaceWheelNavigation(ref,router);
    const [doc,update]=useState({id:'C',fileId:'intent-C',fileName:'C.pdf',pdfDoc,scale:1,currentPage:1,totalPages:1,viewMode:'single',basePageDimensions:{width:595,height:842},
      drawings:[],highlights:[],textNotes:[],boxes:[],freeTexts:[],selectedIds:[],pastStates:[],futureStates:[]} as unknown as WorkspaceDoc);
    return React.createElement('div',{ref},React.createElement(PDFWorkspaceColumn,{...callbacks,doc,isActive:true,totalVisibleDocs:4,wheelRouter:router,activeTool:'text',penColor:'#000',penSize:4,
      penOpacity:1,eraserSize:20,highlightColor:'yellow',boxColor:'#f00',boxConfig:{color:'#f00',borderWidth:2,borderStyle:'solid',hasBackground:true},
      onZoomChange:(_id:string,scale:number,_reset:boolean,preserve:boolean)=>{
        commits.push(preserve);
        if(!preserve)router.setHorizontalOwner(document.querySelector<HTMLElement>('.pdf-viewport-container')!);
        update(old=>({...old,scale,zoomRevision:(old.zoomRevision || 0)+1}));
      }} as any));}
  const {createRoot}=await import('react-dom/client'),root=createRoot(dom.window.document.getElementById('root')!);
  const flush=async()=>{for(let i=0;i<10;i++)await act(async()=>{await Promise.resolve();const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn(0));});};
  const pointer=async(type:string)=>act(async()=>{
    const event=new dom.window.MouseEvent(type,{bubbles:true,button:0,clientX:250,clientY:250});Object.defineProperty(event,'pointerId',{value:1});Object.defineProperty(event,'pointerType',{value:'mouse'});
    dom.window.document.querySelector('[data-page-container]')!.dispatchEvent(event);
  });
  let time=0;
  try {
    await act(async()=>root.render(React.createElement(App)));await flush();
    const view=dom.window.document.querySelector<HTMLElement>('.pdf-viewport-container')!;
    const horizontal=()=>router.read(30,0,time+=1000,()=>view)!.owner;
    const pinch=async(delta:number)=>{await act(async()=>view.dispatchEvent(new dom.window.WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:delta,clientX:250,clientY:250})));await flush();};
    await pinch(-20);assert.equal(horizontal(),view);
    await pointer('pointerdown');await pointer('pointerup');await flush();
    assert.equal(horizontal(),'workspace');assert.equal(commits.at(-1),true);
    await pinch(15);assert.equal(horizontal(),view);
    await pointer('pointerdown');await act(async()=>view.dispatchEvent(new dom.window.Event('gestureend')));await flush();
    await pointer('pointerup');assert.equal(horizontal(),'workspace');assert.ok(commits.every(Boolean));
    await pinch(-10);assert.equal(horizontal(),view);
    await act(async()=>view.dispatchEvent(new dom.window.Event('gestureend')));await flush();assert.equal(horizontal(),view);
    await pointer('pointerdown');await pointer('pointerup');assert.equal(horizontal(),'workspace');
  } finally {
    await act(async()=>root.unmount());clearDocCanvasCache('intent-C');dom.window.close();
    for(const [key,descriptor] of descriptors){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}
  }
});
