import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act,useRef} from 'react';
import {JSDOM} from 'jsdom';
import {WorkspaceWheelRouter} from '../src/utils/wheelGesture';
import {useWorkspaceWheelNavigation} from '../src/hooks/useWorkspaceWheelNavigation';

test('left click exits PDF C pan mode; drags, editors, tool buttons, cancelled pointers and zoom gestures do not',async()=>{
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost'});
  const descriptors=new Map<string,PropertyDescriptor|undefined>();
  const globals={window:dom.window,document:dom.window.document,Element:dom.window.Element,Event:dom.window.Event,IS_REACT_ACT_ENVIRONMENT:true};
  for(const [key,value] of Object.entries(globals)){descriptors.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
  const router=new WorkspaceWheelRouter<HTMLElement|'workspace'>();
  function App(){const ref=useRef<HTMLDivElement>(null);useWorkspaceWheelNavigation(ref,router);
    return React.createElement('div',{ref,id:'workspace'},...['A','B','C','D'].map(id=>React.createElement('div',{key:id,id,className:'pdf-viewport-container'},
      React.createElement('div',{id:`canvas-${id}`},'Paper'),React.createElement('button',{id:`tool-${id}`},'Tool'),React.createElement('textarea',{id:`editor-${id}`}))));}
  const {createRoot}=await import('react-dom/client'),root=createRoot(dom.window.document.getElementById('root')!);
  const pointer=async(target:Element,type:string,x:number,y:number,button=0)=>{
    const event=new dom.window.MouseEvent(type,{bubbles:true,clientX:x,clientY:y,button});
    Object.defineProperty(event,'pointerId',{value:1});Object.defineProperty(event,'pointerType',{value:'mouse'});
    await act(async()=>{target.dispatchEvent(event);});
  };
  let time=0;
  try {
    await act(async()=>root.render(React.createElement(App)));
    const doc=dom.window.document,c=doc.getElementById('C')!,canvas=doc.getElementById('canvas-C')!;
    const horizontal=()=>router.read(30,0,time+=1000,()=>c)!.owner;
    let stops=0;c.addEventListener('pdf-interaction-stop',()=>{stops++;router.setHorizontalOwner(c);});
    router.setHorizontalOwner(c);assert.equal(horizontal(),c);assert.equal(horizontal(),c);
    await pointer(canvas,'pointerdown',100,100);await pointer(canvas,'pointerup',100,100);
    assert.equal(stops,1);assert.equal(horizontal(),'workspace');assert.equal(horizontal(),'workspace');
    router.setHorizontalOwner(c);assert.equal(horizontal(),c);
    for(const target of [doc.getElementById('tool-C')!,doc.getElementById('editor-C')!]) {
      await pointer(target,'pointerdown',100,100);await pointer(target,'pointerup',100,100);assert.equal(horizontal(),c);
    }
    await pointer(canvas,'pointerdown',100,100);await pointer(canvas,'pointermove',120,100);await pointer(canvas,'pointermove',100,100);await pointer(canvas,'pointerup',100,100);
    assert.equal(horizontal(),c); // even a drag that returns to its starting point is not a click
    await pointer(canvas,'pointerdown',100,100);await pointer(canvas,'pointercancel',100,100);await pointer(canvas,'pointerup',100,100);
    assert.equal(horizontal(),c);
    await pointer(canvas,'pointerdown',100,100);canvas.dispatchEvent(new dom.window.WheelEvent('wheel',{bubbles:true,ctrlKey:true,deltaY:-10}));await pointer(canvas,'pointerup',100,100);
    assert.equal(horizontal(),c);
    await pointer(canvas,'pointerdown',100,100,2);await pointer(canvas,'pointerup',100,100,2);assert.equal(horizontal(),c);
    await pointer(doc.getElementById('workspace')!,'pointerdown',100,100);await pointer(doc.getElementById('workspace')!,'pointerup',100,100);
    assert.equal(horizontal(),'workspace');
    assert.equal(router.read(0,30,time+=1000,()=>c)!.owner,c); // vertical scrolling still reads the PDF
  } finally {
    await act(async()=>root.unmount());dom.window.close();
    for(const [key,descriptor] of descriptors){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}
  }
});
