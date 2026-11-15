import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageLabelZoom,snapUiPixel,centeredGlyphSize,sharpenAnnotation} from '../src/utils/annotationSharpness';

test('page numbers grow gently on either side of 100% and stay bounded at extreme zoom',()=>{
  assert.equal(pageLabelZoom(1),1);
  assert.equal(pageLabelZoom(.5),1.15);
  assert.equal(pageLabelZoom(1.5),1.15);
  for(const zoom of [.2,.5,.7,.99,1.01,1.5,2,10,50]) {
    assert.ok(pageLabelZoom(zoom)>1 && pageLabelZoom(zoom)<=1.35);
  }
  assert.ok(Math.abs(pageLabelZoom(.999)-pageLabelZoom(1))<.001);
  assert.equal(pageLabelZoom(NaN),1);
});

test('note positions, dimensions and centred glyphs align at normal and retina density',()=>{
  for(const dpr of [1,1.25,2,3]) for(const zoom of [.5,.73,1,1.5,2.42]) {
    const x=snapUiPixel(381.137,dpr);
    assert.ok(Math.abs(x*dpr-Math.round(x*dpr))<1e-9);
    assert.ok(Math.abs(x-381.137)<=.5/dpr);
    const outer=snapUiPixel(18.5*zoom,dpr),border=snapUiPixel(2*zoom,dpr);
    const glyph=centeredGlyphSize(outer,border,9.5*zoom,dpr);
    const origin=(outer-glyph)/2*dpr;
    assert.ok(Math.abs(origin-Math.round(origin))<1e-9);
  }
});

test('text is rounded from its original design size, without accumulating scale errors',()=>{
  const previous=globalThis.getComputedStyle;
  const style:any={setProperty(key:string,value:string){this[key]=value;}};
  const leaf:any={style,tagName:'P',matches:()=>false,childNodes:[{nodeType:3,textContent:'Ghi chú'}],querySelectorAll:()=>[]};
  globalThis.getComputedStyle=(()=>({fontSize:'11.5px',lineHeight:'17.25px'})) as any;
  try {
    for(const scale of [.85,1.7,.425,.85,1.7,.85]) {
      sharpenAnnotation(leaf,scale,2);
      const rendered=parseFloat(style.fontSize)*scale;
      assert.ok(Math.abs(rendered*2-Math.round(rendered*2))<1e-9);
      assert.ok(Math.abs(rendered-11.5*scale)<=.25);
    }
    assert.equal(parseFloat(style.fontSize)*.85,10);
    assert.equal(style['-webkit-font-smoothing'],'auto');
  } finally {globalThis.getComputedStyle=previous;}
});

test('SVG icons use physical-pixel dimensions and retain visible strokes through repeated zoom',()=>{
  const previous=globalThis.getComputedStyle;
  const attributes:Record<string,string>={width:'13',height:'13','stroke-width':'2'};
  const style:any={setProperty(key:string,value:string){this[key]=value;}};
  const svg:any={style,tagName:'svg',getAttribute:(key:string)=>attributes[key],viewBox:{baseVal:{width:24}},querySelectorAll:()=>[]};
  globalThis.getComputedStyle=(()=>({width:'13px',height:'13px'})) as any;
  try {
    for(const scale of [.85,1.7,.425,.85]) {
      sharpenAnnotation(svg,scale,2);
      const width=parseFloat(style.width)*scale;
      const stroke=Number(style.strokeWidth)*width/24;
      assert.equal(width*2,Math.round(width*2));
      assert.ok(Math.abs(stroke*2-Math.round(stroke*2))<1e-9);
      assert.ok(stroke>=.5);
    }
    assert.equal(parseFloat(style.width)*.85,11);
  } finally {globalThis.getComputedStyle=previous;}
});
