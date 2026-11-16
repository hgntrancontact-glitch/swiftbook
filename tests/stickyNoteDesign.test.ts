import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {NOTE_PAPER_COLORS,getNoteColorTheme,type TextNoteAnnotation} from '../src/types';
import {StickyNotesLayer} from '../src/components/StickyNotesLayer';
import {STICKY_NOTE_DESIGN as PAPER} from '../src/utils/stickyNoteDesign';
import {renderStickyNoteOnCanvas} from '../src/utils/pageExporter';
const colors=['#ffde59','#98d08a','#f6a6a1','#9bc4fd','#ffffff'];
function note(color:string):TextNoteAnnotation {return {id:'paper',createdAt:1,pageNumber:2,x:20,y:30,text:'Nội dung\nDòng hai',color,referenceScale:1};}

test('paper uses five solid colours, Noto Sans and two 2px black separators without an outer outline or shadow',()=>{
  assert.deepEqual(NOTE_PAPER_COLORS.map(c=>c.contentBg),colors);
  for(const color of [...colors,'#ffe6f5','#bce6ff']) {
    const html=renderToStaticMarkup(React.createElement(StickyNotesLayer,{pageNumber:2,notes:[note(color)],scale:1,isStickyToolActive:false,
      onAddNote(){},onUpdateNote(){},onDeleteNote(){}}));
    const dom=new JSDOM(html);try {
      const css=readFileSync(new URL('../src/index.css',import.meta.url),'utf8');
      const style=dom.window.document.createElement('style');style.textContent=css.slice(css.indexOf('/* The redesigned drawing panels'));dom.window.document.head.appendChild(style);
      const paper=dom.window.document.querySelector<HTMLElement>('[data-note-paper]')!;
      assert.equal(paper.style.width,`${PAPER.width}px`);assert.equal(paper.style.height,`${PAPER.height}px`);
      assert.ok(!paper.className.includes('shadow'));
      assert.equal(paper.querySelector('svg rect'),null);
      const header=paper.querySelector<HTMLElement>('[title="Kéo thanh tiêu đề để di chuyển giữa các trang"]')!;
      assert.equal(header.style.borderBottom,'2px solid rgb(0, 0, 0)');
      const palette=paper.querySelector('[aria-label="Màu giấy Vàng"]')!.parentElement!.parentElement!;
      assert.equal(palette.style.borderTop,'2px solid rgb(0, 0, 0)');
      assert.equal(header.style.background,palette.style.background);
      assert.equal(paper.querySelectorAll('[aria-label^="Màu giấy "]').length,5);
      assert.ok(dom.window.getComputedStyle(paper.querySelector('textarea')!).fontFamily.includes('Noto Sans'));
      assert.equal(paper.querySelector('textarea')!.value,note(color).text);
    } finally {dom.window.close();}
  }
  assert.equal(getNoteColorTheme('#ffe6f5').contentBg,'#f6a6a1');
  assert.equal(getNoteColorTheme('#bce6ff').contentBg,'#9bc4fd');
});

test('PDF/image paper export retains the same two black separators, flat colours and Noto Sans typography at all scales',()=>{
  for(const ratio of [.5,1,2]) {
    const calls:{name:string;args:any[];state:any}[]=[],stack:any[]=[];let state:any={};
    const methods:Record<string,Function>={save(){stack.push({...state});},restore(){state=stack.pop() || {};},measureText(text:string){return {width:text.length*5};}};
    const ctx=new Proxy({} as CanvasRenderingContext2D,{get:(_,key)=>{
      if(key in methods)return methods[String(key)];
      if(key in state)return state[key];
      return (...args:any[])=>{calls.push({name:String(key),args,state:{...state}});};
    },set:(_,key,value)=>{state[key]=value;return true;}});
    renderStickyNoteOnCanvas(ctx,1000,800,ratio,note('#ffde59'));
    const lines=calls.filter(c=>c.name==='stroke' && c.state.strokeStyle==='#000');
    assert.equal(lines.length,2);for(const line of lines)assert.equal(line.state.lineWidth,PAPER.separator*ratio);
    assert.equal(calls.filter(c=>c.name==='stroke' && c.state.strokeStyle!=='#000').length,0);
    const text=calls.filter(c=>c.name==='fillText');assert.ok(text.length>=3);for(const t of text)assert.ok(t.state.font.includes('Noto Sans'));
    const background=calls.find(c=>c.name==='fill')!;assert.equal(background.state.fillStyle,'#ffde59');
    assert.equal(background.state.shadowColor,'transparent');
  }
});
