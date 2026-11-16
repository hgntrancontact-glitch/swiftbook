import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {AnnotationToolbar} from '../src/components/AnnotationToolbar';

test('mounted Box toolbar measures its PDF page and repositions on box movement and zoom',async()=>{
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost'});
  const descriptors=new Map<string,PropertyDescriptor|undefined>();
  const frames=new Map<number,FrameRequestCallback>();let serial=0;
  const globals={window:dom.window,document:dom.window.document,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,
    MutationObserver:dom.window.MutationObserver,CSS:{escape:(id:string)=>id},IS_REACT_ACT_ENVIRONMENT:true,
    ResizeObserver:class {observe(){}unobserve(){}disconnect(){}},
    requestAnimationFrame:(fn:FrameRequestCallback)=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:(id:number)=>frames.delete(id)};
  for(const [key,value] of Object.entries(globals)){descriptors.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
  Object.defineProperty(dom.window,'innerWidth',{value:1996});Object.defineProperty(dom.window,'innerHeight',{value:1248});
  let paper={left:350,right:1640,top:250,bottom:1160};
  let box={left:1000,right:1100,top:600,bottom:640};
  dom.window.HTMLElement.prototype.getBoundingClientRect=function(){
    const bounds=this.id==='test-box'?box:this.hasAttribute('data-page-container')?paper:this.classList.contains('box-floating-toolbar')?
      {left:0,top:0,right:Math.min(400,Number.parseFloat(this.style.maxWidth)||400),bottom:44}:{left:0,right:1996,top:160,bottom:1248};
    return {...bounds,width:bounds.right-bounds.left,height:bounds.bottom-bounds.top,x:bounds.left,y:bounds.top,toJSON(){}};
  };
  const {createRoot}=await import('react-dom/client');const root=createRoot(dom.window.document.getElementById('root')!);
  const flush=async()=>act(async()=>{
    await Promise.resolve();
    for(let i=0;i<5 && frames.size;i++){const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn(0));await Promise.resolve();}
  });
  try {
    await act(async()=>root.render(React.createElement('div',{className:'pdf-viewport-container'},
      React.createElement('div',{'data-page-container':'true'},React.createElement('div',{id:'test-box'}),
        React.createElement(AnnotationToolbar,{anchorId:'test-box',align:'left',fitAnchorEdges:true,className:'box-floating-toolbar'},'Controls')))));
    const doc=dom.window.document,toolbar=doc.querySelector<HTMLElement>('.box-floating-toolbar')!;
    assert.equal(toolbar.style.left,'1000px');
    box={...box,left:1237,right:1337};
    doc.getElementById('test-box')!.style.left='1237px';await flush();
    assert.equal(toolbar.style.left,'937px'); // right edge of the box, well before the screen edge
    assert.ok(Number.parseFloat(toolbar.style.left)+400<=paper.right);
    box={...box,top:260,bottom:300};doc.getElementById('test-box')!.style.top='260px';await flush();
    assert.equal(toolbar.style.top,'310px');
    paper={left:500,right:800,top:250,bottom:1160};box={left:650,right:750,top:600,bottom:640};
    doc.querySelector('.pdf-viewport-container')!.dispatchEvent(new dom.window.Event('pdf-zoom-frame'));
    assert.equal(toolbar.style.maxWidth,'292px');
    assert.ok(Number.parseFloat(toolbar.style.left)>=paper.left);
    assert.ok(Number.parseFloat(toolbar.style.left)+292<=paper.right);
  } finally {
    await act(async()=>root.unmount());dom.window.close();
    for(const [key,descriptor] of descriptors){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}
  }
});
