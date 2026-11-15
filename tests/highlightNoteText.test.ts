import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {HighlightNoteText} from '../src/components/HighlightNoteText';

test('popup and toolbar preserve authored line breaks, empty lines, indentation and plain-text list markers',()=>{
  const text='Đã sửa:\n\n- Icon lớn hơn.\n- Toolbar giữ xuống dòng.\n  Dòng thụt vào.\n\n<giữ nguyên>\n';
  for(const className of ['text-neutral-200','text-neutral-800 max-h-80 overflow-y-auto']) {
    const html=renderToStaticMarkup(React.createElement(HighlightNoteText,{text,className}));
    assert.ok(html.includes('white-space:pre-wrap'));
    assert.ok(html.includes('overflow-wrap:anywhere'));
    assert.ok(html.includes(text.replace('<giữ nguyên>','&lt;giữ nguyên&gt;')));
    assert.ok(!html.includes('<giữ nguyên>'));
  }
});
