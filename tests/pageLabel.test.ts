import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PDFPageView} from '../src/components/PDFPageView';

test('page label belongs to its page slot and uses its bounded label scale independently of the PDF scale',()=>{
  for(const scale of [.2,.75,1,2.26,5]) {
    const html=renderToStaticMarkup(React.createElement(PDFPageView,{fileId:'label-test',pdfDoc:{numPages:10},pageNumber:2,scale,
      activeTool:'select',penColor:'#000000',penSize:2,highlights:[],textNotes:[],drawings:[],boxes:[],freeTexts:[]} as any));
    const parents:string[]=[];
    let found=false;
    for(const tag of html.matchAll(/<\/?div\b[^>]*>/g)) {
      if(tag[0].startsWith('</')) {parents.pop();continue;}
      if(tag[0].includes('data-page-label=')) {
        found=true;
        assert.ok(parents.at(-1)?.includes('data-pdf-page-slot="true"'));
        assert.ok(!parents.some(parent=>parent.includes('data-page-container="true"')));
        assert.ok(tag[0].includes('bottom-0 left-1/2 -translate-x-1/2'));
      }
      if(tag[0].includes('data-page-label-body=')) {
        assert.ok(tag[0].includes('zoom:var(--pdf-label-zoom, 1)'));
        assert.ok(tag[0].includes('margin-bottom:4px'));
        assert.ok(tag[0].includes('h-[18px]') && tag[0].includes('text-[10px]'));
      }
      parents.push(tag[0]);
    }
    assert.ok(found);
  }
});
