/** Paper proportions and UI measurements shared by the editor and PDF/image export. */
export const STICKY_NOTE_DESIGN={width:224,height:184,header:32,footer:40,padding:12,radius:12,
  bodyFont:13,lineHeight:19,titleFont:14,icon:14,dot:17,dotGap:4,pageFont:12,separator:2} as const;
export function noteSwatchColor(color:string,selected:boolean):string {
  if(!selected)return color;
  if(color==='#ffde59')return '#eab308';
  const channels=color.slice(1).match(/../g)!;
  return '#'+channels.map(c=>Math.round(parseInt(c,16)*.9).toString(16).padStart(2,'0')).join('');
}
