import React from 'react';

/** Both note views display the original plain text, including blank lines,
 * indentation and list markers. Never trim or collapse the stored content. */
export function HighlightNoteText({text,className=''}:{text:string;className?:string}) {
  return <p data-highlight-note-text className={`text-[12px] leading-relaxed break-words ${className}`}
    style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{text}</p>;
}
