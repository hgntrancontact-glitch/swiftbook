import assert from 'node:assert/strict';
import {test} from 'node:test';
import {WheelGesture,wheelOwner,WorkspaceWheelRouter} from '../src/utils/wheelGesture';

test('diagonal vertical reading ignores horizontal drift throughout momentum',()=>{
  const gesture=new WheelGesture();
  assert.deepEqual(gesture.read(1,2,0),{axis:null,delta:0});
  assert.deepEqual(gesture.read(3,12,10),{axis:'y',delta:14});
  assert.deepEqual(gesture.read(18,2,30),{axis:'y',delta:2});
  assert.deepEqual(gesture.read(30,1,240),{axis:'x',delta:30});
});
test('small oscillations cannot trigger document navigation, and horizontal intent is axis locked',()=>{
  const gesture=new WheelGesture();
  for(let i=0;i<8;i++) assert.equal(gesture.read(i%2?1:-1,.1,i*10).axis,null);
  assert.deepEqual(gesture.read(30,2,100),{axis:'x',delta:30});
  assert.deepEqual(gesture.read(4,30,120),{axis:'x',delta:4});
});
test('horizontal input belongs to a zoomed PDF, including fitting width and overflowing height',()=>{
  for(const documents of [1,2,4]) {
    assert.equal(wheelOwner('x',2,600,1000,documents),'pdf');
    assert.equal(wheelOwner('x',1,1800,1000,documents),'pdf');
    assert.equal(wheelOwner('y',1,600,1000,documents),'pdf');
  }
  assert.equal(wheelOwner('x',1,600,1000,4),'workspace');
  assert.equal(wheelOwner('x',1,600,1000,1),'pdf');
});

test('pinch boundary resets the old axis instead of trapping a subsequent horizontal pan',()=>{
  const gesture=new WheelGesture();
  assert.equal(gesture.read(0,30,0).axis,'y');
  gesture.reset();
  assert.equal(gesture.read(30,0,20).axis,'x');
});

test('a workspace gesture keeps its original PDF across pointer crossings and preserves both pan axes',()=>{
  const router=new WorkspaceWheelRouter<string>();
  assert.equal(router.read(1,2,0,()=> 'pdf-1'),null);
  assert.deepEqual(router.read(3,15,10,()=> 'pdf-2'),{owner:'pdf-1',axis:'y',dx:4,dy:17});
  assert.deepEqual(router.read(12,30,40,()=> 'workspace'),{owner:'pdf-1',axis:'y',dx:12,dy:30});
  assert.deepEqual(router.read(40,1,80,()=> 'pdf-2'),{owner:'pdf-1',axis:'y',dx:40,dy:1});
  assert.equal(router.read(35,1,300,()=> 'workspace')!.owner,'workspace');
  assert.equal(router.read(10,30,330,()=> 'pdf-2')!.owner,'workspace');
  router.reset();
  assert.equal(router.read(10,0,340,()=> 'pdf-2')!.owner,'pdf-2');
});

test('explicit zoom/click ownership survives idle gaps, overrides numeric zoom inference and leaves vertical scrolling in its PDF',()=>{
  const router=new WorkspaceWheelRouter<string>();
  for(const zoom of [.4,1,3]) {
    router.setHorizontalOwner('C');
    assert.equal(router.read(30,1,0,axis=>wheelOwner(axis,zoom,500,1000,4)==='workspace'?'workspace':'C')!.owner,'C');
    assert.equal(router.read(30,0,3000,()=> 'workspace')!.owner,'C');
    router.setHorizontalOwner('workspace');
    assert.equal(router.read(-35,0,3020,()=> 'C')!.owner,'workspace');
    assert.equal(router.read(-35,0,6020,()=> 'C')!.owner,'workspace');
    assert.equal(router.read(0,30,9000,()=> 'C')!.owner,'C');
  }
});

test('closing a PDF releases its persistent pan owner without clearing another document or an explicit navigation choice',()=>{
  const router=new WorkspaceWheelRouter<string>();
  router.setHorizontalOwner('C');router.forgetOwner('B');
  assert.equal(router.read(30,0,0,()=> 'D')!.owner,'C');
  router.forgetOwner('C');assert.equal(router.read(30,0,10,()=> 'D')!.owner,'D');
  router.setHorizontalOwner('workspace');router.forgetOwner('C');
  assert.equal(router.read(30,0,20,()=> 'D')!.owner,'workspace');
});
