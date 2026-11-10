import type { WorkspaceDoc } from '../types';

export function openingPage(savedPage:number|undefined,totalPages:number,freshUpload:boolean):number {
  return freshUpload ? 1 : Math.max(1,Math.min(totalPages,savedPage || 1));
}

// Upload is a deliberate start-from-first-page action. Opening from the library
// or restoring a session preserves progress and all annotation objects.
export function reopenDocument(doc:WorkspaceDoc,freshUpload:boolean):WorkspaceDoc {
  return {...doc,isHidden:false,...(freshUpload ? {currentPage:1,viewportRevision:(doc.viewportRevision || 0)+1} : {})};
}
