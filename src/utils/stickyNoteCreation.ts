import {NOTE_PAPER_COLORS,type TextNoteAnnotation} from '../types';

/** The original default paper is 224 × 160 CSS px when placed. Save the
 * current PDF scale so later zooms remain relative to that creation size. */
export function createStickyNote(pageNumber:number,x:number,y:number,_displayScale:number):Omit<TextNoteAnnotation,'id'|'createdAt'> {
  return {pageNumber,x,y,text:'',referenceScale:1,
    color:NOTE_PAPER_COLORS[0].contentBg,isMinimized:false};
}
