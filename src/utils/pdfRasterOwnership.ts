import {sameRasterScale} from './rasterPresentation';

/** A visible native crop and a full-page headroom render must not replay the
 * same PDF operators concurrently after every zoom. Keep the existing whole
 * page as a preview while the crop owns the current visible target. */
class DetailRasterOwnership {
  private pages=new WeakMap<HTMLElement,{owner:object;scale:number;epoch:string|undefined}>();
  claim(page:HTMLElement,owner:object,scale:number,epoch:string|undefined) {this.pages.set(page,{owner,scale,epoch});}
  release(page:HTMLElement,owner:object) {if(this.pages.get(page)?.owner===owner)this.pages.delete(page);}
  owns(page:HTMLElement|null,scale:number,epoch:string|undefined) {
    const target=page && this.pages.get(page);
    return !!target && target.epoch===epoch && sameRasterScale(target.scale,scale);
  }
}
export const detailRasterOwnership=new DetailRasterOwnership();
