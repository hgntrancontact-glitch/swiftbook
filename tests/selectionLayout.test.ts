import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { beginLineGesture, moveLineGesture, lineSelectionRects, selectedLineText, selectionRegions, selectionLineCovered, type SelectionLine } from '../src/utils/selectionLines';

function line(x: number, y: number, width = 0.27, text = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'): SelectionLine {
  return { x, y, width, height: 0.015, aspect: 0.75, source: 'pdf',
    glyphs: [...text].map((text, i, all) => ({ text, x: x + i * width / all.length, right: x + (i + 1) * width / all.length })) };
}

for (const columns of [1, 2, 3]) for (const reversedStream of [false, true]) for (const backwards of [false, true]) {
  test(`${columns} columns, reversed stream ${reversedStream}, backwards ${backwards}`, () => {
    const lines = Array.from({ length: columns }, (_, column) => Array.from({ length: 6 }, (_, row) =>
      line(0.04 + column * 0.32, 0.15 + row * 0.03, columns === 1 ? 0.8 : 0.27))).flat();
    lines.push(line(0.04, 0.08, 0.9)); // A spanning title cannot bridge the columns.
    if (reversedStream) lines.reverse();
    const x = 0.14 + (columns - 1) * 0.32;
    const gesture = beginLineGesture(lines, x, backwards ? 0.3075 : 0.1875, 0.02);
    moveLineGesture(gesture, backwards ? 0.1875 : 0.3075, x + 0.1);
    const selected = lineSelectionRects(gesture, x, x + 0.1);
    assert.equal(selected.length, 5);
    assert.ok(selected.every(l => l.x >= 0.04 + (columns - 1) * 0.32 - 0.001));
    assert.equal(selectedLineText(gesture, x, x + 0.1).textComplete, true);
  });
}

test('table cells stay in the explicitly selected column', () => {
  const lines = Array.from({ length: 3 }, (_, row) => [line(0.1, 0.2 + row * 0.04, 0.25), line(0.55, 0.2 + row * 0.04, 0.3)]).flat();
  for (const x of [0.17, 0.62]) {
    const gesture = beginLineGesture(lines, x, 0.207, 0.02);
    moveLineGesture(gesture, 0.287, x + 0.1);
    const selected = lineSelectionRects(gesture, x, x + 0.1);
    assert.equal(selected.length, 3);
    assert.ok(selected.every(l => x < 0.5 ? l.x < 0.5 : l.x > 0.5));
  }
});

test('indented list rows and small vertical jitter', () => {
  const lines = [line(0.1, 0.2, 0.7), line(0.15, 0.23, 0.6), line(0.15, 0.26, 0.6)];
  const gesture = beginLineGesture(lines, 0.2, 0.237, 0.02);
  moveLineGesture(gesture, 0.243, 0.4);
  assert.equal(gesture.current, gesture.start);
  moveLineGesture(gesture, 0.267, 0.4);
  assert.equal(lineSelectionRects(gesture, 0.2, 0.4).length, 2);
});

test('unrecognized rows remain selectable without invented text', () => {
  const lines = [line(0.1, 0.2), { x: 0.1, y: 0.23, width: 0.27, height: 0.015, source: 'visual' as const }, line(0.1, 0.26)];
  const gesture = beginLineGesture(lines, 0.15, 0.207, 0.02);
  moveLineGesture(gesture, 0.267, 0.3);
  assert.equal(lineSelectionRects(gesture, 0.15, 0.3).length, 3);
  const saved = selectedLineText(gesture, 0.15, 0.3);
  assert.equal(saved.textComplete, false);
  assert.ok(saved.text.includes('\n\n'));
});


test('tagged table cells remain separate even with narrow gutters', () => {
  const lines = Array.from({ length: 3 }, (_, row) => [
    { ...line(0.1,0.2+row*0.03,0.29),cell:'left-cell',block:'left-paragraph' },
    { ...line(0.395,0.2+row*0.03,0.29),cell:'right-cell',block:'right-paragraph' },
  ]).flat();
  const gesture=beginLineGesture(lines,0.5,0.207,0.02);
  moveLineGesture(gesture,0.267,0.6);
  const rects=lineSelectionRects(gesture,0.5,0.6);
  assert.equal(rects.length,3);
  assert.ok(rects.every(l=>l.cell==='right-cell'));
});


test('explicit selection from a spanning heading into a column follows page order', () => {
  const heading=line(0.05,0.1,0.9);
  const left=[line(0.05,0.2,0.3),line(0.05,0.23,0.3)];
  const right=[line(0.55,0.2,0.3),line(0.55,0.23,0.3)];
  const gesture=beginLineGesture([heading,...left,...right],0.2,0.107,0.02);
  moveLineGesture(gesture,0.237,0.25);
  const rects=lineSelectionRects(gesture,0.2,0.25);
  assert.equal(rects.length,3);
  assert.equal(rects[0].y,heading.y);
  assert.ok(rects.slice(1).every(l=>l.x<0.5));
});


test('one mixed-font row with a wide word gap is not a separate column', () => {
  const lines=[line(0.08,0.2,0.35),line(0.5,0.2,0.1),line(0.08,0.25,0.7),line(0.08,0.3,0.7)];
  assert.equal(selectionRegions(lines).length,1);
});


test('a fallback row spanning known native columns cannot bridge their gutter', () => {
  const native=[line(0.05,0.2,0.2),line(0.5,0.2,0.2)];
  assert.equal(selectionLineCovered({x:0.05,y:0.2,width:0.65,height:0.015,source:'visual'},native),true);
  assert.equal(selectionLineCovered({x:0.1,y:0.4,width:0.6,height:0.015,source:'visual'},native),false);
});


for (const fixture of JSON.parse(readFileSync(new URL('./selectionCards.fixture.json',import.meta.url),'utf8'))) {
  test(`independent cards with heading/footer, measured PDF page ${fixture.page}`, () => {
    const lines: SelectionLine[]=fixture.lines;
    const first=lines[fixture.target[0]],last=lines[fixture.target.at(-1)];
    const regions=selectionRegions(lines);
    const region=regions.find(r=>r.includes(first))!;
    assert.ok(fixture.target.every(i=>region.includes(lines[i])));
    const gesture=beginLineGesture(lines,first.x+first.width*0.1,first.y+first.height/2,0.02);
    moveLineGesture(gesture,last.y+last.height/2,last.x+last.width*.9);
    const selected=lineSelectionRects(gesture,first.x+first.width*.1,last.x+last.width*.9);
    assert.equal(selected.length,fixture.target.length);
    assert.ok(selected.every(l=>fixture.target.some(i=>Math.abs(lines[i].y-l.y)<0.00001)));
  });
}


test('a wrapped scan row cannot select the rest of the page when its region changes', () => {
 const fixture=JSON.parse(readFileSync(new URL('./selectionScan.fixture.json',import.meta.url),'utf8'));
 const lines:SelectionLine[]=fixture.lines,[a,b]=fixture.target,first=lines[a],last=lines[b];
 for(const reverse of [false,true]) {
  const start=reverse?last:first,end=reverse?first:last;
  const sx=start.x+start.width*(reverse?.8:.1),ex=end.x+end.width*(reverse?.1:.8);
  const gesture=beginLineGesture(lines,sx,start.y+start.height/2,.02);
  moveLineGesture(gesture,end.y+end.height/2,ex);
  const rects=lineSelectionRects(gesture,sx,ex);
  assert.equal(rects.length,2);
  assert.ok(rects.every(l=>Math.abs(l.y-first.y)<.00001 || Math.abs(l.y-last.y)<.00001));
 }
});
