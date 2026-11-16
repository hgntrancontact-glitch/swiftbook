import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act,useRef,useState} from 'react';
import {JSDOM} from 'jsdom';
import {useWorkspaceDocumentFocus} from '../src/hooks/useWorkspaceDocumentFocus';

test('opening PDF 3 and later PDFs focuses their committed columns, including hidden/reopened files and repeated tab requests',async()=>{
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost'});
  const descriptors=new Map<string,PropertyDescriptor|undefined>();
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})) {
    descriptors.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  }
  let left=0;const calls:ScrollToOptions[]=[];const api:any={};
  Object.defineProperty(dom.window.HTMLElement.prototype,'clientWidth',{get:()=>2000,configurable:true});
  dom.window.HTMLElement.prototype.scrollTo=function(options:any){calls.push(options);left=options.left;};
  function App() {
    const [docs,setDocs]=useState([{id:'pdf1',hidden:false}]),[active,setActive]=useState('pdf1');
    const container=useRef<HTMLDivElement>(null),pair=useRef(0);
    const focus=useWorkspaceDocumentFocus(container,pair,docs.filter(d=>!d.hidden).map(d=>d.id));
    Object.assign(api,{docs,active,pair,open:(id:string)=>{
      // Request focus before React has inserted/unhidden the target column.
      focus(id);setActive(id);
      setDocs(old=>old.some(d=>d.id===id)?old.map(d=>d.id===id?{...d,hidden:false}:d):[...old,{id,hidden:false}]);
    },hide:(id:string)=>setDocs(old=>old.map(d=>d.id===id?{...d,hidden:true}:d))});
    return React.createElement('div',{ref:container},docs.map(d=>React.createElement('div',{key:d.id,'data-workspace-doc':d.id,style:{display:d.hidden?'none':'flex'}},d.id)));
  }
  const {createRoot}=await import('react-dom/client');const root=createRoot(dom.window.document.getElementById('root')!);
  try {
    await act(async()=>root.render(React.createElement(App)));
    await act(async()=>api.open('pdf2'));assert.equal(left,0);assert.equal(api.active,'pdf2');
    await act(async()=>api.open('pdf3'));assert.equal(left,1000);assert.equal(api.pair.current,1);assert.equal(api.active,'pdf3');
    await act(async()=>{api.open('pdf4');api.open('pdf5');});
    assert.equal(left,3000);assert.equal(api.pair.current,3);assert.equal(api.active,'pdf5');
    assert.equal(calls.at(-1)!.behavior,'instant');
    await act(async()=>api.open('pdf1'));assert.equal(left,0);
    await act(async()=>api.hide('pdf3'));await act(async()=>api.open('pdf3'));
    assert.equal(left,1000);assert.equal(api.active,'pdf3');
    const count=calls.length;
    await act(async()=>api.open('pdf3'));assert.equal(calls.length,count+1);assert.equal(left,1000);
    assert.equal(api.docs.filter((d:any)=>d.id==='pdf3').length,1);
  } finally {
    await act(async()=>root.unmount());dom.window.close();
    for(const [key,descriptor] of descriptors){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}
  }
});
