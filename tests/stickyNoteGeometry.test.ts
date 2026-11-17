import assert from 'node:assert/strict';
import {test} from 'node:test';
import {stickyNoteGeometry} from '../src/utils/stickyNoteGeometry';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {StickyNotesLayer} from '../src/components/StickyNotesLayer';
import {transformAnnotations} from '../src/utils/annotationSelection';

test('small portrait/spread pages cap note paper and its controls before minimum sizes, and keep it inside the page',()=>{
  for(const [w,h] of [[140,220],[250,500],[595,842],[1320,750]]) for(const zoom of [.2,.5,1,2,5]) {
    const g=stickyNoteGeometry({x:92,y:90},w*zoom,h*zoom,zoom);
    assert.ok(g.width<=w*zoom*.95+1e-9 && g.height<=h*zoom*.95+1e-9);
    assert.ok(g.x/100*w*zoom+g.width<=w*zoom+1e-9);
    assert.ok(g.y/100*h*zoom+g.height<=h*zoom+1e-9);
    assert.ok(g.width/g.scale>=160-1e-9 && g.height/g.scale>=100-1e-9);
    const baseline=stickyNoteGeometry({x:92,y:90},w,h,1);
    assert.ok(Math.abs(g.width/zoom-baseline.width)<1e-9);
    assert.ok(Math.abs(g.scale/zoom-baseline.scale)<1e-9);
  }
});

test('restored pixel and percentage note sizes share the same page bounds while ordinary defaults stay 224 by 184',()=>{
  assert.deepEqual(stickyNoteGeometry({x:20,y:30},595,842,1),{width:224,height:184,scale:1,x:20,y:30});
  for(const stored of [60,95,400,1200]) {
    const g=stickyNoteGeometry({x:80,y:80,width:stored,height:stored},180,260,2);
    assert.ok(g.width<=171 && g.height<=247);
    assert.ok(g.x+g.width/180*100<=100+1e-9);
  }
});

test('group movement starts from the fitted paper position, without jumping back to an old out-of-page origin',()=>{
  const note={id:'note',pageNumber:1,createdAt:1,text:'Text',color:'#ffde59',x:90,y:80,referenceScale:1};
  const moved=transformAnnotations({textNotes:[note],boxes:[],drawings:[],highlights:[],freeTexts:[]},['note'],
    {1:{left:100,top:100,width:200,height:300}},{dx:-10,dy:-20,scale:1,originX:0,originY:0},undefined,
    {note:{left:110,top:220,width:190,height:180}}).textNotes[0];
  assert.equal(moved.x,0);assert.ok(Math.abs(moved.y-100/3)<1e-9);
});

test('mounted paper recalculates after the actual PDF page size arrives without a zoom change',async()=>{
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost'});
  const descriptors=new Map<string,PropertyDescriptor|undefined>(),observers:(()=>void)[]=[];
  const globals={window:dom.window,document:dom.window.document,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,
    MutationObserver:dom.window.MutationObserver,IS_REACT_ACT_ENVIRONMENT:true,
    ResizeObserver:class {constructor(callback:()=>void){observers.push(callback);}observe(){}disconnect(){}}};
  for(const [key,value] of Object.entries(globals)){descriptors.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
  const {createRoot}=await import('react-dom/client'),root=createRoot(dom.window.document.getElementById('root')!);
  try {
    await act(async()=>root.render(React.createElement('div',{'data-page-container':true,style:{width:160,height:240}},
      React.createElement(StickyNotesLayer,{pageNumber:1,scale:1,isStickyToolActive:false,notes:[{id:'note',pageNumber:1,createdAt:1,text:'Text',color:'#ffde59',x:80,y:85,referenceScale:1}],
        onAddNote(){},onUpdateNote(){},onDeleteNote(){}}))));
    const page=dom.window.document.querySelector<HTMLElement>('[data-page-container]')!,paper=dom.window.document.querySelector<HTMLElement>('[data-note-paper]')!;
    assert.equal(parseFloat(paper.style.width)*Number(paper.style.zoom),152);
    assert.ok(dom.window.document.getElementById('sticky-note')!.style.left.startsWith('clamp('));
    page.style.width='595px';page.style.height='842px';
    await act(async()=>observers.forEach(update=>update()));
    assert.equal(paper.style.width,'224px');assert.equal(paper.style.height,'184px');assert.equal(paper.style.zoom,'1');
  } finally {
    await act(async()=>root.unmount());dom.window.close();
    for(const [key,descriptor] of descriptors){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}
  }
});
