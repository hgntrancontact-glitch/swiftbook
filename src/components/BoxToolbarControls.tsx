import React from 'react';
import {Trash2} from 'lucide-react';
import type {BoxAnnotation,BoxConfig} from '../types';
import {StrokeWidthInput,STROKE_SLIDER_MAX} from './StrokeWidthInput';

const COLORS=['#ef4444','#3b82f6','#22c55e','#eab308','#171717'];
type BoxToolbarPatch=Partial<Pick<BoxAnnotation,'color'|'fillColor'|'borderWidth'>> & {borderStyle?:BoxConfig['borderStyle']};
export function BoxToolbarControls({box,onChange,onDelete}:{box:BoxAnnotation;onChange:(patch:BoxToolbarPatch)=>void;onDelete:()=>void}) {
  const width=box.borderWidth || 2;
  const dashed=box.borderStyle==='dashed';
  const filled=!!box.fillColor && box.fillColor!=='transparent';
  const color=box.color || COLORS[0];
  const progress=Math.max(0,Math.min(100,(width-1)/(STROKE_SLIDER_MAX-1)*100));
  return <>
    <div className="box-toolbar-colors">
      {COLORS.map(c=><button key={c} type="button" className="box-toolbar-color" style={{backgroundColor:c}}
        aria-label={`Màu khung ${c}`} title={`Màu khung ${c}`} aria-pressed={color===c}
        onClick={()=>onChange({color:c,fillColor:filled?`${c}25`:'transparent'})}/>)}
    </div>
    <input className="drawing-size-slider box-toolbar-slider" aria-label="Độ dày viền khung" type="range" min={1} max={STROKE_SLIDER_MAX} step={1} value={Math.min(STROKE_SLIDER_MAX,width)}
      style={{background:`linear-gradient(to right,#f5c41a ${progress}%,#000 ${progress}%)`}}
      onChange={event=>onChange({borderWidth:Number(event.target.value)})}/>
    <label className="box-toolbar-width"><StrokeWidthInput className="box-toolbar-width-input" aria-label="Độ dày viền khung (px)" value={width}
      style={{width:`${Math.max(2,String(width).length)}ch`}} onChange={borderWidth=>onChange({borderWidth})}/><span>px</span></label>
    <button type="button" className="box-toolbar-button" aria-label="Đổi nét viền khung liền hoặc đứt" aria-pressed={dashed}
      title={dashed?'Chuyển sang nét liền':'Chuyển sang nét đứt'} onClick={()=>onChange({borderStyle:dashed?'solid':'dashed'})}>
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" fill="none" stroke="#171717" strokeWidth="1.8" strokeDasharray={dashed?'4 2':undefined}/></svg>
    </button>
    <button type="button" className="box-toolbar-button" aria-label="Bật hoặc tắt nền khung" aria-pressed={filled}
      title={filled?'Bỏ màu nền':'Tô màu nền nhẹ'} onClick={()=>onChange({fillColor:filled?'transparent':`${color}25`})}>
      <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" stroke={color} strokeWidth="3" fill={filled?`${color}25`:'none'}/></svg>
    </button>
    <span className="box-toolbar-divider"/>
    <button type="button" className="box-toolbar-button box-toolbar-delete" title="Xóa khung" aria-label="Xóa khung" onClick={onDelete}><Trash2 size={21} strokeWidth={1.8}/></button>
  </>;
}
