import {annotationCreationScale} from './annotationCreation';
import {NOTE_PAPER_COLORS,type TextNoteAnnotation} from '../types';

/** New paper is 224 × 184 CSS px at viewer zoom 100%, including fitted PDFs. */
export function createStickyNote(pageNumber:number,x:number,y:number,pageScale:number,userZoom=1):Omit<TextNoteAnnotation,'id'|'createdAt'> {
  return {pageNumber,x,y,text:'',referenceScale:annotationCreationScale(pageScale,userZoom),
    color:NOTE_PAPER_COLORS[0].contentBg,isMinimized:false};
}
