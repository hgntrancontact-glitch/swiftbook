import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act,useState} from 'react';
import {JSDOM} from 'jsdom';
import {StickyNotesLayer} from '../src/components/StickyNotesLayer';
import type {TextNoteAnnotation} from '../src/types';
import {renderStickyNoteOnCanvas} from '../src/utils/pageExporter';
import {AnnotationSelectionController} from '../src/components/AnnotationSelectionController';
import {QuickShapesProvider} from '../src/contexts/QuickShapesContext';

test('note −/+ scales one whole paper, survives zoom/save/reload and keeps manual resizing and export consistent',async()=>{
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost'});
  const descriptors=new Map<string,PropertyDescriptor|undefined>();
  const globals={window:dom.window,document:dom.window.document,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,
    Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,CSS:{escape:(s:string)=>s},MutationObserver:dom.window.MutationObserver,IS_REACT_ACT_ENVIRONMENT:true,
    ResizeObserver:class {observe(){}disconnect(){}}};
  for(const [key,value] of Object.entries(globals)){descriptors.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
  dom.window.HTMLElement.prototype.getBoundingClientRect=function(){
    const page=(this as HTMLElement).closest<HTMLElement>('[data-page-container]')!;
    const width=parseFloat(page?.style.width || '') || 900,height=parseFloat(page?.style.height || '') || 600;
    return {left:0,top:0,right:width,bottom:height,width,height,x:0,y:0,toJSON(){}};
  };
  const initial:TextNoteAnnotation[]=['one','two'].map(id=>({id,createdAt:1,pageNumber:1,x:20,y:30,text:'First\nSecond',color:'#ffde59',referenceScale:1}));
  let saved=initial,setZoom!:(zoom:number)=>void;
  function App(){const [notes,update]=useState(saved),[zoom,changeZoom]=useState(1);saved=notes;setZoom=changeZoom;
    return React.createElement(QuickShapesProvider,null,React.createElement('div',{'data-page-container':true,'data-user-zoom':zoom,style:{width:900*zoom,height:600*zoom}},
      React.createElement(StickyNotesLayer,{pageNumber:1,scale:zoom,notes,isStickyToolActive:false,onAddNote(){},onDeleteNote(){},
        onUpdateNote:(id,patch)=>update(old=>old.map(note=>note.id===id?{...note,...patch}:note))})),
      React.createElement(AnnotationSelectionController,{docs:[{id:'doc',fileId:'file',textNotes:notes,drawings:[],boxes:[],highlights:[],freeTexts:[],selectedIds:['one','two']} as any],
        activeId:'doc',activeTool:'select',disabled:false,onSelect(){},onApply(){}}));}
  const {createRoot}=await import('react-dom/client'),root=createRoot(dom.window.document.getElementById('root')!);
  const paper=(id='one')=>dom.window.document.querySelector<HTMLElement>(`#sticky-${id} [data-note-paper]`)!;
  const actual=(id='one')=>{const el=paper(id),scale=Number(el.style.zoom);return {width:parseFloat(el.style.width)*scale,height:parseFloat(el.style.height)*scale,scale};};
  const click=async(label:string)=>act(async()=>{
    const target=paper().querySelector(`[aria-label="${label}"]`)!;
    for(const type of ['pointerdown','pointerup','click']) {
      const event=new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,button:0});Object.defineProperty(event,'pointerId',{value:1});
      target.dispatchEvent(event);
    }
  });
  const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<.06,`${a} != ${b}`);
  try {
    await act(async()=>root.render(React.createElement(App)));
    const before=actual();near(before.width,190.4);near(before.height,156.4);
    const plus=paper().querySelector('[aria-label="Phóng lớn giấy note"]')!;
    assert.ok(plus.nextElementSibling!.textContent!.includes('P.1'));
    await click('Phóng lớn giấy note');near(actual().width,before.width*1.1);near(actual().scale,before.scale*1.1);
    assert.equal(saved[0].sizeMultiplier,1.1);assert.equal(saved[1].sizeMultiplier,undefined);near(actual('two').width,before.width);
    await act(async()=>setZoom(2));near(actual().width,before.width*1.1*2);near(actual().scale,before.scale*1.1*2);
    saved=JSON.parse(JSON.stringify(saved));await act(async()=>root.render(React.createElement(App,{key:'reload'})));
    near(actual().width,before.width*1.1);assert.equal(paper().querySelector('textarea')!.value,'First\nSecond');
    for(let i=0;i<6;i++)await click('Thu nhỏ giấy note');
    assert.equal(saved[0].sizeMultiplier,.5);assert.equal((paper().querySelector('[aria-label="Thu nhỏ giấy note"]') as HTMLButtonElement).disabled,true);
    const start=actual();const handle=paper().children[3];
    await act(async()=>{handle.dispatchEvent(new dom.window.MouseEvent('mousedown',{bubbles:true,clientX:10,clientY:10}));});
    await act(async()=>dom.window.dispatchEvent(new dom.window.MouseEvent('mousemove',{clientX:660,clientY:210})));
    await act(async()=>dom.window.dispatchEvent(new dom.window.MouseEvent('mouseup')));
    near(actual().width,start.width+650);near(actual().height,start.height+200);near(actual().scale,start.scale);
    assert.equal(saved[0].dimensionUnit,'percent');assert.ok(saved[0].width!>100); // no legacy px/% ambiguity after scaling a wide custom frame
    const expected=actual(),shapes:number[][]=[],fonts:string[]=[],state:any={};
    const context=new Proxy({} as CanvasRenderingContext2D,{get:(_,key)=>{
      if(key==='roundRect')return (...args:number[])=>shapes.push(args);
      if(key==='measureText')return (text:string)=>({width:text.length*5});
      if(key==='fillText')return ()=>fonts.push(state.font);
      if(key in state)return state[key];return ()=>{};
    },set:(_,key,value)=>{state[key]=value;return true;}});
    renderStickyNoteOnCanvas(context,900,600,1,saved[0]);near(shapes[0][2],expected.width);near(shapes[0][3],expected.height);
    assert.ok(fonts.some(font=>font.includes(`${13*expected.scale}px`)));
  } finally {
    await act(async()=>root.unmount());dom.window.close();
    for(const [key,descriptor] of descriptors){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}
  }
});
