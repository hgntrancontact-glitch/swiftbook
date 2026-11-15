import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PDFPageView} from '../src/components/PDFPageView';
import {pageLabelPosition,registerPageLabel} from '../src/utils/pageLabels';

test('page labels keep their base design while their body follows page zoom',()=>{
  let labelClass='';
  for(const scale of [.2,.75,1,2.26,5]) {
    const html=renderToStaticMarkup(React.createElement(PDFPageView,{fileId:'label-test',pdfDoc:{numPages:10},pageNumber:2,scale,
      activeTool:'select',penColor:'#000000',penSize:2,highlights:[],textNotes:[],drawings:[],boxes:[],freeTexts:[]} as any));
    const parents:string[]=[];
    let found=false;
    for(const tag of html.matchAll(/<\/?div\b[^>]*>/g)) {
      if(tag[0].startsWith('</')) {parents.pop();continue;}
      if(tag[0].includes('data-page-label=')) {
        found=true;
        assert.ok(parents.at(-1)?.includes('data-pdf-page-slot="true"'));
        assert.ok(!parents.some(parent=>parent.includes('data-page-container="true"')));
        const classes=tag[0].match(/class="([^"]*)"/)![1];
        if(labelClass) assert.equal(classes,labelClass);else labelClass=classes;
        const body=html.match(/data-page-label-body="[^"]*" class="([^"]*)"/)![1];
        assert.ok(body.includes('h-[18px]') && body.includes('text-[10px]'));
      }
      parents.push(tag[0]);
    }
    assert.ok(found);
  }
});

test('viewport labels preserve the bottom-centre attachment through live zoom and native scrolling',()=>{
  const viewport={left:100,top:70,bottom:790,width:1200};
  for(const zoom of [.2,.75,1,2.26,5]) for(const scroll of [{left:0,top:0},{left:500,top:900}]) {
    const page={left:180-scroll.left,top:120-scroll.top,bottom:120+842*zoom-scroll.top,width:595*zoom};
    const label=pageLabelPosition(page,viewport,scroll,zoom);
    assert.equal(label.left+viewport.left-scroll.left,page.left+page.width/2);
    assert.ok(Math.abs(label.top+viewport.top-scroll.top+18*zoom-(page.bottom-4*zoom))<1e-9);
  }
});

test('label body scales with the live page and keeps that scale after committing zoom',()=>{
  const saved={window:globalThis.window,ResizeObserver:globalThis.ResizeObserver,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
  const trace:string[]=[];
  Object.assign(globalThis,{window:new EventTarget(),ResizeObserver:class {observe(){} unobserve(){} disconnect(){}},requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{}});
  let a=0,b=0,userZoom=1,layoutWidth=595;
  const view=Object.assign(new EventTarget(),{scrollLeft:0,scrollTop:0,getBoundingClientRect:()=>({left:0,top:0,bottom:800,width:1200})}) as unknown as HTMLElement;
  const labelLayout={style:{getPropertyValue:()=>String(layoutWidth)},closest:()=>({dataset:{userZoom:String(userZoom)}})};
  const slotA={...labelLayout,getBoundingClientRect:()=>{trace.push('read-a');return {left:50,top:0,bottom:842*a,width:595*a};}} as unknown as HTMLElement;
  const slotB={...labelLayout,getBoundingClientRect:()=>{trace.push('read-b');return {left:650,top:0,bottom:842*b,width:595*b};}} as unknown as HTMLElement;
  const tag=(id:string)=>({firstElementChild:{style:{zoom:'1'}},style:new Proxy({fontSize:'10px',height:'18px'} as Record<string,string>,{set(target,key,value){trace.push('write-'+id);target[String(key)]=value;return true;}})}) as unknown as HTMLElement;
  const labelA=tag('a'),labelB=tag('b');
  let removeA=()=>{},removeB=()=>{};
  try {
    removeA=registerPageLabel(view,slotA,labelA);removeB=registerPageLabel(view,slotB,labelB);
    for(const zoom of [.2,.75,1,2.26,5]) {
      a=b=zoom;userZoom=1;layoutWidth=595;trace.length=0;view.dispatchEvent(new Event('pdf-viewport-pan'));
      assert.deepEqual(trace.slice(0,2),['read-a','read-b']);
      assert.equal(Number((labelA.firstElementChild as HTMLElement).style.zoom),zoom);
      assert.equal(Number((labelB.firstElementChild as HTMLElement).style.zoom),zoom);
      assert.equal(parseFloat(labelA.style.left),50+595*zoom/2);
      assert.equal(parseFloat(labelB.style.top),842*zoom-22*zoom);
      userZoom=zoom;layoutWidth=595*zoom;view.dispatchEvent(new Event('pdf-zoom-end'));
      assert.equal(Number((labelA.firstElementChild as HTMLElement).style.zoom),zoom);
    }
  } finally {removeA();removeB();Object.assign(globalThis,saved);}
});
