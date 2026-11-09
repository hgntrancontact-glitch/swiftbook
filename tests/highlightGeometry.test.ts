import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitInkSlope, beginLineGesture, lineSelectionRects, rasterSelectionLines } from '../src/utils/selectionLines';
import { highlightCorners,highlightClip,highlightDisplayRects } from '../src/utils/highlightGeometry';

for(const slope of [-.012,0,.009]) test(`scan ink baseline slope ${slope}`,()=> {
  const ink:{x:number;y:number}[]=[];
  // Dotted leaders and differently sized characters share a baseline.
  for(let x=0;x<900;x+=2) if(x%10<6) for(let dy=0;dy<(x<190?12:3);dy++)
    ink.push({x,y:Math.round(30+slope*x)-dy});
  const fitted=fitInkSlope(ink,900);
  assert.ok(Math.abs(fitted-slope)<.0015,`${fitted} != ${slope}`);
});

test('saved sloping highlights display as padded level rectangles without changing saved data', () => {
  const stored = [{ x: 10, y: 20, width: 75, height: 2.5, rise: -0.6 }];
  const snapshot = structuredClone(stored);
  const [display] = highlightDisplayRects(stored);
  const corners = highlightCorners(display);
  assert.equal(corners[0][1], corners[1][1]);
  assert.equal(corners[2][1], corners[3][1]);
  assert.ok(display.y < stored[0].y);
  assert.ok(display.y + display.height > stored[0].y + stored[0].height);
  assert.equal(highlightClip(display), undefined);
  assert.deepEqual(stored, snapshot);
});

test('mixed fragments on the same row have aligned upper and lower edges', () => {
  const rows = highlightDisplayRects([
    { x: 10, y: 20, width: 20, height: 2 },
    { x: 30, y: 20.15, width: 40, height: 1.7 },
    { x: 10, y: 23, width: 40, height: 2 },
  ]);
  assert.equal(rows[0].y, rows[1].y);
  assert.equal(rows[0].height, rows[1].height);
  assert.ok(rows[2].y > rows[0].y + rows[0].height);
});

test('a chain of overlapping fragments gets one pair of straight row edges',()=> {
  const stored=[{x:10,y:20,width:20,height:2},{x:30,y:20.6,width:20,height:2},{x:50,y:21.2,width:20,height:2}];
  const rows=highlightDisplayRects(stored);
  assert.equal(new Set(rows.map(r=>r.y)).size,1);
  assert.equal(new Set(rows.map(r=>r.height)).size,1);
  assert.ok(rows[0].y<=20-2*.18);
  assert.ok(rows.every(r=>!r.rise));
});

test('padding does not bridge adjacent text lines or escape page boundaries', () => {
  const rows = highlightDisplayRects([
    { x: 10, y: 0, width: 60, height: 2 },
    { x: 10, y: 2.1, width: 40, height: 2 },
    { x: 10, y: 98, width: 40, height: 2 },
  ]);
  assert.equal(rows[0].y, 0);
  assert.ok(rows[0].y + rows[0].height < rows[1].y);
  assert.equal(rows[2].y + rows[2].height, 100);
});

test('manual area highlights retain their chosen bounds', () => {
  const area = [{ x: 5, y: 10, width: 80, height: 35 }];
  assert.deepEqual(highlightDisplayRects(area, false), area);
});

test('cropped sloping selection preserves its baseline and symmetric padding',()=> {
  const line={x:.1,y:.2,width:.8,height:.025,rise:-.006,source:'visual' as const};
  const g=beginLineGesture([line],.3,.21,.02);
  const [r]=lineSelectionRects(g,.3,.7);
  assert.ok(Math.abs(r.rise! - -.003)<1e-9);
  const corners=highlightCorners(r);
  assert.ok(Math.abs(corners[1][1]-corners[0][1]-r.rise!)<1e-9);
  assert.ok(Math.abs((corners[3][1]-corners[0][1])-(line.height-Math.abs(line.rise)+line.height*.16))<1e-9);
  assert.match(highlightClip(r)!,/^polygon\(/);
  // Percentage conversion used for persistence/export preserves all corners.
  const saved={x:r.x*100,y:r.y*100,width:r.width*100,height:r.height*100,rise:r.rise!*100};
  highlightCorners(saved).forEach((p,i)=>p.forEach((v,j)=>assert.ok(Math.abs(v/100-corners[i][j])<1e-9)));
});

test('touching bounds of tilted scan rows are separated before OCR is ready',()=> {
  const width=400,height=600,pixels=new Uint8ClampedArray(width*height*4).fill(255);
  for(const baseline of [110,124,138]) for(let x=40;x<360;x++) if(x%6<3)
    for(let dy=0;dy<(x<120?10:3);dy++) {
      const y=Math.round(baseline-.02*(x-40))-dy,i=(y*width+x)*4;
      pixels[i]=pixels[i+1]=pixels[i+2]=0;
    }
  const previous=globalThis.document;
  globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){},getImageData:()=>({data:pixels})})})} as unknown as Document;
  try {
    const canvas={width,height,dataset:{renderedScale:'1'}} as unknown as HTMLCanvasElement;
    const lines=rasterSelectionLines(canvas,.3,.2,14/height,true);
    assert.equal(lines.length,3);
    assert.ok(lines.every(l=>l.rise!<0));
    assert.ok(lines.every(l=>l.height-Math.abs(l.rise!)<12/height));
  } finally {globalThis.document=previous;}
});
