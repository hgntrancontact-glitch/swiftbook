import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act,useState} from 'react';
import {JSDOM} from 'jsdom';
import {BoxToolbarControls} from '../src/components/BoxToolbarControls';
import type {BoxAnnotation} from '../src/types';

test('Box toolbar changes width, toggles dash/fill directly, retains fill when recoloured and deletes the selected box',async()=>{
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost'});
  const descriptors=new Map<string,PropertyDescriptor|undefined>();
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})) {
    descriptors.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  }
  const initial:BoxAnnotation={id:'box',pageNumber:1,createdAt:1,x:20,y:20,width:30,height:15,color:'#22c55e',borderWidth:4,borderStyle:'solid',fillColor:'transparent'};
  let saved=initial,deleted=false;
  function App() {
    const [box,setBox]=useState(initial);saved=box;
    return React.createElement('div',{className:'box-floating-toolbar noto-ui'},React.createElement(BoxToolbarControls,{box,
      onChange:patch=>setBox(old=>({...old,...patch})),onDelete:()=>{deleted=true;}}));
  }
  const {createRoot}=await import('react-dom/client');const root=createRoot(dom.window.document.getElementById('root')!);
  const doc=dom.window.document;
  const click=async(label:string)=>{await act(async()=>doc.querySelector(`[aria-label="${label}"]`)!.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));};
  try {
    await act(async()=>root.render(React.createElement(App)));
    assert.equal(doc.querySelectorAll('.box-toolbar-color').length,5);
    const dash=()=>doc.querySelector('[aria-label="Đổi nét viền khung liền hoặc đứt"] rect')!;
    assert.equal(dash().getAttribute('stroke-dasharray'),null);
    await click('Đổi nét viền khung liền hoặc đứt');assert.equal(saved.borderStyle,'dashed');assert.equal(dash().getAttribute('stroke-dasharray'),'4 2');
    await click('Đổi nét viền khung liền hoặc đứt');assert.equal(saved.borderStyle,'solid');
    await click('Bật hoặc tắt nền khung');assert.equal(saved.fillColor,'#22c55e25');
    await click('Màu khung #3b82f6');assert.equal(saved.color,'#3b82f6');assert.equal(saved.fillColor,'#3b82f625');
    await click('Bật hoặc tắt nền khung');assert.equal(saved.fillColor,'transparent');
    await click('Màu khung #ef4444');assert.equal(saved.fillColor,'transparent');
    const input=doc.querySelector('input')!;
    const setter=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!;
    await act(async()=>{setter.call(input,'7');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
    assert.equal(saved.borderWidth,7);assert.equal(doc.querySelector('.box-toolbar-width')!.textContent,'7 px');
    assert.deepEqual([saved.x,saved.y,saved.width,saved.height],[20,20,30,15]);
    await click('Xóa khung');assert.equal(deleted,true);
  } finally {
    await act(async()=>root.unmount());dom.window.close();
    for(const [key,descriptor] of descriptors){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}
  }
});
