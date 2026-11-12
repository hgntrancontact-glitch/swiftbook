import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pdfDetailTile, detailCovers, detailViewportTransform } from '../src/utils/pdfDetailTile';
import { rasterDensity } from '../src/utils/pdfRasterCache';

test('226% detail rendering meets retina resolution where the full-page bitmap is capped', () => {
  const previous = globalThis.window;
  globalThis.window = {devicePixelRatio:2} as Window & typeof globalThis;
  try {
    const page = {width:1320,height:750}, scale = 2.26;
    const tile=pdfDetailTile(page,{left:450,top:150,right:1730,bottom:796},scale,2)!;
    assert.equal(tile.density,scale*2);
    assert.ok(tile.density>rasterDensity(page,scale));
    assert.ok(tile.pixelsWide*tile.pixelsHigh<=12_000_000);
    assert.ok(Math.abs(tile.pixelsWide/tile.width-2)<.002);
  } finally {globalThis.window=previous;}
});

test('detail crops are page bounded and high zoom cannot allocate a giant full-page canvas', () => {
  const tile=pdfDetailTile({width:1320,height:750},{left:40000,top:15000,right:41920,bottom:16080},50,3)!;
  assert.ok(tile.pixelsWide*tile.pixelsHigh<=12_000_000);
  assert.ok(tile.width<2304 && tile.height<1536);
  const edge=pdfDetailTile({width:600,height:800},{left:-100,top:-100,right:700,bottom:900},1,2)!;
  assert.equal(edge.x,0);assert.equal(edge.y,0);
  assert.equal(edge.width,600);assert.equal(edge.height,800);
  assert.equal(pdfDetailTile({width:600,height:800},{left:700,top:900,right:800,bottom:1000},1,2),null);
  assert.equal(pdfDetailTile({width:600,height:800},{left:0,top:0,right:0,bottom:0},1,2),null);
});

test('overscan reuses a sharp tile across small pans and rebuilds only beyond its coverage', () => {
  const visible={left:450,top:150,right:1730,bottom:796};
  const tile=pdfDetailTile({width:1320,height:750},visible,2.26,2)!;
  assert.ok(detailCovers(tile,visible));
  assert.ok(detailCovers(tile,{left:460,top:160,right:1740,bottom:806}));
  assert.ok(!detailCovers(tile,{left:650,top:350,right:1930,bottom:996}));
});

test('fractional CSS crops map exactly to integer backing pixels without a text-position shift',()=>{
  const tile=pdfDetailTile({width:1320,height:750},{left:450.13,top:150.71,right:1730.22,bottom:796.33},2.263,1.75)!;
  const [sx,,,sy,dx,dy]=detailViewportTransform(tile);
  const screenX=(source:number)=>(source*sx+dx)/tile.pixelsWide*tile.width+tile.x;
  const screenY=(source:number)=>(source*sy+dy)/tile.pixelsHigh*tile.height+tile.y;
  for(const x of [tile.x,tile.x+tile.width,1000.123]) assert.ok(Math.abs(screenX(x)-x)<1e-9);
  for(const y of [tile.y,tile.y+tile.height,300.123]) assert.ok(Math.abs(screenY(y)-y)<1e-9);
});
