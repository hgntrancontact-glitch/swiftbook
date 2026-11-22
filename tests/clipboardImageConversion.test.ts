import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {PDFDocument,PDFName,PDFDict,PDFRawStream,PDFNumber} from 'pdf-lib';
import {convertAnyFileToPdfBytes} from '../src/utils/fileConverter';

test('a thin clipboard screenshot becomes one PDF page at its original aspect ratio, while ordinary uploads retain their defaults',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'Image');
  try {
    for(const [width,height] of [[100,10],[40,100]]) {
      const png=await sharp({create:{width,height,channels:4,background:{r:245,g:196,b:26,alpha:.5}}}).png().toBuffer();
      const source=`data:image/png;base64,${png.toString('base64')}`;
      // Decode boundary only: the converter and both PDF writers/readers below
      // use real PNG bytes. No browser or clipboard is controlled by this test.
      Object.defineProperty(globalThis,'Image',{configurable:true,value:class {
        nodeType=1;nodeName='IMG';naturalWidth=width;naturalHeight=height;
        onload:(()=>void)|null=null;onerror:(()=>void)|null=null;
        set src(_value:string){queueMicrotask(()=>this.onload?.());}get src(){return source;}
        hasAttribute(name:string){return name==='src';}getAttribute(){return source;}
      }});
      const file=new File([new Uint8Array(png)],'clipboard.png',{type:'image/png'});
      const converted=await convertAnyFileToPdfBytes(file,true,{preserveAspectRatio:true}),doc=await PDFDocument.load(converted.bytes);
      assert.equal(doc.getPageCount(),1);assert.equal(converted.fileName,'clipboard.png');
      const page=doc.getPage(0);assert.ok(Math.abs(page.getWidth()/page.getHeight()-width/height)<.00001);
      const images=page.node.Resources()!.lookup(PDFName.of('XObject'),PDFDict);
      const image=doc.context.lookup(images.values()[0]);assert.ok(image instanceof PDFRawStream);
      assert.equal(image.dict.lookup(PDFName.of('Width'),PDFNumber).asNumber(),width);
      assert.equal(image.dict.lookup(PDFName.of('Height'),PDFNumber).asNumber(),height);
      assert.ok(image.dict.has(PDFName.of('SMask'))); // PNG transparency survives the import
      if(width>height) {
        const ordinary=await convertAnyFileToPdfBytes(file),old=await PDFDocument.load(ordinary.bytes);
        assert.equal(old.getPage(0).getHeight(),200);
      }
    }
  } finally {if(descriptor)Object.defineProperty(globalThis,'Image',descriptor);else delete (globalThis as any).Image;}
});
