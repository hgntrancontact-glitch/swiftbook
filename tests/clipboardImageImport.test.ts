import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act,useRef,useState} from 'react';
import {JSDOM} from 'jsdom';
import {clipboardImages,FREE_TEXT_CLIPBOARD_TYPE,useClipboardImageImport} from '../src/hooks/useClipboardImageImport';
import {useWorkspaceDocumentFocus} from '../src/hooks/useWorkspaceDocumentFocus';
import {FreeTextLayer} from '../src/components/FreeTextLayer';
import type {FreeTextAnnotation} from '../src/types';

async function harness(initial:string[]=[],withText=false,hold=false) {
  const dom=new JSDOM('<div id="root"></div><input id="outside">',{url:'http://localhost'}),saved=new Map<string,PropertyDescriptor|undefined>(),frames=new Map<number,FrameRequestCallback>();
  let serial=0,left=0;
  const globals={window:dom.window,document:dom.window.document,Node:dom.window.Node,NodeFilter:dom.window.NodeFilter,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,
    SVGElement:dom.window.SVGElement,File:dom.window.File,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,MutationObserver:dom.window.MutationObserver,
    getComputedStyle:dom.window.getComputedStyle,CSS:{escape:(value:string)=>value},IS_REACT_ACT_ENVIRONMENT:true,
    ResizeObserver:class{observe(){}disconnect(){}},
    requestAnimationFrame:(fn:FrameRequestCallback)=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:(id:number)=>frames.delete(id)};
  for(const [key,value] of Object.entries(globals)){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
  Object.defineProperty(dom.window.HTMLElement.prototype,'clientWidth',{get:()=>2000});
  dom.window.HTMLElement.prototype.scrollTo=function(options:any){left=options.left;};
  dom.window.HTMLElement.prototype.getBoundingClientRect=function(){return {left:0,top:0,right:1000,bottom:800,width:1000,height:800,x:0,y:0,toJSON(){}};};
  dom.window.document.execCommand=()=>true;
  const started:File[]=[],releases:(()=>void)[]=[],errors:unknown[]=[],api:any={};
  const original:FreeTextAnnotation={id:'text-original',pageNumber:1,x:10,y:20,text:'<b>Ghi chú</b>',fontSize:16,color:'#000',createdAt:1};
  function App(){
    const [docs,setDocs]=useState(initial),[active,setActive]=useState(initial.at(-1) || ''),[disabled,setDisabled]=useState(false),[texts,setTexts]=useState([original]);
    const workspace=useRef<HTMLDivElement>(null),columns=useRef<HTMLDivElement>(null),pair=useRef(0),focus=useWorkspaceDocumentFocus(columns,pair,docs);
    useClipboardImageImport(workspace,async file=>{
      started.push(file);if(hold)await new Promise<void>(resolve=>releases.push(resolve));
      if(file.size===1)throw new Error('Image decode failed');
      setDocs(previous=>[...previous,file.name]);setActive(file.name);focus(file.name);
    },disabled,error=>errors.push(error));
    Object.assign(api,{docs,active,texts,setDisabled});
    return React.createElement('div',{ref:workspace,tabIndex:-1,'data-workspace':true},
      React.createElement('div',{'data-empty':true}),
      React.createElement('textarea',{'aria-label':'Note'}),React.createElement('div',{contentEditable:true,suppressContentEditableWarning:true},React.createElement('span',{'data-editor-child':true},'Text')),
      React.createElement('div',{ref:columns},docs.map((id,index)=>React.createElement('div',{key:id,'data-workspace-doc':id},React.createElement('div',{'data-page-container':true,'data-page-index':index},
        React.createElement('canvas'),withText && index===0?React.createElement(FreeTextLayer,{fileId:id,pageNumber:1,freeTexts:texts,isTextToolActive:false,selectedIds:['text-original'],
          onAddText:item=>setTexts(previous=>[...previous,item as FreeTextAnnotation]),onUpdateText:(target,updates)=>setTexts(previous=>previous.map(item=>item.id===target?{...item,...updates}:item)),onDeleteText(){}}):null)))));
  }
  const {createRoot}=await import('react-dom/client'),root=createRoot(dom.window.document.getElementById('root')!);
  await act(async()=>root.render(React.createElement(App)));
  const doc=dom.window.document,workspace=doc.querySelector<HTMLElement>('[data-workspace]')!;
  const flush=async()=>act(async()=>{for(let i=0;i<10;i++){await Promise.resolve();const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(0));}});
  const file=(name='image.png',type='image/png',size=3)=>new dom.window.File([new Uint8Array(size)],name,{type});
  const clipboard=(files:File[]=[],values:Record<string,string>={})=>({items:files.map(value=>({kind:'file',type:value.type,getAsFile:()=>value})),files,
    getData:(type:string)=>values[type] || '',setData:(type:string,value:string)=>{values[type]=value;},values}) as unknown as DataTransfer & {values:Record<string,string>};
  const event=async(type:string,data:DataTransfer,target:EventTarget=doc.activeElement!)=>{
    const event=new dom.window.Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:data});
    await act(async()=>target.dispatchEvent(event));await flush();return event;
  };
  const click=async(target:Element=doc.querySelector('canvas') || doc.querySelector('[data-empty]')!,right=false)=>{
    await act(async()=>target.dispatchEvent(new dom.window.MouseEvent(right?'contextmenu':'pointerdown',{bubbles:true,cancelable:true,button:right?2:0})));await flush();
  };
  return {dom,doc,workspace,api,started,errors,file,clipboard,event,click,flush,get left(){return left;},
    async release(){await act(async()=>releases.shift()!());await flush();},
    async dispose(){await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}}};
}

test('pasting an image appends a focused document in an empty, single-PDF or mixed workspace, including right-clicked canvas',async()=>{
  for(const initial of [[],['A.pdf'],['A.pdf','B.pdf','C.pdf'],['A.pdf','B.pdf','Photo.png']]) {
    const h=await harness(initial);try {
      h.doc.querySelector<HTMLInputElement>('#outside')!.focus();
      await h.click(undefined,true);const image=h.file(),data=h.clipboard([image]);
      const event=await h.event('paste',data);
      assert.equal(event.defaultPrevented,true);assert.equal(h.started.length,1); // items/files must not import twice
      assert.deepEqual(h.api.docs.slice(0,-1),initial);assert.equal(h.api.docs.length,initial.length+1);
      assert.equal(h.api.active,h.api.docs.at(-1));assert.match(h.api.active,/^Ảnh dán .*\.png$/);
      assert.equal(h.started[0].size,image.size);assert.equal(h.started[0].type,'image/png');
      assert.equal(h.left,Math.max(0,h.api.docs.length-2)*1000);
    } finally {await h.dispose();}
  }
});

test('clipboard image bytes are captured during the event, including empty file MIME and multiple images without merging',async()=>{
  const h=await harness(['A.pdf']);try {
    await h.click();const png=h.file('clipboard','',3),jpg=h.file('image.jpg','image/jpeg',4);
    const items=[{kind:'file',type:'image/png',getAsFile:()=>png},{kind:'file',type:'image/jpeg',getAsFile:()=>jpg}],files=[png,jpg];
    const event=new h.dom.window.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{items,files}});
    await act(async()=>{h.doc.activeElement!.dispatchEvent(event);items.length=0;files.length=0;});await h.flush();
    assert.equal(h.api.docs.length,3);assert.equal(h.started.length,2);
    assert.equal(h.started[0].type,'image/png');assert.equal(h.started[0].size,3);assert.match(h.started[0].name,/\.png$/);
    assert.equal(h.started[1].type,'image/jpeg');assert.equal(h.started[1].size,4);assert.match(h.started[1].name,/\.jpg$/);
    assert.equal(h.api.active,h.started[1].name);
  } finally {await h.dispose();}
});

test('consecutive image pastes stay in order through slow imports, and each paste gets a distinct document identity',async()=>{
  const h=await harness(['A.pdf','Photo.png'],false,true);try {
    await h.click();const data=h.clipboard([h.file()]);
    await h.event('paste',data);await h.event('paste',data);
    assert.equal(h.started.length,1);assert.equal(h.api.docs.length,2);
    await h.release();assert.equal(h.started.length,2);assert.equal(h.api.docs.length,3);
    assert.notEqual(h.started[0].name,h.started[1].name);
    await h.release();assert.deepEqual(h.api.docs,['A.pdf','Photo.png',...h.started.map(file=>file.name)]);
    assert.equal(h.api.active,h.started[1].name);
  } finally {await h.dispose();}
});

test('editors, modal dialogs and non-image clipboard data keep their normal paste behavior; failed images do not block later pastes',async()=>{
  const h=await harness(['A.pdf']);try {
    const image=h.clipboard([h.file()]);
    for(const target of [h.doc.querySelector('textarea')!,h.doc.querySelector('[data-editor-child]')!,h.doc.querySelector('#outside')!]) {
      const event=await h.event('paste',image,target);assert.equal(event.defaultPrevented,false);
    }
    await h.click();await act(async()=>h.api.setDisabled(true));assert.equal((await h.event('paste',image)).defaultPrevented,false);
    await act(async()=>h.api.setDisabled(false));
    for(const data of [h.clipboard([],{ 'text/plain':'Hello'}),h.clipboard([h.file('book.pdf','application/pdf')])])assert.equal((await h.event('paste',data)).defaultPrevented,false);
    assert.equal(h.started.length,0);
    await h.event('paste',h.clipboard([h.file('broken.png','image/png',1)]));assert.equal(h.errors.length,1);
    await h.event('paste',h.clipboard([h.file('good.webp','image/webp',4)]));assert.equal(h.api.docs.length,2);assert.match(h.api.active,/\.webp$/);
    assert.equal(clipboardImages({items:[],files:[h.file()]} as any).length,1);
  } finally {await h.dispose();}
});

test('native text-object copy/paste still works, while a subsequently copied image imports once and never duplicates the text object',async()=>{
  const h=await harness(['A.pdf'],true);try {
    await h.click();const data=h.clipboard();
    await h.event('copy',data);assert.ok(data.values[FREE_TEXT_CLIPBOARD_TYPE]);
    const key=new h.dom.window.KeyboardEvent('keydown',{key:'v',metaKey:true,bubbles:true,cancelable:true});
    await act(async()=>h.doc.activeElement!.dispatchEvent(key));assert.equal(key.defaultPrevented,false);
    assert.equal((await h.event('paste',data)).defaultPrevented,true);assert.equal(h.api.texts.length,2);assert.equal(h.api.texts[1].text,'<b>Ghi chú</b>');
    await h.click(undefined,true);await h.event('paste',h.clipboard([h.file()]));
    assert.equal(h.api.docs.length,2);assert.equal(h.api.texts.length,2);assert.equal(h.started.length,1);
  } finally {await h.dispose();}
});
