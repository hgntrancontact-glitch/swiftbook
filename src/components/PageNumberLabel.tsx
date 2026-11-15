import React from 'react';

export function PageNumberLabel({pageNumber}:{pageNumber:number}) {
  // This is a child of the page slot. CSS inherits both committed and live
  // zoom in the same layout transaction as the PDF, including native scroll.
  return <div data-page-label={pageNumber} aria-hidden="true"
    className="absolute z-[50000] bottom-0 left-1/2 -translate-x-1/2 select-none pointer-events-none">
    <div data-page-label-body
      style={{zoom:'calc(var(--pdf-user-zoom, 1) * var(--pdf-live-zoom, 1))',marginBottom:4}}
      className="h-[18px] leading-[18px] min-w-6 text-center text-[10px] text-neutral-400 font-mono tabular-nums bg-white/80 px-1 rounded shadow-2xs">{pageNumber}</div>
  </div>;
}
