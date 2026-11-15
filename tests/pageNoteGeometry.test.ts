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
  assert.equal(g.popup.dy+84,g.bridge.dy+1);
});

test('the hover bridge touches the current icon and popup at every zoom and placement',()=>{
  for(const above of [true,false]) for(const zoom of [.5,1,1.5,2.53,4]) for(const offsetX of [-30,0,30]) {
    const iconSize=22*zoom,popupHeight=180*zoom,popupWidth=236*.94*zoom;
    const g=pageNoteGeometry(rect,zoom,above,popupHeight,popupWidth,offsetX);
    const areas=[{x:g.icon.dx,y:g.icon.dy,w:iconSize,h:iconSize},
      {x:g.popup.dx,y:g.popup.dy,w:popupWidth,h:popupHeight},
      {x:g.bridge.dx,y:g.bridge.dy,w:g.bridge.width,h:g.bridge.height}];
    const from={x:g.icon.dx+iconSize/2,y:g.icon.dy+iconSize/2};
    const to={x:g.popup.dx+popupWidth/2,y:g.popup.dy+popupHeight/2};
    const polygon=[...g.bridge.clipPath.matchAll(/(-?[\d.]+)% (-?[\d.]+)%/g)].map(m=>({x:Number(m[1]),y:Number(m[2])}));
    const inBridge=(x:number,y:number)=> {
      const point={x:(x-g.bridge.dx)/g.bridge.width*100,y:(y-g.bridge.dy)/g.bridge.height*100};
      return polygon.every((p,i)=> {
        const q=polygon[(i+1)%polygon.length];
        return (q.x-p.x)*(point.y-p.y)-(q.y-p.y)*(point.x-p.x)>=-1e-6;
      });
    };
    for(let step=0;step<=100;step++) {
      const x=from.x+(to.x-from.x)*step/100,y=from.y+(to.y-from.y)*step/100;
      assert.ok(areas.some((a,i)=>x>=a.x-1e-9 && x<=a.x+a.w+1e-9 && y>=a.y-1e-9 && y<=a.y+a.h+1e-9 && (i!==2 || inBridge(x,y))),
        `no hover gap above=${above} zoom=${zoom} offset=${offsetX} step=${step}`);
    }
  }
});
