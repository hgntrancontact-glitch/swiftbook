import React from 'react';
import type {BoxAnnotation} from '../types';

type Props=Pick<BoxAnnotation,'borderWidth'|'borderStyle'|'color'|'referenceScale'> & {scale:number};

/** The live preview and saved box share fractional SVG widths and dash spacing. */
export function BoxBorder({borderWidth,borderStyle,color,referenceScale,scale}:Props) {
  const unit=scale/(referenceScale || 1);
  const lineWidth=(borderWidth || 2)*scale/(referenceScale || 1);
  return <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" data-annotation-box-border="true">
    <rect x={lineWidth/2} y={lineWidth/2}
      width={`calc(100% - ${lineWidth}px)`} height={`calc(100% - ${lineWidth}px)`}
      fill="none" stroke={color || '#ef4444'} strokeWidth={lineWidth}
      strokeDasharray={borderStyle==='dashed'?`${6*unit} ${4*unit}`:borderStyle==='dotted'?`${lineWidth} ${lineWidth*1.5}`:undefined} />
  </svg>;
}
