import type {TextNoteAnnotation} from '../types';
import {STICKY_NOTE_DESIGN as PAPER} from './stickyNoteDesign';

/** Dimensions are evaluated in untransformed page pixels. A small/portrait
 * page caps both the paper and its controls, before applying minimum sizes. */
export const MIN_NOTE_SIZE=.5,MAX_NOTE_SIZE=3;
export function noteSizeMultiplier(value:number|undefined) {return typeof value==='number' && Number.isFinite(value) && value>0?Math.max(MIN_NOTE_SIZE,Math.min(MAX_NOTE_SIZE,value)):1;}

export function stickyNoteGeometry(note:Pick<TextNoteAnnotation,'x'|'y'|'width'|'height'|'sizeMultiplier'|'dimensionUnit'>,pageWidth:number,pageHeight:number,scale:number) {
  // Keep the accepted portrait footprint; reduce landscape defaults by 15%.
  // Explicit percentage resizes remain authored before applying the size control.
  scale*=pageHeight>pageWidth?.8:pageWidth>pageHeight?.85:1;
  const maxW=Math.max(1,pageWidth*.95),maxH=Math.max(1,pageHeight*.95);
  const paperScale=Math.min(scale,maxW/160,maxH/100);
  const dimension=(stored:number|undefined,base:number,page:number,min:number,max:number)=>{
    const desired=stored && stored>0?(note.dimensionUnit==='percent' || stored<=100?stored/100*page:stored*scale):base*scale;
    const raw=Math.max(min*paperScale,desired);
    return note.dimensionUnit==='percent'?raw:Math.min(max,raw);
  };
  const baseWidth=dimension(note.width,PAPER.width,pageWidth,160,maxW);
  const baseHeight=dimension(note.height,PAPER.height,pageHeight,100,maxH);
  const multiplier=Math.min(noteSizeMultiplier(note.sizeMultiplier),maxW/baseWidth,maxH/baseHeight);
  const width=baseWidth*multiplier,height=baseHeight*multiplier;
  return {width,height,scale:paperScale*multiplier,multiplier,
    x:Math.max(0,Math.min(100-width/pageWidth*100,note.x)),
    y:Math.max(0,Math.min(100-height/pageHeight*100,note.y))};
}
