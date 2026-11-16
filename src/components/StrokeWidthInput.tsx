import React,{useEffect,useState} from 'react';

export const STROKE_SLIDER_MAX=16;

/** Keep an empty draft editable; only finite positive widths reach the drawing. */
export function StrokeWidthInput({value,onChange,...props}:Omit<React.InputHTMLAttributes<HTMLInputElement>,'value'|'onChange'|'type'|'min'|'max'> & {value:number;onChange:(value:number)=>void}) {
  const [draft,setDraft]=useState(String(value));
  useEffect(()=>setDraft(String(value)),[value]);
  return <input {...props} type="number" min={0} step="any" value={draft}
    onChange={event=>{
      const text=event.target.value;setDraft(text);
      const next=Number(text);
      if(text.trim() && Number.isFinite(next) && next>0)onChange(next);
    }} onBlur={event=>{setDraft(String(value));props.onBlur?.(event);}}
    onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();props.onKeyDown?.(event);}}/>;
}
