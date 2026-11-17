import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act,useState} from 'react';
import {JSDOM} from 'jsdom';
import {HighlightOverlay} from '../src/components/HighlightOverlay';
import type {HighlightAnnotation} from '../src/types';

test('note icon stays on its stored first/last endpoint during scrolling, switches manually, and retains popup hover',async()=>{
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost'});
  const descriptors=new Map<string,PropertyDescriptor|undefined>(),frames=new Map<number,FrameRequestCallback>();let serial=0;
  const globals={window:dom.window,document:dom.window.document,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,
    MutationObserver:dom.window.MutationObserver,CSS:{escape:(id:string)=>id},IS_REACT_ACT_ENVIRONMENT:true,
    ResizeObserver:class {observe(){}unobserve(){}disconnect(){}},
    requestAnimationFrame:(fn:FrameRequestCallback)=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:(id:number)=>frames.delete(id)};
  for(const [key,value] of Object.entries(globals)){descriptors.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
  Object.defineProperty(dom.window,'innerWidth',{value:1000});Object.defineProperty(dom.window,'innerHeight',{value:1100});
  Object.defineProperty(dom.window.HTMLElement.prototype,'offsetHeight',{get(){return 100;}});
  let pageTop=-1200;
  dom.window.HTMLElement.prototype.getBoundingClientRect=function(){
    if(this.hasAttribute('data-highlight-note-preview')) {
      const scale=Number(this.style.getPropertyValue('--highlight-ui-scale')) || 1;
      return {left:0,top:0,right:236*scale,bottom:100*scale,width:236*scale,height:100*scale,x:0,y:0,toJSON(){}};
    }
    const isRect=this.id.includes('-rect-');
    const left=100+(isRect?parseFloat(this.style.left)*8:0),top=pageTop+(isRect?parseFloat(this.style.top)*10:0);
    const width=isRect?parseFloat(this.style.width)*8:800,height=isRect?parseFloat(this.style.height)*10:1000;
    if(this.classList.contains('pdf-viewport-container')) return {left:100,right:900,top:100,bottom:1000,width:800,height:900,x:100,y:100,toJSON(){}};
    return {left,top,right:left+width,bottom:top+height,width,height,x:left,y:top,toJSON(){}};
  };
  const model:{note:HighlightAnnotation;select:(selected:boolean)=>void}={} as any;
  function App(){
    const [note,setNote]=useState<HighlightAnnotation>({id:'h',pageNumber:1,createdAt:1,text:'Two lines',selectionGeometry:'line',selectionKind:'text',color:'yellow',note:'Hello\nSecond line',
      rects:[{x:10,y:30,width:70,height:2},{x:10,y:40,width:30,height:2}]}),[selected,select]=useState(false);
    Object.assign(model,{note,select});
    return React.createElement('div',{className:'pdf-viewport-container'},
      React.createElement('div',{'data-user-zoom':1,'data-scale':1},
        React.createElement('div',{'data-pdf-page-slot':true,style:{'--pdf-page-width':'800px'} as any},
          React.createElement('div',{'data-page-container':true},
            React.createElement('div',{id:'elevated-annotation-container-1'}),
            React.createElement(HighlightOverlay,{pageNumber:1,highlights:[note],selectedIds:selected?['h']:[],onDeleteHighlight(){},
              onUpdateHighlight:(_,updates)=>setNote(old=>({...old,...updates}))})))));
  }
  const {createRoot}=await import('react-dom/client'),root=createRoot(dom.window.document.getElementById('root')!);
  const flush=async()=>act(async()=>{for(let i=0;i<5;i++){await Promise.resolve();const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn(0));}});
  try {
    await act(async()=>root.render(React.createElement(App)));await flush();
    const doc=dom.window.document,viewport=doc.querySelector('.pdf-viewport-container')!;
    const icon=()=>doc.querySelector<HTMLElement>('[data-highlight-note-icon]')!;
    const badge=()=>doc.querySelector<HTMLElement>('[data-highlight-note-badge]')!;
    const popup=()=>doc.querySelector<HTMLElement>('[data-highlight-note-popup-frame]')!;
    assert.equal(model.note.noteSide,undefined); // offscreen retained pages cannot choose a side before being read
    assert.equal(icon().style.visibility,'hidden');
    pageTop=100;await act(async()=>viewport.dispatchEvent(new dom.window.Event('scroll')));await flush();
    assert.equal(model.note.noteSide,'above');assert.equal(icon().dataset.popupDirection,'above');
    assert.equal(parseFloat(badge().style.left),629);
    assert.equal(badge().style.width,'42px');assert.equal(badge().style.height,'22px');
    assert.ok(!badge().className.includes('bg-'));assert.ok(!badge().className.includes('border-'));
    assert.equal(icon().style.width,'22px');assert.ok(icon().className.includes('rounded-full'));assert.ok(icon().className.includes('bg-[#f5c41a]'));
    assert.ok(badge().contains(icon()));assert.ok(badge().contains(doc.querySelector('[data-highlight-note-side]')));
    assert.ok(doc.querySelector('[data-highlight-note-side] [data-note-arrow=down]'));
    assert.ok(doc.querySelector('[data-highlight-note-side]')!.className.includes('text-black'));
    assert.equal(doc.querySelector('[data-highlight-note-side] path')!.getAttribute('stroke-width'),'1.25');
    await act(async()=>{doc.getElementById('hl-h-rect-0')!.dispatchEvent(new dom.window.MouseEvent('mouseover',{bubbles:true}));});
    assert.equal(popup().style.visibility,'hidden');
    await act(async()=>{icon().dispatchEvent(new dom.window.MouseEvent('mouseover',{bubbles:true}));});await flush();
    assert.equal(popup().style.visibility,'visible');
    await act(async()=>{
      icon().dispatchEvent(new dom.window.MouseEvent('mouseout',{bubbles:true,relatedTarget:popup()}));
      popup().dispatchEvent(new dom.window.MouseEvent('mousemove',{bubbles:true}));
    });
    assert.equal(popup().style.visibility,'visible');
    const click=async(label:string)=>act(async()=>{doc.querySelector(`[aria-label="${label}"]`)!.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});
    const width=popup().style.width,rects=JSON.stringify(model.note.rects),iconSize=icon().style.width;
    assert.equal(doc.querySelector('[aria-label="Phóng lớn popup ghi chú"]'),null);
    await click('Hiện chỉnh kích thước popup ghi chú');await flush();
    assert.equal(popup().style.width,width);
    await click('Phóng lớn popup ghi chú');await flush();
    const card=doc.querySelector<HTMLElement>('[data-highlight-note-preview]')!;
    assert.equal(card.style.zoom,'1');assert.equal(card.style.transform,'');
    assert.ok(Number(card.style.getPropertyValue('--highlight-ui-scale'))>1);
    await click('Thu nhỏ popup ghi chú');await click('Thu nhỏ popup ghi chú');await flush();
    assert.equal(model.note.notePopupScale,.9);assert.equal(card.style.zoom,'1');
    assert.ok(Number(card.style.getPropertyValue('--highlight-ui-scale'))<1);
    await click('Phóng lớn popup ghi chú');await click('Phóng lớn popup ghi chú');await flush();
    assert.equal(model.note.notePopupScale,1.1);assert.ok(parseFloat(popup().style.width)>parseFloat(width));
    assert.equal(icon().style.width,iconSize);assert.equal(JSON.stringify(model.note.rects),rects);
    await click('Ẩn chỉnh kích thước popup ghi chú');await flush();assert.equal(model.note.notePopupScale,1.1);
    pageTop=-250;await act(async()=>viewport.dispatchEvent(new dom.window.Event('scroll')));await flush();
    assert.equal(icon().dataset.popupDirection,'above');assert.equal(model.note.noteSide,'above');
    await act(async()=>doc.querySelector('[data-highlight-note-side]')!.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));await flush();
    assert.equal(model.note.noteSide,'below');assert.equal(icon().dataset.popupDirection,'below');
    assert.equal(parseFloat(badge().style.left),309); // shorter last line, not the first line or union's right edge
    assert.equal(parseFloat(badge().style.top),415);
    assert.ok(doc.querySelector('[data-highlight-note-side] [data-note-arrow=up]'));
    await act(async()=>model.select(true));await flush(); // moving the interactive overlay between base/elevated portals must not reset the side
    assert.equal(icon().dataset.popupDirection,'below');
    const toolbar=doc.querySelector<HTMLElement>('.highlight-popup-toolbar')!,toolbarZoom=Number(toolbar.style.zoom);
    await click('Hiện chỉnh kích thước toolbar Highlight');await click('Phóng lớn toolbar Highlight');await flush();
    assert.equal(model.note.toolbarScale,1.1);assert.ok(Math.abs(Number(toolbar.style.zoom)-toolbarZoom*1.1)<1e-9);
    assert.equal(JSON.stringify(model.note.rects),rects);
    assert.equal(doc.querySelector('[data-annotation-id="h"]')!.className.includes('ring-blue'),false);
    pageTop=200;await act(async()=>viewport.dispatchEvent(new dom.window.Event('scroll')));await flush();
    assert.equal(icon().dataset.popupDirection,'below');
    await act(async()=>model.select(false));await flush();
    assert.equal(icon().dataset.popupDirection,'below');
  } finally {
    await act(async()=>root.unmount());dom.window.close();
    for(const [key,descriptor] of descriptors){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}
  }
});
