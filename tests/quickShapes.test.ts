import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {DrawingStroke} from '../src/types';
import {quickGeometry,quickPoints,moveQuickHandle,translateQuickPoints,hitQuickShape,drawQuickShape} from '../src/utils/quickShapes';
import {TemporaryShapes,type TemporaryShape} from '../src/utils/temporaryShapes';
const shape:DrawingStroke={id:'arrow',createdAt:0,pageNumber:1,quickShape:'arrow',points:[{x:10,y:30},{x:40,y:15},{x:70,y:30}],color:'#ef4444',size:4,opacity:1,referenceScale:1};

test('quadratic middle handle lies on the visible curve and arrow follows the final tangent on different page aspect ratios',()=>{
  for(const [width,height,scale] of [[1000,800,1],[500,1400,.5],[2300,1300,2.3]]) {
    const g=quickGeometry(shape,width,height,scale),c=g.control!;
    assert.ok(Math.abs((g.start.x+2*c.x+g.end.x)/4-width*.4)<1e-9);
    assert.ok(Math.abs((g.start.y+2*c.y+g.end.y)/4-height*.15)<1e-9);
    const vector={x:g.end.x-c.x,y:g.end.y-c.y};
    const back={x:(g.arrow[0].x+g.arrow[2].x)/2-g.end.x,y:(g.arrow[0].y+g.arrow[2].y)/2-g.end.y};
    assert.ok(Math.abs(vector.x*back.y-vector.y*back.x)<1e-7);
    assert.ok(vector.x*back.x+vector.y*back.y<0);
    assert.equal(g.lineWidth,4*scale);
    assert.ok(hitQuickShape(shape,{x:40,y:15},width,height,scale));
    assert.equal(hitQuickShape(shape,{x:40,y:90},width,height,scale),false);
  }
});

test('Shift pins the initial endpoint horizontally; free rectangles retain their top-left anchor',()=>{
  const a={x:10,y:20},b={x:60,y:70};
  for(const kind of ['arrow','line'] as const) {
    const points=quickPoints(kind,a,b,true);
    assert.deepEqual(points[0],a);assert.deepEqual(points[2],{x:60,y:20});
    assert.deepEqual(quickPoints(kind,a,b,false)[2],b);
  }
  assert.deepEqual(quickPoints('rectangle',a,b,true),[a,b]);
  assert.deepEqual(quickPoints('rectangle',a,{x:5,y:15}),[a,a]);
  const edited=moveQuickHandle(shape,1,{x:50,y:60});
  assert.deepEqual(edited[0],shape.points[0]);assert.deepEqual(edited[2],shape.points[2]);assert.deepEqual(edited[1],{x:50,y:60});
  const moved=translateQuickPoints(shape.points,100,-100);
  assert.equal(Math.max(...moved.map(p=>p.x)),100);assert.equal(Math.min(...moved.map(p=>p.y)),0);
});

test('temporary tools expire exactly 3 seconds after release; edits, page changes and other shapes do not restart the deadline',()=>{
  let now=1000,serial=0,latest:TemporaryShape[]=[];
  const jobs=new Map<number,{at:number;run:()=>void}>();
  const store=new TemporaryShapes({now:()=>now,schedule:(run,delay)=>{const id=++serial;jobs.set(id,{at:now+delay,run});return id;},cancel:id=>jobs.delete(id as number),changed:items=>{latest=items;}});
  const advance=(ms:number)=>{now+=ms;for(const [id,job] of [...jobs])if(job.at<=now){jobs.delete(id);job.run();}};
  store.add(shape,'doc-a');advance(2000);store.update(shape.id,{color:'#171717',points:translateQuickPoints(shape.points,5,5)});
  store.add({...shape,id:'second',pageNumber:2},'doc-b');
  assert.equal(latest[0].expiresAt,4000);advance(999);assert.equal(latest.length,2);
  advance(1);assert.deepEqual(latest.map(s=>s.id),['second']);
  store.update(shape.id,{color:'#fff'});assert.equal(latest.length,1);
  advance(2000);assert.equal(latest.length,0);
  store.add(shape,'doc-a');now+=4000;store.prune();assert.equal(latest.length,0);assert.equal(jobs.size,0);
  store.add(shape,'doc-a');store.clear();assert.equal(jobs.size,0);assert.equal(latest.length,0);
});

test('export uses the exact curve, terminal arrowhead and width of the on-page SVG, with dashed shaft and solid head',()=>{
  const calls:{name:string;args:any[]}[]=[];
  const ctx=new Proxy({} as CanvasRenderingContext2D,{get:(_,name)=> (...args:any[])=>calls.push({name:String(name),args}),set:(target,name,value)=>{(target as any)[name]=value;calls.push({name:String(name),args:[value]});return true;}});
  const dashed={...shape,dashStyle:'dashed' as const};
  const g=quickGeometry(dashed,1000,800,1.61);
  drawQuickShape(ctx,dashed,1000,800,1.61);
  assert.deepEqual(calls.find(c=>c.name==='quadraticCurveTo')!.args,[g.control!.x,g.control!.y,g.end.x,g.end.y]);
  assert.deepEqual(calls.filter(c=>c.name==='setLineDash').map(c=>c.args[0]),[[6*1.61,4*1.61],[]]);
  assert.equal(calls.filter(c=>c.name==='stroke').length,2);
  assert.deepEqual(calls.find(c=>c.name==='lineWidth')!.args,[4*1.61]);
});
