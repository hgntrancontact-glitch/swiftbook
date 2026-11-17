import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createStickyNote} from '../src/utils/stickyNoteCreation';
import {StickyNotesLayer} from '../src/components/StickyNotesLayer';

function renderNote(fitScale:number,creationZoom:number,viewZoom:number) {
  const note={...createStickyNote(4,20,30,fitScale*creationZoom,creationZoom),id:'created',createdAt:1};
  const html=renderToStaticMarkup(React.createElement(StickyNotesLayer,{
    pageNumber:4,notes:[note],scale:fitScale*viewZoom,isStickyToolActive:false,
    onAddNote:()=>{},onUpdateNote:()=>{},onDeleteNote:()=>{}}));
  return html.match(/data-note-paper=[^>]+style="([^"]+)"/)![1];
}

test('creating portrait paper at any zoom retains its reduced footprint at viewer 100%, including fitted PDFs',()=>{
  for(const fit of [.7,1,1.9,2.42]) for(const creationZoom of [.5,1,1.5,2,4]) {
    const style=renderNote(fit,creationZoom,1);
    assert.ok(Math.abs(Number(style.match(/zoom:([^;]+)/)![1])-.8)<1e-9);
    assert.ok(Math.abs(parseFloat(style.match(/width:([^;]+)/)![1])-224)<1e-9);
    assert.ok(Math.abs(parseFloat(style.match(/height:([^;]+)/)![1])-184)<1e-9);
  }
});

test('paper created at any zoom scales with subsequent viewer zoom and retains its page position',()=>{
  for(const creationZoom of [.5,1,2]) for(const viewZoom of [.5,1,2]) {
    const style=renderNote(1.9,creationZoom,viewZoom);
    assert.ok(Math.abs(Number(style.match(/zoom:([^;]+)/)![1])-viewZoom*.8)<1e-9);
    assert.ok(Math.abs(parseFloat(style.match(/width:([^;]+)/)![1])-224)<1e-9);
    assert.ok(Math.abs(parseFloat(style.match(/height:([^;]+)/)![1])-184)<1e-9);
  }
  const created=createStickyNote(4,20,30,1.9*1.5,1.5);
  assert.ok(Math.abs(created.referenceScale!-1.9)<1e-9);
  assert.equal(created.pageNumber,4);assert.equal(created.x,20);assert.equal(created.y,30);
});
