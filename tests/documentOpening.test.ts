import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openingPage,reopenDocument} from '../src/utils/documentOpening';
import type {WorkspaceDoc} from '../src/types';

test('fresh uploads start at page one while session/library opens preserve bounded progress',()=>{
  assert.equal(openingPage(54,92,true),1);
  assert.equal(openingPage(undefined,92,true),1);
  assert.equal(openingPage(54,92,false),54);
  assert.equal(openingPage(416,92,false),92);
  assert.equal(openingPage(undefined,92,false),1);
});

test('re-uploading an open/hidden PDF resets the viewport without losing notes or highlights',()=>{
  const doc={currentPage:54,viewportRevision:2,isHidden:true,highlights:[{id:'highlight'}],textNotes:[{id:'note'}]} as WorkspaceDoc;
  const uploaded=reopenDocument(doc,true);
  assert.equal(uploaded.currentPage,1);assert.equal(uploaded.viewportRevision,3);assert.equal(uploaded.isHidden,false);
  assert.equal(uploaded.highlights,doc.highlights);assert.equal(uploaded.textNotes,doc.textNotes);
  assert.equal(reopenDocument(doc,false).currentPage,54);
  assert.equal(doc.currentPage,54);
});
