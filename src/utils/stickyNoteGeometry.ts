import type {TextNoteAnnotation} from '../types';
import {STICKY_NOTE_DESIGN as PAPER} from './stickyNoteDesign';

/** Dimensions are evaluated in untransformed page pixels. A small/portrait
 * page caps both the paper and its controls, before applying minimum sizes. */
export function stickyNoteGeometry(note:Pick<TextNoteAnnotation,'x'|'y'|'width'|'height'>,pageWidth:number,pageHeight:number,scale:number) {
  // Portrait paper needs a smaller default footprint. Landscape/square pages
  // retain their exact previous measurements; explicit percentage resizes stay authored.
  scale*=pageHeight>pageWidth?.8:1;
  const maxW=Math.max(1,pageWidth*.95),maxH=Math.max(1,pageHeight*.95);
  const paperScale=Math.min(scale,maxW/160,maxH/100);
  const dimension=(stored:number|undefined,base:number,page:number,min:number,max:number)=>{
    const desired=stored && stored>0?(stored<=100?stored/100*page:stored*scale):base*scale;
    return Math.min(max,Math.max(min*paperScale,desired));
  };
  const width=dimension(note.width,PAPER.width,pageWidth,160,maxW);
  const height=dimension(note.height,PAPER.height,pageHeight,100,maxH);
  return {width,height,scale:paperScale,
    x:Math.max(0,Math.min(100-width/pageWidth*100,note.x)),
    y:Math.max(0,Math.min(100-height/pageHeight*100,note.y))};
}
