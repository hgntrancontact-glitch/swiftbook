const fs = require('fs');

const files = [
  {
    path: 'src/components/BoxAnnotationsLayer.tsx',
    type: 'BoxAnnotation',
    addMethod: 'onAddBox',
    arrName: 'boxes',
    dragRefName: 'dragBoxRef',
    startMethodRegex: /const startDragBox = [^{]+\{/,
  }
];
