import {useEffect,useRef,type RefObject} from 'react';

export const FREE_TEXT_CLIPBOARD_TYPE='application/x-swiftbook-text';

export function isClipboardEditor(target:EventTarget|null):boolean {
  const element=target instanceof Element?target:(target as Node|null)?.parentElement;
  if(!element)return false;
  if(element.closest('input,textarea,select'))return true;
  const editable=element.closest('[contenteditable]');
  return Boolean((element as HTMLElement).isContentEditable || (editable && editable.getAttribute('contenteditable')!=='false'));
}

/** Clipboard files must be captured synchronously while the paste event owns
 * the data. Read items first: the files list often represents those same images. */
export function clipboardImages(data:DataTransfer|null):File[] {
  if(!data)return [];
  const images:File[]=[];
  for(const item of Array.from(data.items || [])) {
    if(item.kind!=='file')continue;
    const file=item.getAsFile();
    if(!file)continue;
    const type=file.type || item.type;
    if(type.startsWith('image/'))images.push(file.type?file:new File([file],file.name,{type}));
  }
  return images.length?images:Array.from(data.files || []).filter(file=>file.type.startsWith('image/'));
}

let imageSequence=0;
function freshClipboardFile(file:File):File {
  const subtype=file.type.split('/')[1]?.split('+')[0] || 'png';
  const extension=subtype==='jpeg'?'jpg':subtype.replace(/[^a-z0-9]/gi,'') || 'png';
  // Upload deduplication is intentional for ordinary files. Each paste,
  // including repeated copies of the same image, is a new document instead.
  return new File([file],`Ảnh dán ${Date.now().toString(36)}-${++imageSequence}.${extension}`,{type:file.type,lastModified:file.lastModified});
}

export function useClipboardImageImport(workspaceRef:RefObject<HTMLElement|null>,onImport:(file:File)=>Promise<void>,disabled=false,onError?:(error:unknown)=>void) {
  const latest=useRef({onImport,disabled,onError});latest.current={onImport,disabled,onError};
  const queue=useRef<Promise<void>>(Promise.resolve());
  useEffect(()=>{
    const workspace=workspaceRef.current;if(!workspace)return;
    let mounted=true;
    const focusCanvas=(event:MouseEvent)=>{
      if(latest.current.disabled || (event.button!==0 && event.button!==2) || isClipboardEditor(event.target))return;
      const element=event.target instanceof Element?event.target:null;
      if(element?.closest('button,a[href],[role="button"]'))return;
      const surface=element?.closest<HTMLElement>('[data-page-container]') || workspace;
      if(!surface.hasAttribute('tabindex'))surface.setAttribute('tabindex','-1');
      surface.focus({preventScroll:true});
    };
    const paste=(event:ClipboardEvent)=>{
      if(latest.current.disabled || event.defaultPrevented || isClipboardEditor(event.target) ||
        !(event.target instanceof Node) || !workspace.contains(event.target))return;
      const images=clipboardImages(event.clipboardData);
      if(!images.length)return;
      const files=images.map(freshClipboardFile);
      event.preventDefault();event.stopImmediatePropagation();
      // Serialize separate paste events as well as multiple images in one
      // clipboard. Slow decoding must not reverse document order or focus.
      queue.current=queue.current.then(async()=>{
        for(const file of files) {
          if(!mounted)return;
          try {await latest.current.onImport(file);}
          catch(error) {latest.current.onError?.(error);}
        }
      });
    };
    workspace.addEventListener('pointerdown',focusCanvas);
    workspace.addEventListener('contextmenu',focusCanvas);
    window.addEventListener('paste',paste,true);
    return()=>{mounted=false;workspace.removeEventListener('pointerdown',focusCanvas);workspace.removeEventListener('contextmenu',focusCanvas);window.removeEventListener('paste',paste,true);};
  },[workspaceRef]);
}
