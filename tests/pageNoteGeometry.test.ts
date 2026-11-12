import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pageNoteGeometry} from '../src/utils/pageNoteGeometry';

const rect={x:12,y:30,width:74,height:2,rise:-.4};
test('popup, icon and hover bridge keep identical screen coordinates when a pinch is committed',()=>{
  for(const above of [true,false]) for(const target of [.4,.75,1.41,2.26,5]) {
    const live=pageNoteGeometry(rect,1,above,100*.84,224*.84,-10);
    const committed=pageNoteGeometry(rect,target,above,100*.84*target,224*.84*target,-10);
    for(const part of ['icon','popup','bridge'] as const) {
      const before=live[part],after=committed[part];
      assert.equal(before.x,after.x);assert.equal(before.y,after.y);
      assert.ok(Math.abs(before.dx*target-after.dx)<1e-9);
      assert.ok(Math.abs(before.dy*target-after.dy)<1e-9);
    }
  }
});
test('local note geometry stays attached to the right ink edge of a sloping scan line',()=>{
  const g=pageNoteGeometry(rect,1,true,84,188.16);
  assert.equal(g.icon.x,86);assert.equal(g.icon.y,30);
  const below=pageNoteGeometry(rect,1,false,84,188.16);
  assert.equal(below.icon.y,31.6);
  assert.equal(g.popup.dy+84,g.bridge.dy);
});
