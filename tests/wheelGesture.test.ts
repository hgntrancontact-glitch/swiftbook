import assert from 'node:assert/strict';
import {test} from 'node:test';
import {WheelGesture,wheelOwner} from '../src/utils/wheelGesture';

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
