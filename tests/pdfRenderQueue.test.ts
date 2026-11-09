import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PdfRenderQueue } from '../src/utils/pdfRenderQueue';

test('visible work preempts prefetch but cancellation never releases a live GPU slot prematurely',async()=> {
  const frames:(()=>void)[]=[];
  const queue=new PdfRenderQueue(callback=>frames.push(callback),2);
  let preempted=0;
  const background=queue.request(10,()=>preempted++);
  frames.shift()!();const releaseBackground=(await background.promise)!;
  const visible=queue.request(0);
  const neighbour=queue.request(11);
  assert.equal(preempted,1);
  frames.shift()!();const releaseVisible=(await visible.promise)!;
  assert.equal(queue.active,2);
  background.cancel();assert.equal(queue.active,2);
  const latest=queue.request(-1);
  assert.equal(preempted,1);
  releaseBackground();const releaseLatest=(await latest.promise)!;
  assert.equal(queue.active,2);assert.equal(queue.peak,2);
  releaseLatest();assert.equal(queue.active,1);
  releaseVisible();const releaseNeighbour=(await neighbour.promise)!;
  assert.equal(queue.active,1);
  releaseNeighbour();releaseNeighbour();assert.equal(queue.active,0);
});

test('active priorities follow scrolling, and stale queued targets are removed',async()=> {
  const frames:(()=>void)[]=[];
  const queue=new PdfRenderQueue(callback=>frames.push(callback),1);
  let cancelled=0;
  const old=queue.request(0,()=>cancelled++);frames.shift()!();const releaseOld=(await old.promise)!;
  const stale=queue.request(1);stale.cancel();assert.equal(await stale.promise,null);
  const next=queue.request(0);
  old.setPriority(12);assert.equal(cancelled,1);
  assert.equal(queue.active,1);assert.equal(queue.queued,1);
  releaseOld();const releaseNext=(await next.promise)!;
  assert.equal(queue.active,1);releaseNext();assert.equal(queue.active,0);
});
