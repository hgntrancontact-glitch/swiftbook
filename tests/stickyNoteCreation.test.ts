import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createStickyNote} from '../src/utils/stickyNoteCreation';
import {StickyNotesLayer} from '../src/components/StickyNotesLayer';

function renderNote(createdScale:number,currentScale:number) {
  const note={...createStickyNote(4,20,30,createdScale),id:'created',createdAt:1};
  const html=renderToStaticMarkup(React.createElement(StickyNotesLayer,{
    pageNumber:4,notes:[note],scale:currentScale,isStickyToolActive:false,
    onAddNote:()=>{},onUpdateNote:()=>{},onDeleteNote:()=>{}}));
  return html.match(/class="relative shadow-2xl flex flex-col[^>]+style="([^"]+)"/)![1];
}

test('new sticky notes retain the original 224 by 160 default on different PDF scales',()=>{
  for(const scale of [.5,1,1.9,2.42,4]) {
    const style=renderNote(scale,scale);
    assert.ok(style.includes('zoom:1;'));
    assert.ok(style.includes('width:224px;'));
    assert.ok(style.includes('height:160px;'));
  }
});

test('a note subsequently follows zoom relative to its creation scale',()=>{
  const style=renderNote(1.9,3.8);
  assert.ok(style.includes('zoom:2;'));
  assert.ok(style.includes('width:224px;') && style.includes('height:160px;'));
  const created=createStickyNote(4,20,30,1.9*1.5);
  assert.equal(created.referenceScale,2.8499999999999996);
  assert.equal(created.pageNumber,4);assert.equal(created.x,20);assert.equal(created.y,30);
});
