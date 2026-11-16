import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act,useState} from 'react';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {fixture} from './fixtures/annotations';
import {annotationEntries,annotationSnapshot} from '../src/utils/annotationSelection';
import type {WorkspaceDoc,HistorySnapshot} from '../src/types';
import {QuickShapesProvider,useQuickShapes} from '../src/contexts/QuickShapesContext';
import {AnnotationSelectionController} from '../src/components/AnnotationSelectionController';
import {LarkFloatingToolbar} from '../src/components/LarkFloatingToolbar';

async function harness() {
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost'});
  const descriptors=new Map<string,PropertyDescriptor|undefined>(),jobs=new Map<number,FrameRequestCallback>();let serial=0;
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,CSS:{escape:(s:string)=>s},IS_REACT_ACT_ENVIRONMENT:true,
    requestAnimationFrame:(fn:FrameRequestCallback)=>{jobs.set(++serial,fn);return serial;},cancelAnimationFrame:(id:number)=>jobs.delete(id)})) {
    descriptors.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  }
  const css=readFileSync(new URL('../src/index.css',import.meta.url),'utf8'),style=dom.window.document.createElement('style');
  style.textContent=css.slice(css.indexOf('/* The redesigned drawing panels'));dom.window.document.head.appendChild(style);
  const model:{doc:WorkspaceDoc;ctx:NonNullable<ReturnType<typeof useQuickShapes>>;undo:()=>void}={} as any;
  dom.window.HTMLElement.prototype.getBoundingClientRect=function(){
    const id=this.getAttribute('data-annotation-id'),entry=id?annotationEntries({...model.doc,drawings:[...model.doc.drawings,...model.ctx.temporary,...model.ctx.previewShapes]}).find(({item})=>item.id===id):null;
    let left=0,top=0,width=1000,height=800;
    if(entry) {
      const item:any=entry.item;
      if(entry.kind==='drawings'){left=Math.min(...item.points.map((p:any)=>p.x))*10;top=Math.min(...item.points.map((p:any)=>p.y))*8;width=(Math.max(...item.points.map((p:any)=>p.x))-left/10)*10;height=Math.max(4,(Math.max(...item.points.map((p:any)=>p.y))-top/8)*8);}
      else if(entry.kind==='highlights'){const r=item.rects[0];left=r.x*10;top=r.y*8;width=r.width*10;height=r.height*8;}
      else {left=item.x*10;top=item.y*8;width=entry.kind==='boxes'?item.width*10:entry.kind==='textNotes'?item.width || 224:200;height=entry.kind==='boxes'?item.height*8:entry.kind==='textNotes'?item.height || 184:40;}
    }
    return {left,top,width,height,right:left+width,bottom:top+height,x:left,y:top,toJSON(){}};
  };
  function App() {
    const [doc,setDoc]=useState<WorkspaceDoc>({...fixture(),id:'doc',fileId:'doc',selectedIds:[],pastStates:[],futureStates:[],isHidden:false} as WorkspaceDoc);
    const ctx=useQuickShapes()!;model.doc=doc;model.ctx=ctx;model.undo=()=>setDoc(old=>({...old,...old.pastStates.at(-1),pastStates:old.pastStates.slice(0,-1)}));
    return React.createElement(React.Fragment,null,
      React.createElement('div',{'data-workspace-doc':'doc'},React.createElement('div',{'data-page-container':'true'},
        React.createElement('div',{'data-empty-canvas':true}),...annotationEntries({...doc,drawings:[...doc.drawings,...ctx.temporary,...ctx.previewShapes]}).map(({item,kind})=>React.createElement('div',{key:item.id,'data-annotation-id':item.id},kind==='textNotes'?React.createElement('textarea',{'aria-label':'Note text',defaultValue:(item as any).text}):kind==='freeTexts'?React.createElement('div',{contentEditable:true,suppressContentEditableWarning:true,tabIndex:0},'Text'):item.id)))),
      React.createElement(AnnotationSelectionController,{docs:[doc],activeId:'doc',activeTool:'select',disabled:false,
        onSelect:(_,id,shift)=>setDoc(old=>({...old,selectedIds:!id?[]:shift?old.selectedIds.includes(id)?old.selectedIds.filter(x=>x!==id):[...old.selectedIds,id]:[id]})),
        onApply:(_,next,ids,base)=>setDoc(old=>({...old,...next,selectedIds:ids,...(base?{pastStates:[...old.pastStates,base],futureStates:[]}: {})}))}),
      React.createElement(LarkFloatingToolbar,{activeTool:'select',onActiveToolChange(){},penColor:ctx.settings.color,penSize:ctx.settings.size,penOpacity:1,eraserSize:20,onPenColorChange(){},onPenSizeChange(){},onPenOpacityChange(){},onEraserSizeChange(){}}));
  }
  const {createRoot}=await import('react-dom/client');const root=createRoot(dom.window.document.getElementById('root')!);
  await act(async()=>root.render(React.createElement(QuickShapesProvider,null,React.createElement(App))));
  const doc=dom.window.document;
  const pointer=async(target:EventTarget,type:string,x=100,y=100,mods:{shiftKey?:boolean;altKey?:boolean}={})=>{
    const event=new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,button:0,buttons:type==='pointerup'?0:1,clientX:x,clientY:y,...mods});
    Object.defineProperty(event,'pointerId',{value:1});await act(async()=>target.dispatchEvent(event));
  };
  const element=(id:string)=>doc.querySelector(`[data-annotation-id="${id}"]`)!;
  const flush=async()=>act(async()=>{const callbacks=[...jobs.values()];jobs.clear();callbacks.forEach(fn=>fn(0));});
  const click=async(label:string)=>act(async()=>doc.querySelector(`[aria-label="${label}"]`)!.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));
  const key=async(value:string)=>act(async()=>dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true})));
  const selectAll=async()=>{for(const {item} of annotationEntries(model.doc))await pointer(element(item.id),'pointerdown',100,100,{shiftKey:true});};
  return {dom,doc,model,pointer,element,flush,click,key,selectAll,async dispose(){await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor] of descriptors){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}}};
}

test('Shift selects mixed types inside one gold frame and moves them together with one undo snapshot',async()=>{
  const h=await harness();try {
    await h.selectAll();assert.equal(h.model.doc.selectedIds.length,6);
    const frame=h.doc.querySelector<HTMLElement>('[data-annotation-group-frame]')!;
    assert.ok(frame.style.border.includes('rgb(245, 196, 26)'));
    await h.pointer(h.element('b'),'pointerdown',120,120);
    await h.pointer(h.dom.window,'pointermove',140,150);await h.flush();
    await h.pointer(h.dom.window,'pointerup',140,150);
    const doc=h.model.doc;
    assert.equal(doc.boxes[0].x,12);assert.equal(doc.textNotes[0].x,42);assert.equal(doc.freeTexts[0].x,12);
    assert.equal(doc.drawings[0].points[0].x,12);assert.equal(doc.highlights[0].rects[0].x,12);
    assert.equal(doc.textNotes[0].text,'Dòng một\nDòng hai');assert.equal(doc.pastStates.length,1);
    await act(async()=>h.model.undo());assert.deepEqual(annotationSnapshot(h.model.doc),fixture());
    await h.pointer(h.element('n'),'pointerdown',100,100,{shiftKey:true});assert.equal(h.model.doc.selectedIds.includes('n'),false);
  } finally {await h.dispose();}
});

test('Option duplicates a mixed group; Delete respects editors, deletes all selected copies and is undoable',async()=>{
  const h=await harness();try {
    const original=fixture();await h.selectAll();
    await h.pointer(h.element('q'),'pointerdown',500,560,{altKey:true});
    await h.pointer(h.dom.window,'pointermove',530,590);await h.flush();await h.pointer(h.dom.window,'pointerup',530,590);
    const doc=h.model.doc;assert.equal(annotationEntries(doc).length,12);assert.equal(doc.selectedIds.length,6);assert.equal(doc.pastStates.length,1);
    for(const {item,kind} of annotationEntries(original))assert.deepEqual((doc[kind] as any[]).find(x=>x.id===item.id),item);
    await act(async()=>h.doc.querySelector<HTMLTextAreaElement>('textarea')!.focus());await h.key('Delete');assert.equal(annotationEntries(h.model.doc).length,12);
    await act(async()=>h.doc.querySelector<HTMLTextAreaElement>('textarea')!.blur());await h.key('Delete');
    assert.deepEqual(annotationSnapshot(h.model.doc),original);assert.equal(h.model.doc.selectedIds.length,0);
    await act(async()=>h.model.undo());assert.equal(annotationEntries(h.model.doc).length,12);
  } finally {await h.dispose();}
});

test('group controls edit compatible styles, resizing scales the group and Escape cancels an in-progress drag',async()=>{
  const h=await harness();try {
    await h.selectAll();await h.click('Màu nhóm green');
    assert.equal(h.model.doc.highlights[0].color,'green');assert.equal(h.model.doc.textNotes[0].color,'#98d08a');
    assert.equal(h.model.doc.boxes[0].color,'#22c55e');assert.equal(h.model.doc.drawings[0].color,'#22c55e');
    const before=annotationSnapshot(h.model.doc),history=h.model.doc.pastStates.length;
    await h.pointer(h.element('b'),'pointerdown',120,120);await h.pointer(h.dom.window,'pointermove',140,140);await h.flush();await h.key('Escape');
    assert.deepEqual(annotationSnapshot(h.model.doc),before);assert.equal(h.model.doc.pastStates.length,history);
    const handle=h.doc.querySelector('[aria-label="Đổi kích thước nhóm góc 3"]')!;
    await h.pointer(handle,'pointerdown',700,560);await h.pointer(h.dom.window,'pointerup',740,600);
    assert.ok(h.model.doc.boxes[0].width>before.boxes[0].width);
    assert.ok(h.model.doc.drawings[0].size>before.drawings[0].size);
    assert.ok(h.model.doc.freeTexts[0].fontSize>before.freeTexts[0].fontSize);
    assert.equal(h.model.doc.pastStates.length,history+1);
  } finally {await h.dispose();}
});

test('selecting an existing stroke reopens its editor, changes that stroke and clicking blank canvas closes it',async()=>{
  const h=await harness();try {
    await h.pointer(h.element('d'),'pointerdown',100,560);
    assert.equal(h.model.ctx.open,true);assert.equal(h.model.ctx.group,'draw');assert.equal(h.model.doc.selectedIds[0],'d');
    await act(async()=>h.model.ctx.updateSettings({size:18,color:'#3b82f6',dashStyle:'dashed'}));
    assert.equal(h.model.doc.drawings[0].size,18);assert.equal(h.model.doc.drawings[0].color,'#3b82f6');assert.equal(h.model.doc.drawings[0].dashStyle,'dashed');
    await h.pointer(h.doc.querySelector('[data-empty-canvas]')!,'pointerdown',900,700);
    assert.equal(h.model.ctx.open,false);assert.equal(h.model.doc.selectedIds.length,0);
    await h.pointer(h.element('q'),'pointerdown',500,560);assert.equal(h.model.ctx.group,'quick');assert.equal(h.model.ctx.open,true);
  } finally {await h.dispose();}
});

test('temporary group copies start their own 3-second deadline on release, remain out of saved drawings and keep original deadlines',async()=>{
  const h=await harness();try {
    await act(async()=>h.model.ctx.store.add({...fixture().drawings[1],id:'temporary'},'doc'));
    const originalDeadline=h.model.ctx.temporary[0].expiresAt;
    await h.pointer(h.element('b'),'pointerdown',100,100,{shiftKey:true});
    await h.pointer(h.element('temporary'),'pointerdown',500,560,{shiftKey:true});
    await h.pointer(h.element('temporary'),'pointerdown',500,560,{altKey:true});
    await h.pointer(h.dom.window,'pointermove',520,580);await h.flush();
    assert.equal(h.model.ctx.previewShapes.length,1);assert.equal(h.model.ctx.temporary.length,1);
    const released=Date.now();await h.pointer(h.dom.window,'pointerup',520,580);
    assert.equal(h.model.ctx.previewShapes.length,0);assert.equal(h.model.ctx.temporary.length,2);
    assert.equal(h.model.ctx.temporary.find(s=>s.id==='temporary')!.expiresAt,originalDeadline);
    const copy=h.model.ctx.temporary.find(s=>s.id!=='temporary')!;
    assert.ok(copy.expiresAt>=released+3000);assert.equal(h.model.doc.drawings.length,2);
    await h.key('Delete');assert.equal(h.model.ctx.temporary.length,1);assert.equal(h.model.doc.boxes.length,1);
    assert.equal(h.model.ctx.temporary[0].expiresAt,originalDeadline);
  } finally {await h.dispose();}
});

test('Option and Delete also work on one Box, note, text, drawing, arrow or text highlight without affecting originals',async()=>{
  for(const id of ['b','n','t','d','q','h']) {
    const h=await harness();try {
      await h.pointer(h.element(id),'pointerdown',100,100,{altKey:true});
      await h.pointer(h.dom.window,'pointerup',120,120);
      assert.equal(annotationEntries(h.model.doc).length,7);assert.equal(h.model.doc.selectedIds.length,1);
      assert.equal(h.model.doc.pastStates.length,1);
      await h.key('Delete');assert.deepEqual(annotationSnapshot(h.model.doc),fixture());
    } finally {await h.dispose();}
  }
});
