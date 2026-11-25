import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hasStrokeEndpoints} from '../src/utils/strokeEndpoints';

test('open curves and lines have endpoints while joined paths and recognised closed shapes retain their shape handles',()=>{
  const points=[{x:10,y:10},{x:40,y:5},{x:50,y:30}];
  assert.equal(hasStrokeEndpoints({points}),true);
  assert.equal(hasStrokeEndpoints({points,isSmartShape:true,shapeType:'line'}),true);
  assert.equal(hasStrokeEndpoints({points:[...points,points[0]]}),false);
  assert.equal(hasStrokeEndpoints({points:[points[0]]}),false);
  for(const shapeType of ['circle','ellipse','triangle','rectangle','square','parallelogram','trapezoid']) {
    assert.equal(hasStrokeEndpoints({points,isSmartShape:true,shapeType}),false,shapeType);
  }
  assert.equal(hasStrokeEndpoints({points,quickShape:'arrow'}),false);
});
