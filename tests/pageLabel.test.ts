import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PDFPageView} from '../src/components/PDFPageView';

test('page labels keep their screen size outside the zoomed canvas at all document scales',()=>{
  let labelClass='';
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
        const classes=tag[0].match(/class="([^"]*)"/)![1];
        if(labelClass) assert.equal(classes,labelClass);else labelClass=classes;
        assert.ok(classes.includes('h-[18px]') && classes.includes('text-[10px]'));
      }
      parents.push(tag[0]);
    }
    assert.ok(found);
  }
});
