import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {DrawingCanvas} from '../src/components/DrawingCanvas';
import {annotationCreationScale} from '../src/utils/annotationCreation';

test('freehand and smart pens/highlighters created at different zooms retain the same 100% stroke width',()=>{
  for(const fit of [.7,1,1.9]) for(const creationZoom of [.5,1,2]) for(const viewZoom of [.5,1,2]) {
    const strokes=[false,true].flatMap(isHighlighter=>[false,true].map(isSmartShape=>({
      id:`${isHighlighter}-${isSmartShape}`,pageNumber:1,createdAt:1,
      points:[{x:10,y:20},{x:80,y:20}],color:'#ff0000',size:10,opacity:isHighlighter?.45:1,
      referenceScale:annotationCreationScale(fit*creationZoom,creationZoom),
      isHighlighter,isSmartShape,shapeType:isSmartShape?'line':'freehand',
    })));
    const html=renderToStaticMarkup(React.createElement(DrawingCanvas,{
      pageNumber:1,width:595*fit*viewZoom,height:842*fit*viewZoom,scale:fit*viewZoom,
      strokes,isHighlighter:false,isEraserMode:false,penSize:10,penColor:'#ff0000',isDrawingMode:false,
      onAddStroke:()=>'',onUpdateStroke:()=>{},onDeleteStroke:()=>{},
    }));
    const widths=[...html.matchAll(/stroke="#ff0000" stroke-width="([^"]+)"/g)].map(match=>Number(match[1]));
    assert.ok(widths.length>=4);
    for(const width of widths) assert.ok(Math.abs(width-10*viewZoom)<1e-9);
  }
});
