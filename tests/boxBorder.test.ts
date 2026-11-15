import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {BoxBorder} from '../src/components/BoxBorder';
import {BoxAnnotationsLayer} from '../src/components/BoxAnnotationsLayer';
import type {BoxAnnotation} from '../src/types';

test('live box border matches the saved SVG at fractional, small and large zooms for every width and style',()=>{
  for(const scale of [.35,.7,1,1.61,2.53,4]) for(const borderWidth of [2,3,4,6]) {
    for(const borderStyle of ['solid','dashed','dotted'] as const) {
      const box:BoxAnnotation={id:'box',createdAt:1,pageNumber:1,x:20,y:30,width:40,height:20,
        borderWidth,borderStyle,color:'#3b82f6',referenceScale:1,fillColor:'#3b82f625'};
      const preview=renderToStaticMarkup(React.createElement(BoxBorder,{...box,scale}));
      const saved=renderToStaticMarkup(React.createElement(BoxAnnotationsLayer,{
        pageNumber:1,boxes:[box],scale,isBoxToolActive:false,
        onAddBox:()=>{},onUpdateBox:()=>{},onDeleteBox:()=>{},
      }));
      assert.ok(saved.includes(preview));
      const width=borderWidth*scale;
      assert.equal(Number(preview.match(/stroke-width="([^"]+)"/)![1]),width);
      assert.equal(Number(preview.match(/<rect x="([^"]+)"/)![1]),width/2);
      if(borderStyle==='dashed') assert.ok(preview.includes(`stroke-dasharray="${6*scale} ${4*scale}"`));
      else if(borderStyle==='dotted') assert.ok(preview.includes(`stroke-dasharray="${width} ${width*1.5}"`));
      else assert.ok(!preview.includes('stroke-dasharray'));
    }
  }
});

test('saved legacy boxes retain their existing reference scale and border defaults',()=>{
  for(const referenceScale of [undefined,1,1.9,3]) {
    const html=renderToStaticMarkup(React.createElement(BoxBorder,{
      borderWidth:0,borderStyle:'solid',color:'',scale:1.61,referenceScale,
    }));
    assert.equal(Number(html.match(/stroke-width="([^"]+)"/)![1]),2*1.61/(referenceScale || 1));
    assert.ok(html.includes('stroke="#ef4444"'));
  }
});
