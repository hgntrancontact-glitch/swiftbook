import {AnnotationSelectionController} from '../src/components/AnnotationSelectionController';
import {readFileSync} from 'node:fs';
import {EraserCursor} from '../src/components/EraserCursor';
import {DrawingCanvas} from '../src/components/DrawingCanvas';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act,useState} from 'react';
import type {Root} from 'react-dom/client';
import type {ActiveTool,DrawingStroke} from '../src/types';
import {QuickShapesProvider,useQuickShapes} from '../src/contexts/QuickShapesContext';
import {isDrawingHighlighter,quickGeometry} from '../src/utils/quickShapes';
import {QuickShapesLayer} from '../src/components/QuickShapesLayer';
import {LarkFloatingToolbar} from '../src/components/LarkFloatingToolbar';

async function harness(initial:ActiveTool='quick_arrow',scale=1,zoom=1,managed=false) {
  const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'http://localhost'});
  const descriptors=new Map<string,PropertyDescriptor|undefined>();
  const globals={window:dom.window,document:dom.window.document,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,SVGElement:dom.window.SVGElement,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,CSS:{escape:(id:string)=>id},IS_REACT_ACT_ENVIRONMENT:true};
  for(const [key,value] of Object.entries(globals)){descriptors.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
  const css=readFileSync(new URL('../src/index.css',import.meta.url),'utf8');
  const style=dom.window.document.createElement('style');style.textContent=css.slice(css.indexOf('/* The redesigned drawing panels'));dom.window.document.head.appendChild(style);
  const captures=new WeakMap<Element,Set<number>>();
  dom.window.SVGElement.prototype.setPointerCapture=function(id:number){captures.set(this,new Set([id]));};
  dom.window.SVGElement.prototype.hasPointerCapture=function(id:number){return captures.get(this)?.has(id) || false;};
  dom.window.SVGElement.prototype.releasePointerCapture=function(id:number){captures.get(this)?.delete(id);};
  dom.window.SVGElement.prototype.getBoundingClientRect=function(){return {left:0,top:0,right:1000*scale,bottom:800*scale,width:1000*scale,height:800*scale,x:0,y:0,toJSON(){}};};
  dom.window.HTMLElement.prototype.setPointerCapture=dom.window.SVGElement.prototype.setPointerCapture;
  dom.window.HTMLElement.prototype.hasPointerCapture=dom.window.SVGElement.prototype.hasPointerCapture;
  dom.window.HTMLElement.prototype.releasePointerCapture=dom.window.SVGElement.prototype.releasePointerCapture;
  dom.window.HTMLElement.prototype.getBoundingClientRect=dom.window.SVGElement.prototype.getBoundingClientRect;
  const model:{tool:ActiveTool;setTool:(tool:ActiveTool)=>void;shapes:DrawingStroke[];replaceShapes:(shapes:DrawingStroke[])=>void;cleared:number;state:NonNullable<ReturnType<typeof useQuickShapes>>}={} as any;
  let serial=0,cleared=0,commits=0;
  function TestApp() {
    const [tool,setTool]=useState(initial),[shapes,setShapes]=useState<DrawingStroke[]>([]);
    const [selectedIds,setSelectedIds]=useState<string[]>([]);
    const select=(id:string,shift:boolean)=>setSelectedIds(old=>!id?[]:shift?old.includes(id)?old.filter(x=>x!==id):[...old,id]:[id]);
    const state=useQuickShapes()!;Object.assign(model,{tool,setTool,shapes,replaceShapes:setShapes,state,cleared});
    return React.createElement(React.Fragment,null,
      React.createElement(EraserCursor,{active:tool==='eraser',size:20}),
      React.createElement('div',{'data-user-zoom':zoom,'data-workspace-doc':'doc-a'},React.createElement('div',{'data-page-container':true},
        React.createElement(QuickShapesLayer,{fileId:'doc-a',pageNumber:1,width:1000*scale,height:800*scale,scale,activeTool:tool,drawings:shapes,...(managed?{selectedIds,onSelect:select}:{}),
          onAddStroke:payload=>{const id=`shape-${++serial}`;setShapes(old=>[...old,{...payload,id,createdAt:Date.now()}]);return id;},
          onClearSelection:()=>{cleared++;model.cleared=cleared;},
          onUpdateStroke:(id,patch)=>setShapes(old=>old.map(s=>s.id===id?{...s,...patch}:s)),onDeleteStroke:id=>setShapes(old=>old.filter(s=>s.id!==id))}),
        React.createElement(DrawingCanvas,{pageNumber:1,width:1000*scale,height:800*scale,scale,
          isDrawingMode:['pen','smart_pen','highlighter','smart_highlighter'].includes(tool),isHighlighter:tool==='highlighter' || tool==='smart_highlighter',
          isSmartPen:tool==='smart_pen',isSmartHighlighter:tool==='smart_highlighter',isEraserMode:tool==='eraser',
          penColor:state.settings.color,penSize:isDrawingHighlighter(tool)?state.highlightSize:state.settings.size,strokes:shapes,...(managed?{selectedIds,onSelect:select}:{}),
          onAddStroke:payload=>{const id=`pen-${++serial}`;setShapes(old=>[...old,{...payload,id,createdAt:Date.now()}]);return id;},
          onUpdateStroke:(id,patch)=>setShapes(old=>old.map(s=>s.id===id?{...s,...patch}:s)),onDeleteStroke:id=>setShapes(old=>old.filter(s=>s.id!==id))}))),
      managed?React.createElement(AnnotationSelectionController,{docs:[{id:'doc-a',fileId:'doc-a',selectedIds,drawings:shapes,boxes:[],textNotes:[],freeTexts:[],highlights:[]} as any],activeId:'doc-a',activeTool:tool,disabled:false,
        onSelect:(_,id,shift)=>select(id,shift),onApply:(_,snapshot,ids,base)=>{setShapes(snapshot.drawings);setSelectedIds(ids);if(base)commits++;}}):null,
      React.createElement(LarkFloatingToolbar,{activeTool:tool,onActiveToolChange:setTool,penColor:'#171717',penSize:4,penOpacity:1,eraserSize:20,onPenColorChange(){},onPenSizeChange(){},onPenOpacityChange(){},onEraserSizeChange(){}}));
  }
  const {createRoot}=await import('react-dom/client');let root:Root=createRoot(dom.window.document.getElementById('root')!);
  await act(async()=>root.render(React.createElement(QuickShapesProvider,null,React.createElement(TestApp))));
  const svg=()=>dom.window.document.querySelector('[data-quick-shape-layer]')!;
  const pointer=async(target:Element,type:string,x:number,y:number,shiftKey=false)=>{
    const event=new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,button:0,buttons:type==='pointerup'?0:1,clientX:x,clientY:y,shiftKey});
    Object.defineProperty(event,'pointerId',{value:1});Object.defineProperty(event,'pointerType',{value:'mouse'});await act(async()=>{target.dispatchEvent(event);});
  };
  const click=async(label:string)=>{const target=dom.window.document.querySelector(`[aria-label="${label}"]`)!;assert.ok(target,label);await act(async()=>{target.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});};
  return {model,svg,pointer,click,dom,commits:()=>commits,async dispose(){await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor] of descriptors){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}}};
}

test('pointer creation holds the start, shows a live preview, commits on release, bends via the yellow middle handle and moves as one shape',async()=>{
  const h=await harness();try {
    await h.pointer(h.svg(),'pointerdown',100,200);
    assert.equal(h.model.cleared,1);
    await h.pointer(h.svg(),'pointermove',400,350);
    assert.equal(h.model.shapes.length,0);assert.ok(h.svg().querySelectorAll('path').length>=2);
    assert.equal(h.svg().querySelectorAll('circle').length,0);
    await h.pointer(h.svg(),'pointerup',400,350);
    assert.equal(h.model.shapes.length,1);
    const original=h.model.shapes[0];assert.deepEqual(original.points[0],{x:10,y:25});assert.deepEqual(original.points[2],{x:40,y:43.75});
    const handles=h.svg().querySelectorAll('circle');assert.equal(handles.length,3);assert.equal(handles[1].getAttribute('stroke'),'#f5c41a');assert.equal(handles[1].getAttribute('r'),'4');
    await h.pointer(handles[1],'pointerdown',250,275);await h.pointer(h.svg(),'pointermove',250,100);await h.pointer(h.svg(),'pointerup',250,100);
    assert.deepEqual(h.model.shapes[0].points[1],{x:25,y:12.5});assert.deepEqual(h.model.shapes[0].points[0],original.points[0]);
    const path=h.svg().querySelector('path[stroke="transparent"]')!;
    await h.pointer(path,'pointerdown',250,100);await h.pointer(h.svg(),'pointermove',300,140);await h.pointer(h.svg(),'pointerup',300,140);
    assert.deepEqual(h.model.shapes[0].points[0],{x:15,y:30});
  } finally {await h.dispose();}
});

test('Shift can be pressed while the pointer is stationary; release uses the final pointer position and cancellation never saves a shape',async()=>{
  const h=await harness('quick_line');try {
    await h.pointer(h.svg(),'pointerdown',100,200);await h.pointer(h.svg(),'pointermove',400,350);
    await act(async()=>{h.dom.window.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'Shift',bubbles:true}));});
    assert.equal(h.svg().querySelectorAll('circle').length,0);
    assert.ok(h.svg().querySelector('[data-quick-shape-hit] > g > path')!.getAttribute('d')!.includes('Q 250 200 400 200'));
    await h.pointer(h.svg(),'pointerup',450,360,true);
    assert.deepEqual(h.model.shapes[0].points[2],{x:45,y:25});
    await h.pointer(h.svg(),'pointerdown',500,500);await h.pointer(h.svg(),'pointermove',700,600);await h.pointer(h.svg(),'pointercancel',700,600);
    assert.equal(h.model.shapes.length,1);
  } finally {await h.dispose();}
});

test('six tools share settings, selected shapes can be restyled, group eraser removes them, and reset restores red 4px',async()=>{
  const h=await harness('select');try {
    await h.click('Mũi tên, Line và khung');assert.equal(h.model.tool,'quick_arrow');
    const labels=['Mũi tên','Đường Line','Khung chữ nhật','Mũi tên tạm — mất sau 3 giây','Line tạm — mất sau 3 giây','Khung tạm — mất sau 3 giây'];
    await act(async()=>h.model.state.updateSettings({color:'#3b82f6',size:8,dashStyle:'dashed'}));
    for(const label of labels){await h.click(label);assert.deepEqual(h.model.state.settings,{color:'#3b82f6',size:8,dashStyle:'dashed'});}
    await h.click('Mũi tên');await h.pointer(h.svg(),'pointerdown',100,200);await h.pointer(h.svg(),'pointerup',400,200);
    assert.equal(h.model.shapes[0].size,8);assert.equal(h.model.shapes[0].color,'#3b82f6');
    await act(async()=>h.model.state.updateSettings({color:'#22c55e',size:6}));
    assert.equal(h.model.shapes[0].size,6);assert.equal(h.model.shapes[0].color,'#22c55e');
    await h.click('Xóa nét vẽ và hình');await h.pointer(h.svg(),'pointerdown',250,200);await h.pointer(h.svg(),'pointerup',250,200);
    assert.equal(h.model.shapes.length,0);
    await act(async()=>h.model.state.reset());assert.deepEqual(h.model.state.settings,{color:'#ef4444',size:4,dashStyle:'solid'});assert.equal(h.model.state.open,false);
  } finally {await h.dispose();}
});

test('temporary shape is created only on release and disappears after 3 seconds without entering saved drawings',async()=>{
  const h=await harness('quick_arrow_temporary');try {
    await h.pointer(h.svg(),'pointerdown',100,200);await h.pointer(h.svg(),'pointermove',400,300);
    assert.equal(h.model.state.temporary.length,0);
    await h.pointer(h.svg(),'pointerup',400,300);
    assert.equal(h.model.state.temporary.length,1);assert.equal(h.model.shapes.length,0);
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,3050));});
    assert.equal(h.model.state.temporary.length,0);assert.equal(h.svg().querySelectorAll('[data-quick-shape-hit]').length,0);
  } finally {await h.dispose();}
});


test('rectangle keeps its top-left during creation and can be resized from its yellow corners after release',async()=>{
  const h=await harness('quick_rectangle');try {
    await h.pointer(h.svg(),'pointerdown',100,200);await h.pointer(h.svg(),'pointermove',400,500);
    assert.equal(h.model.shapes.length,0);
    await h.pointer(h.svg(),'pointerup',400,500);
    assert.deepEqual(h.model.shapes[0].points,[{x:10,y:25},{x:40,y:62.5}]);
    const handles=h.svg().querySelectorAll('circle');assert.equal(handles.length,4);
    await h.pointer(handles[2],'pointerdown',400,500);await h.pointer(h.svg(),'pointerup',500,600);
    assert.deepEqual(h.model.shapes[0].points,[{x:10,y:25},{x:50,y:75}]);
  } finally {await h.dispose();}
});

test('creation at 50%, 100% and 200% uses the same 4px reference and matches the live preview with a fitted PDF',async()=>{
  for(const zoom of [.5,1,2]) {
    const h=await harness('quick_arrow',1.9*zoom,zoom);try {
      await h.pointer(h.svg(),'pointerdown',100,200);await h.pointer(h.svg(),'pointermove',400,300);
      const preview=h.svg().querySelector('[data-quick-shape-hit] > g')!;
      assert.equal(Number(preview.getAttribute('stroke-width')),4*zoom);
      const path=preview.innerHTML;
      await h.pointer(h.svg(),'pointerup',400,300);
      assert.equal(h.model.shapes[0].referenceScale,1.9);
      assert.equal(h.model.shapes[0].size,4);
      assert.equal(h.svg().querySelector('[data-quick-shape-hit] > g')!.innerHTML,path);
    } finally {await h.dispose();}
  }
});


test('undo/restoring persisted drawings is not overwritten by remembered toolbar settings',async()=>{
  const h=await harness();try {
    await h.pointer(h.svg(),'pointerdown',100,200);await h.pointer(h.svg(),'pointerup',400,200);
    const before=h.model.shapes[0];
    await act(async()=>h.model.state.updateSettings({color:'#3b82f6',size:9}));
    assert.equal(h.model.shapes[0].color,'#3b82f6');
    await act(async()=>h.model.replaceShapes([before]));
    assert.equal(h.model.shapes[0].color,'#ef4444');assert.equal(h.model.shapes[0].size,4);
    const saved=JSON.parse(JSON.stringify(h.model.shapes));
    await act(async()=>h.model.replaceShapes([]));
    await act(async()=>h.model.replaceShapes(saved));
    assert.ok(h.svg().querySelector('[data-quick-shape-hit] > g'));
    assert.deepEqual(h.model.shapes,saved);
  } finally {await h.dispose();}
});

test('handles stay hidden during drawing, appear on release, hide on canvas click and reappear on selection; endpoint drags pin the opposite end and retain the bend',async()=>{
  for(const tool of ['quick_arrow','quick_line','quick_arrow_temporary','quick_line_temporary'] as const) {
    const h=await harness(tool);try {
      const get=()=>h.model.shapes[0] || h.model.state.temporary[0];
      await h.pointer(h.svg(),'pointerdown',100,200);await h.pointer(h.svg(),'pointermove',400,300);
      assert.equal(h.svg().querySelectorAll('circle').length,0);
      await h.pointer(h.svg(),'pointerup',400,300);
      assert.equal(h.svg().querySelectorAll('circle').length,3);
      let circles=h.svg().querySelectorAll('circle');
      await h.pointer(circles[1],'pointerdown',250,250);await h.pointer(h.svg(),'pointerup',250,100);
      const before=get().points.map(p=>({...p}));
      circles=h.svg().querySelectorAll('circle');
      const preview=h.svg().querySelector('[data-quick-shape-hit] > g')!.innerHTML;
      await h.pointer(circles[0],'pointerdown',102,202);await h.pointer(h.svg(),'pointermove',102,202);
      assert.equal(h.svg().querySelector('[data-quick-shape-hit] > g')!.innerHTML,preview);
      await h.pointer(h.svg(),'pointerup',152,242);
      assert.deepEqual(get().points,[{x:before[0].x+5,y:before[0].y+5},{x:before[1].x+2.5,y:before[1].y+2.5},before[2]]);
      const moved=get().points.map(p=>({...p}));
      circles=h.svg().querySelectorAll('circle');const end=moved[2];
      await h.pointer(circles[2],'pointerdown',end.x*10,end.y*8);
      await h.pointer(h.svg(),'pointerup',end.x*10-20,end.y*8+16);
      assert.deepEqual(get().points,[moved[0],{x:moved[1].x-1,y:moved[1].y+1},{x:moved[2].x-2,y:moved[2].y+2}]);
      await h.pointer(h.svg(),'pointerdown',900,700);await h.pointer(h.svg(),'pointerup',900,700);
      assert.equal(h.svg().querySelectorAll('circle').length,0);
      const hit=h.svg().querySelector('path[stroke="transparent"]')!;
      await h.pointer(hit,'pointerdown',200,200);await h.pointer(h.svg(),'pointerup',200,200);
      assert.equal(h.svg().querySelectorAll('circle').length,3);
    } finally {await h.dispose();}
  }
});

test('one Noto Sans control strip shares colour, dash and eraser while Highlight keeps its own width',async()=>{
  const h=await harness('select');try {
    await h.click('Mũi tên, Line và khung');
    const doc=h.dom.window.document;
    assert.equal(doc.querySelectorAll('[data-shared-drawing-controls]').length,1);
    assert.equal(doc.querySelectorAll('.lucide-timer').length,0);
    assert.equal((doc.querySelector('[aria-label="Mũi tên"]') as HTMLElement).style.color,'rgb(0, 0, 0)');
    assert.equal((doc.querySelector('[aria-label="Mũi tên tạm — mất sau 3 giây"]') as HTMLElement).style.color,'rgb(245, 196, 26)');
    for(const icon of doc.querySelectorAll('[data-temporary="true"] > svg')) {
      assert.equal(h.dom.window.getComputedStyle(icon.parentElement!).color,'rgb(245, 196, 26)');
      assert.equal(h.dom.window.getComputedStyle(icon).opacity,'1');
      assert.ok(h.dom.window.getComputedStyle(icon).maskImage.includes('linear-gradient'));
    }
    await h.click('Màu nét');
    assert.equal(doc.querySelectorAll('.drawing-palette-color').length,10);
    await h.click('Chọn màu Xanh lam');assert.equal(h.model.state.settings.color,'#3b82f6');
    await h.click('Độ dày nét');
    const input=doc.querySelector('[aria-label="Độ dày nét (px)"]') as HTMLInputElement;
    const setter=Object.getOwnPropertyDescriptor(h.dom.window.HTMLInputElement.prototype,'value')!.set!;
    await act(async()=>{setter.call(input,'7');input.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));});
    assert.equal(h.model.state.settings.size,7);
    const slider=doc.querySelector('.drawing-size-slider')!;
    assert.equal(h.dom.window.getComputedStyle(slider).height,'6px');
    assert.ok(h.dom.window.getComputedStyle(input).fontFamily.includes('Noto Sans'));
    await h.click('Đổi nét liền hoặc nét đứt');assert.equal(h.model.state.settings.dashStyle,'dashed');
    assert.equal(doc.querySelector('.drawing-line-control path')?.getAttribute('stroke-dasharray'),'2.8 2.8');
    await h.click('Bút vẽ và Highlight');
    assert.equal(h.model.state.group,'draw');assert.equal(doc.querySelectorAll('[data-shared-drawing-controls]').length,1);
    assert.equal(doc.querySelectorAll('.drawing-pen-button').length,4);
    assert.ok(doc.querySelector('[aria-label="Độ dày nét"]')!.textContent!.includes('7px'));
    await h.click('Highlight tự do');
    const canvas=doc.querySelector('canvas')!;
    await h.pointer(canvas,'pointerdown',100,600);await h.pointer(canvas,'pointermove',300,620);await h.pointer(canvas,'pointerup',300,620);
    assert.equal(h.model.shapes.length,1);
    assert.equal(h.model.shapes[0].color,'#3b82f6');assert.equal(h.model.shapes[0].size,10);
    assert.equal(h.model.shapes[0].dashStyle,'dashed');assert.equal(h.model.shapes[0].isHighlighter,true);
    await h.click('Xóa nét vẽ và hình');await h.pointer(h.svg(),'pointerdown',200,610);await h.pointer(h.svg(),'pointerup',200,610);
    assert.equal(h.model.shapes.length,0);
    await h.click('Mũi tên, Line và khung');
    assert.equal(h.model.state.group,'quick');assert.deepEqual(h.model.state.settings,{color:'#3b82f6',size:7,dashStyle:'dashed'});
    await h.click('Đóng thanh công cụ');assert.equal(doc.querySelector('[data-shared-drawing-controls]'),null);
  } finally {await h.dispose();}
});

test('eraser cursor follows pointer events throughout captured erasing without waiting for release',async()=>{
  const h=await harness();try {
    await h.pointer(h.svg(),'pointerdown',100,200);await h.pointer(h.svg(),'pointerup',400,200);
    await h.click('Xóa nét vẽ và hình');
    const cursor=h.dom.window.document.querySelector<HTMLElement>('[data-eraser-cursor]')!;
    await h.pointer(h.svg(),'pointerdown',200,200);
    assert.equal(h.model.shapes.length,0);
    assert.equal(cursor.style.left,'200px');assert.equal(cursor.style.visibility,'visible');
    for(const [x,y] of [[300,240],[450,310],[500,380]]) {
      await h.pointer(h.svg(),'pointermove',x,y);
      assert.equal(cursor.style.left,`${x}px`);assert.equal(cursor.style.top,`${y}px`);
    }
    await h.pointer(h.svg(),'pointerup',500,380);
    assert.equal(cursor.style.left,'500px');
    await h.click('Mũi tên');
    assert.equal(h.dom.window.document.querySelector('[data-eraser-cursor]'),null);
  } finally {await h.dispose();}
});

test('all tool buttons share height and main icon size/weight in both panels, with a readable px control',async()=>{
  const h=await harness();try {
    const doc=h.dom.window.document;
    for(const group of ['quick','draw']) {
      if(group==='draw')await h.click('Bút vẽ và Highlight');
      const buttons=doc.querySelectorAll('.drawing-tool-button');
      for(const button of buttons) {
        const css=h.dom.window.getComputedStyle(button);
        assert.equal(css.height,'34px');
        const svg=button.querySelector('svg')!;
        assert.equal(svg.getAttribute('height'),button.classList.contains('drawing-px-control') || button.classList.contains('drawing-color-control')?'12':'24');
        assert.equal(svg.getAttribute('stroke-width') || svg.querySelector('path')!.getAttribute('stroke-width'),'1.8');
      }
      assert.equal(h.dom.window.getComputedStyle(doc.querySelector('.drawing-px-control')!).fontSize,'14px');
    }
  } finally {await h.dispose();}
});

test('ordinary tools remember 6px while the two Highlights remember 15px; colour/dash stay shared and reset restores 4/10',async()=>{
  const h=await harness();try {
    const doc=h.dom.window.document;
    const inputWidth=async(value:string)=>{
      if(!doc.querySelector('[aria-label="Độ dày nét (px)"]'))await h.click('Độ dày nét');
      const input=doc.querySelector<HTMLInputElement>('[aria-label="Độ dày nét (px)"]')!;
      const setter=Object.getOwnPropertyDescriptor(h.dom.window.HTMLInputElement.prototype,'value')!.set!;
      await act(async()=>{setter.call(input,value);input.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));});
    };
    const size=()=>doc.querySelector('[aria-label="Độ dày nét"]')!.textContent;
    assert.equal(size(),'4px');await inputWidth('6');
    await h.click('Màu nét');await h.click('Chọn màu Xanh lam');await h.click('Đổi nét liền hoặc nét đứt');
    const ordinary=['Mũi tên','Đường Line','Khung chữ nhật','Mũi tên tạm — mất sau 3 giây','Line tạm — mất sau 3 giây','Khung tạm — mất sau 3 giây'];
    for(const label of ordinary){await h.click(label);assert.equal(size(),'6px');}
    await h.click('Bút vẽ và Highlight');
    for(const label of ['Bút vẽ tự do','Bút vẽ thông minh']){await h.click(label);assert.equal(size(),'6px');}
    await h.click('Highlight tự do');assert.equal(size(),'10px');await inputWidth('15');
    await h.click('Highlight thông minh');assert.equal(size(),'15px');
    await h.click('Xóa nét vẽ và hình');assert.equal(size(),'15px');
    await h.click('Highlight tự do');
    const canvas=doc.querySelector('canvas')!;
    await h.pointer(canvas,'pointerdown',100,600);await h.pointer(canvas,'pointermove',300,620);await h.pointer(canvas,'pointerup',300,620);
    assert.equal(h.model.shapes[0].size,15);assert.equal(h.model.shapes[0].isHighlighter,true);
    await h.click('Mũi tên, Line và khung');assert.equal(size(),'6px');await h.click('Mũi tên');
    await h.pointer(h.svg(),'pointerdown',100,100);await h.pointer(h.svg(),'pointerup',400,100);
    assert.equal(h.model.shapes[1].size,6);
    for(const shape of h.model.shapes){assert.equal(shape.color,'#3b82f6');assert.equal(shape.dashStyle,'dashed');}
    await h.click('Bút vẽ và Highlight');assert.equal(size(),'15px');
    await act(async()=>h.model.state.reset());
    assert.equal(h.model.state.settings.size,4);assert.equal(h.model.state.highlightSize,10);
    assert.equal(h.model.state.settings.color,'#ef4444');assert.equal(h.model.state.settings.dashStyle,'solid');
    await h.click('Mũi tên, Line và khung');assert.equal(size(),'4px');
    await h.click('Bút vẽ và Highlight');await h.click('Highlight thông minh');assert.equal(size(),'10px');
  } finally {await h.dispose();}
});

test('manual widths above 16 reach the actual stroke; slider stays at 16 and invalid/empty drafts do not damage settings',async()=>{
  const h=await harness();try {
    const doc=h.dom.window.document;
    const setter=Object.getOwnPropertyDescriptor(h.dom.window.HTMLInputElement.prototype,'value')!.set!;
    const enter=async(input:HTMLInputElement,text:string)=>act(async()=>{setter.call(input,text);input.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));});
    await h.click('Độ dày nét');
    const number=doc.querySelector<HTMLInputElement>('[aria-label="Độ dày nét (px)"]')!;
    const slider=doc.querySelector<HTMLInputElement>('[aria-label="Điều chỉnh độ dày nét"]')!;
    assert.equal(number.hasAttribute('max'),false);
    for(const value of ['50','125','0.5']) {
      await enter(number,value);assert.equal(h.model.state.settings.size,Number(value));assert.equal(slider.max,'16');
    }
    await enter(number,'125');assert.equal(slider.value,'16');
    await enter(number,'');assert.equal(number.value,'');assert.equal(h.model.state.settings.size,125);
    await enter(number,'0');assert.equal(h.model.state.settings.size,125);
    await enter(number,'-4');assert.equal(h.model.state.settings.size,125);
    await enter(number,'80');
    await h.pointer(h.svg(),'pointerdown',100,200);await h.pointer(h.svg(),'pointerup',500,200);
    assert.equal(h.model.shapes[0].size,80);
    assert.equal(quickGeometry(h.model.shapes[0],1000,800,1).lineWidth,80);
    assert.equal(h.svg().querySelector('[data-quick-shape-hit] > g')!.getAttribute('stroke-width'),'80');
    if(!doc.querySelector('[aria-label="Điều chỉnh độ dày nét"]'))await h.click('Độ dày nét');
    const newSlider=doc.querySelector<HTMLInputElement>('[aria-label="Điều chỉnh độ dày nét"]')!;
    await enter(newSlider,'12');assert.equal(h.model.state.settings.size,12);
    assert.equal(doc.querySelector<HTMLInputElement>('[aria-label="Độ dày nét (px)"]')!.value,'12');
    await h.click('Bút vẽ và Highlight');await h.click('Highlight tự do');await h.click('Độ dày nét');
    await enter(doc.querySelector<HTMLInputElement>('[aria-label="Độ dày nét (px)"]')!,'50');
    const canvas=doc.querySelector('canvas')!;
    await h.pointer(canvas,'pointerdown',100,600);await h.pointer(canvas,'pointermove',300,620);await h.pointer(canvas,'pointerup',300,620);
    assert.equal(h.model.shapes.at(-1)!.size,50);assert.equal(h.model.shapes.at(-1)!.isHighlighter,true);
    assert.equal(h.model.state.settings.size,12);assert.equal(h.model.state.highlightSize,50);
  } finally {await h.dispose();}
});

test('nearby handle targets edit the closest endpoint/midpoint without enlarging the visible dots or jumping to the click',async()=>{
  for(const tool of ['quick_arrow','quick_line','quick_arrow_temporary','quick_line_temporary'] as const) {
    const h=await harness(tool);try {
      const get=()=>h.model.shapes[0] || h.model.state.temporary[0];
      await h.pointer(h.svg(),'pointerdown',100,200);await h.pointer(h.svg(),'pointerup',500,200);
      for(const index of [0,1,2]) {
        const before=get().points.map(p=>({...p}));
        const dot=before[index],x=dot.x*10+8,y=dot.y*8+8;
        const target=h.svg().querySelector(`[data-quick-handle-hit="${index}"]`)!;
        assert.equal(target.getAttribute('width'),'22');
        for(const circle of h.svg().querySelectorAll('circle'))assert.equal(circle.getAttribute('r'),'4');
        await h.pointer(target,'pointerdown',x,y);
        await h.pointer(h.svg(),'pointerup',x+20,y+16);
        assert.ok(Math.abs(get().points[index].x-dot.x-2)<1e-10);assert.ok(Math.abs(get().points[index].y-dot.y-2)<1e-10);
        if(index===1){assert.deepEqual(get().points[0],before[0]);assert.deepEqual(get().points[2],before[2]);}
        else assert.deepEqual(get().points[2-index],before[2-index]);
      }
    } finally {await h.dispose();}
  }
});

test('real arrow and Highlight layers reopen their editor in select mode, edit once through shared selection and close on empty paper',async()=>{
  for(const tool of ['quick_arrow','highlighter'] as const) {
    const h=await harness(tool,1,1,true);try {
      const canvas=tool==='quick_arrow'?h.svg():h.dom.window.document.querySelector('canvas')!;
      await h.pointer(canvas,'pointerdown',100,200);await h.pointer(canvas,'pointermove',400,200);await h.pointer(canvas,'pointerup',400,200);
      assert.equal(h.model.shapes.length,1);
      await act(async()=>h.model.setTool('select'));
      const hit=h.dom.window.document.querySelector(`[data-annotation-id="${h.model.shapes[0].id}"] path[stroke="transparent"]`)!;
      await h.pointer(hit,'pointerdown',250,200);await h.pointer(h.svg(),'pointerup',250,200);
      assert.equal(h.model.state.open,true);assert.equal(h.model.state.group,tool==='quick_arrow'?'quick':'draw');
      if(tool==='highlighter')await act(async()=>h.model.state.updateHighlightSize(15));
      else await act(async()=>h.model.state.updateSettings({size:9,color:'#22c55e'}));
      assert.equal(h.model.shapes[0].size,tool==='quick_arrow'?9:15);assert.equal(h.commits(),1);
      await h.pointer(h.svg(),'pointerdown',900,700);await h.pointer(h.svg(),'pointerup',900,700);
      assert.equal(h.model.state.open,false);
    } finally {await h.dispose();}
  }
});
